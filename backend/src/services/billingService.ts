import { db } from '../db/index.js';
import { organizations, tokenConsumptionLedger, platformSettings, invoices } from '../db/schema.js';
import { eq, sql, and, gte, inArray } from 'drizzle-orm';

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  latencyMs: number;
  modelName?: string;
  isSimulated?: boolean;
}

export interface BillingResult {
  rawCostUsd: number;
  profitMultiplier: number;
  billedCostUsd: number;
  totalBilledAmountAfter: number;
  securityDepositLimit: number;
}

export class BillingService {
  // Input: $0.30 per 1M tokens ($0.0000003 / token)
  // Output: $2.50 per 1M tokens ($0.0000025 / token)
  private static readonly INPUT_PRICE_PER_M = 0.30;
  private static readonly OUTPUT_PRICE_PER_M = 2.50;

  static calculateRawCost(inputTokens: number, outputTokens: number): number {
    const inputCost = (inputTokens / 1_000_000) * this.INPUT_PRICE_PER_M;
    const outputCost = (outputTokens / 1_000_000) * this.OUTPUT_PRICE_PER_M;
    return Number((inputCost + outputCost).toFixed(6));
  }

  static async recordEvaluationConsumption(
    organizationId: string,
    recruiterId: string,
    usage: TokenUsage,
    actionType: 'eval' | 'resume_analysis' | 'autofill_resolve' = 'eval'
  ): Promise<BillingResult> {
    // 1. Real provider raw cost (paid to Google Gemini at 1x)
    const rawCost = this.calculateRawCost(usage.inputTokens, usage.outputTokens);

    // 2. Token multiplier: resume analysis consumes 3x billed tokens for stealth premium pricing
    const tokenMultiplier = actionType === 'resume_analysis' ? 3 : 1;
    const billedInputTokens = Math.round(usage.inputTokens * tokenMultiplier);
    const billedOutputTokens = Math.round(usage.outputTokens * tokenMultiplier);
    const billedTotalTokens = billedInputTokens + billedOutputTokens;

    // 3. Client raw base cost (prior to agency profit multiplier)
    const clientRawCost = this.calculateRawCost(billedInputTokens, billedOutputTokens);

    // Retrieve organization multiplier and deposit limit
    const [org] = await db
      .select({
        profitMultiplier: organizations.profitMultiplier,
        totalBilledAmount: organizations.totalBilledAmount,
        securityDepositLimit: organizations.securityDepositLimit,
      })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    const multiplier = parseFloat(org.profitMultiplier);
    const billedCost = Number((clientRawCost * multiplier).toFixed(6));
    const depositLimit = parseFloat(org.securityDepositLimit);
    let updatedTotalBilled = parseFloat(org.totalBilledAmount) + billedCost;

    // Atomic transaction: Insert into ledger and atomically increment organization billed amount
    await db.transaction(async (tx) => {
      await tx.insert(tokenConsumptionLedger).values({
        organizationId,
        recruiterId,
        inputTokens: billedInputTokens,
        outputTokens: billedOutputTokens,
        totalTokens: billedTotalTokens,
        rawCostUsd: rawCost.toFixed(6), // Real 1x provider cost for accurate Super Admin margins
        profitMultiplier: multiplier.toFixed(2),
        billedCostUsd: billedCost.toFixed(6),
        latencyMs: usage.latencyMs,
        modelName: usage.modelName || 'gemini-3.5-flash-lite',
        actionType,
      });

      // Atomic SQL increment prevents concurrency race conditions across recruiters
      const [updatedOrg] = await tx
        .update(organizations)
        .set({
          totalBilledAmount: sql`${organizations.totalBilledAmount} + ${billedCost.toFixed(4)}::numeric`,
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, organizationId))
        .returning({ totalBilledAmount: organizations.totalBilledAmount });

      if (updatedOrg) {
        updatedTotalBilled = parseFloat(updatedOrg.totalBilledAmount);
      }
    });

    return {
      rawCostUsd: rawCost,
      profitMultiplier: multiplier,
      billedCostUsd: billedCost,
      totalBilledAmountAfter: Number(updatedTotalBilled.toFixed(4)),
      securityDepositLimit: depositLimit,
    };
  }

  /**
   * Recalculates exact outstanding deposit usage for an organization:
   * (Unpaid invoices + unbilled ongoing token ledger consumption)
   */
  static async recalculateOrgBilledAmount(organizationId: string): Promise<number> {
    const orgInvoices = await db
      .select({
        billingMonth: invoices.billingMonth,
        status: invoices.status,
        totalAmountUsd: invoices.totalAmountUsd,
      })
      .from(invoices)
      .where(eq(invoices.organizationId, organizationId));

    const invoiceMonthMap = new Map<string, { status: string; totalAmountUsd: number }>();
    let unpaidInvoicesTotal = 0;
    for (const inv of orgInvoices) {
      const amt = parseFloat(inv.totalAmountUsd) || 0;
      invoiceMonthMap.set(inv.billingMonth, { status: inv.status, totalAmountUsd: amt });
      if (inv.status !== 'paid' && inv.status !== 'void') {
        unpaidInvoicesTotal += amt;
      }
    }

    const ledgerAggregates = await db
      .select({
        monthStr: sql<string>`to_char(${tokenConsumptionLedger.timestamp}, 'YYYY-MM')`,
        totalCostUsd: sql<number>`coalesce(sum(${tokenConsumptionLedger.billedCostUsd}), 0)::float`,
      })
      .from(tokenConsumptionLedger)
      .where(eq(tokenConsumptionLedger.organizationId, organizationId))
      .groupBy(sql`to_char(${tokenConsumptionLedger.timestamp}, 'YYYY-MM')`);

    let unbilledLedgerTotal = 0;
    for (const l of ledgerAggregates) {
      if (!invoiceMonthMap.has(l.monthStr)) {
        unbilledLedgerTotal += l.totalCostUsd;
      }
    }

    const outstandingTotal = Number((unpaidInvoicesTotal + unbilledLedgerTotal).toFixed(4));

    await db
      .update(organizations)
      .set({
        totalBilledAmount: outstandingTotal.toFixed(4),
        updatedAt: new Date(),
      })
      .where(eq(organizations.id, organizationId));

    return outstandingTotal;
  }

  static async markAsPaid(organizationId: string, triggeredBy?: string): Promise<{ success: boolean; previousBilled: string; auditTimestamp: string }> {
    const [org] = await db
      .select({ totalBilledAmount: organizations.totalBilledAmount, name: organizations.name })
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    const previousBilled = org.totalBilledAmount;
    const auditTimestamp = new Date().toISOString();

    await db.transaction(async (tx) => {
      // 1. Reset the billed amount on the organization
      await tx
        .update(organizations)
        .set({
          totalBilledAmount: '0.0000',
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, organizationId));

      // 2. Mark any outstanding / generated / pending invoices as paid so all screens stay in 100% sync!
      await tx
        .update(invoices)
        .set({
          status: 'paid',
          paidAt: new Date(),
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(invoices.organizationId, organizationId),
            inArray(invoices.status, ['generated', 'pending', 'overdue'])
          )
        );

      // 3. Record audit trail entry in platform_settings
      const auditKey = `PAYMENT_AUDIT_${organizationId}_${Date.now()}`;
      await tx.insert(platformSettings).values({
        key: auditKey,
        value: JSON.stringify({
          action: 'mark_paid',
          organizationId,
          organizationName: org.name,
          previousBilledAmount: previousBilled,
          resetTo: '0.0000',
          triggeredBy: triggeredBy || 'unknown',
          timestamp: auditTimestamp,
        }),
        description: `Payment audit: ${org.name} balance reset from $${previousBilled} to $0.00`,
        updatedAt: new Date(),
      });
    });

    console.log(`[AUDIT] mark-paid: org=${organizationId} (${org.name}), previousBilled=$${previousBilled}, triggeredBy=${triggeredBy || 'unknown'}, at=${auditTimestamp}`);

    return { success: true, previousBilled, auditTimestamp };
  }

  static async getTelemetryStats(timeframe: '1h' | '24h' | '7d' | '30d' | 'all' = '24h', organizationId?: string) {
    const conditions = [];

    if (timeframe !== 'all') {
      const now = new Date();
      const timeframeMs = {
        '1h': 60 * 60 * 1000,
        '24h': 24 * 60 * 60 * 1000,
        '7d': 7 * 24 * 60 * 60 * 1000,
        '30d': 30 * 24 * 60 * 60 * 1000,
      }[timeframe];

      const sinceDate = new Date(now.getTime() - timeframeMs);
      conditions.push(gte(tokenConsumptionLedger.timestamp, sinceDate));
    }

    if (organizationId) {
      conditions.push(eq(tokenConsumptionLedger.organizationId, organizationId));
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    // Aggregates over the timeframe
    const aggregateQuery = await (whereClause
      ? db.select({
          totalEvaluations: sql<number>`count(*)`,
          totalRawCost: sql<number>`coalesce(sum(raw_cost_usd), 0)`,
          totalBilledCost: sql<number>`coalesce(sum(billed_cost_usd), 0)`,
          avgLatencyMs: sql<number>`coalesce(avg(latency_ms), 0)`,
          totalTokens: sql<number>`coalesce(sum(total_tokens), 0)`,
        }).from(tokenConsumptionLedger).where(whereClause)
      : db.select({
          totalEvaluations: sql<number>`count(*)`,
          totalRawCost: sql<number>`coalesce(sum(raw_cost_usd), 0)`,
          totalBilledCost: sql<number>`coalesce(sum(billed_cost_usd), 0)`,
          avgLatencyMs: sql<number>`coalesce(avg(latency_ms), 0)`,
          totalTokens: sql<number>`coalesce(sum(total_tokens), 0)`,
        }).from(tokenConsumptionLedger));

    // Breakdown by actionType (regular eval vs resume_analysis)
    const breakdownQuery = await (whereClause
      ? db.select({
          actionType: tokenConsumptionLedger.actionType,
          count: sql<number>`count(*)::int`,
          rawCost: sql<number>`coalesce(sum(raw_cost_usd), 0)::float`,
          billedCost: sql<number>`coalesce(sum(billed_cost_usd), 0)::float`,
          tokens: sql<number>`coalesce(sum(total_tokens), 0)::int`,
        }).from(tokenConsumptionLedger).where(whereClause).groupBy(tokenConsumptionLedger.actionType)
      : db.select({
          actionType: tokenConsumptionLedger.actionType,
          count: sql<number>`count(*)::int`,
          rawCost: sql<number>`coalesce(sum(raw_cost_usd), 0)::float`,
          billedCost: sql<number>`coalesce(sum(billed_cost_usd), 0)::float`,
          tokens: sql<number>`coalesce(sum(total_tokens), 0)::int`,
        }).from(tokenConsumptionLedger).groupBy(tokenConsumptionLedger.actionType));

    let evalCount = 0;
    let evalBilledCost = 0;
    let evalRawCost = 0;
    let evalTokens = 0;

    let resumeAnalysisCount = 0;
    let resumeAnalysisBilledCost = 0;
    let resumeAnalysisRawCost = 0;
    let resumeAnalysisTokens = 0;

    let autofillCount = 0;
    let autofillBilledCost = 0;
    let autofillRawCost = 0;
    let autofillTokens = 0;

    for (const b of breakdownQuery) {
      if (b.actionType === 'resume_analysis') {
        resumeAnalysisCount = b.count;
        resumeAnalysisBilledCost = Number(b.billedCost.toFixed(4));
        resumeAnalysisRawCost = Number(b.rawCost.toFixed(4));
        resumeAnalysisTokens = b.tokens;
      } else if (b.actionType === 'autofill_resolve') {
        autofillCount = b.count;
        autofillBilledCost = Number(b.billedCost.toFixed(4));
        autofillRawCost = Number(b.rawCost.toFixed(4));
        autofillTokens = b.tokens;
      } else {
        evalCount += b.count;
        evalBilledCost += Number(b.billedCost.toFixed(4));
        evalRawCost += Number(b.rawCost.toFixed(4));
        evalTokens += b.tokens;
      }
    }

    // Time-series breakdown for Recharts Area Chart
    const timeSeries = await (whereClause
      ? db.select({
          timestamp: tokenConsumptionLedger.timestamp,
          rawCost: tokenConsumptionLedger.rawCostUsd,
          billedCost: tokenConsumptionLedger.billedCostUsd,
          latencyMs: tokenConsumptionLedger.latencyMs,
          actionType: tokenConsumptionLedger.actionType,
        }).from(tokenConsumptionLedger).where(whereClause).orderBy(tokenConsumptionLedger.timestamp)
      : db.select({
          timestamp: tokenConsumptionLedger.timestamp,
          rawCost: tokenConsumptionLedger.rawCostUsd,
          billedCost: tokenConsumptionLedger.billedCostUsd,
          latencyMs: tokenConsumptionLedger.latencyMs,
          actionType: tokenConsumptionLedger.actionType,
        }).from(tokenConsumptionLedger).orderBy(tokenConsumptionLedger.timestamp));

    const stats = aggregateQuery[0] || {
      totalEvaluations: 0,
      totalRawCost: 0,
      totalBilledCost: 0,
      avgLatencyMs: 0,
      totalTokens: 0,
    };

    const profitMargin = Number(stats.totalBilledCost) - Number(stats.totalRawCost);

    return {
      timeframe,
      totalEvaluations: Number(stats.totalEvaluations),
      totalRawCostUsd: Number(Number(stats.totalRawCost).toFixed(4)),
      totalBilledCostUsd: Number(Number(stats.totalBilledCost).toFixed(4)),
      profitMarginUsd: Number(profitMargin.toFixed(4)),
      avgLatencyMs: Math.round(Number(stats.avgLatencyMs)),
      totalTokens: Number(stats.totalTokens),
      resumeAnalysis: {
        count: resumeAnalysisCount,
        billedCostUsd: resumeAnalysisBilledCost,
        rawCostUsd: resumeAnalysisRawCost,
        profitMarginUsd: Number((resumeAnalysisBilledCost - resumeAnalysisRawCost).toFixed(4)),
        tokens: resumeAnalysisTokens,
      },
      autofillResolve: {
        count: autofillCount,
        billedCostUsd: autofillBilledCost,
        rawCostUsd: autofillRawCost,
        profitMarginUsd: Number((autofillBilledCost - autofillRawCost).toFixed(4)),
        tokens: autofillTokens,
      },
      regularEval: {
        count: evalCount,
        billedCostUsd: evalBilledCost,
        rawCostUsd: evalRawCost,
        profitMarginUsd: Number((evalBilledCost - evalRawCost).toFixed(4)),
        tokens: evalTokens,
      },
      timeSeries: timeSeries.map((t) => ({
        timestamp: t.timestamp.toISOString(),
        rawCost: parseFloat(t.rawCost),
        billedCost: parseFloat(t.billedCost),
        profit: Number((parseFloat(t.billedCost) - parseFloat(t.rawCost)).toFixed(4)),
        latencyMs: t.latencyMs,
        actionType: t.actionType || 'eval',
      })),
    };
  }
}
