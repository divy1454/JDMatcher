import { db } from '../db/index.js';
import { organizations, tokenConsumptionLedger, platformSettings } from '../db/schema.js';
import { eq, sql, and, gte } from 'drizzle-orm';

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
    usage: TokenUsage
  ): Promise<BillingResult> {
    const rawCost = this.calculateRawCost(usage.inputTokens, usage.outputTokens);

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
    const billedCost = Number((rawCost * multiplier).toFixed(6));
    const currentBilled = parseFloat(org.totalBilledAmount);
    const newTotalBilled = Number((currentBilled + billedCost).toFixed(4));
    const depositLimit = parseFloat(org.securityDepositLimit);

    // Atomic transaction: Insert into ledger and update organization billed amount
    await db.transaction(async (tx) => {
      await tx.insert(tokenConsumptionLedger).values({
        organizationId,
        recruiterId,
        inputTokens: usage.inputTokens,
        outputTokens: usage.outputTokens,
        totalTokens: usage.inputTokens + usage.outputTokens,
        rawCostUsd: rawCost.toFixed(6),
        profitMultiplier: multiplier.toFixed(2),
        billedCostUsd: billedCost.toFixed(6),
        latencyMs: usage.latencyMs,
        modelName: usage.modelName || 'gemini-3.5-flash-lite',
      });

      await tx
        .update(organizations)
        .set({
          totalBilledAmount: newTotalBilled.toFixed(4),
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, organizationId));
    });

    return {
      rawCostUsd: rawCost,
      profitMultiplier: multiplier,
      billedCostUsd: billedCost,
      totalBilledAmountAfter: newTotalBilled,
      securityDepositLimit: depositLimit,
    };
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
      // Reset the billed amount
      await tx
        .update(organizations)
        .set({
          totalBilledAmount: '0.0000',
          updatedAt: new Date(),
        })
        .where(eq(organizations.id, organizationId));

      // Record audit trail entry in platform_settings
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

  static async getTelemetryStats(timeframe: '1h' | '24h' | '7d' | '30d' = '24h') {
    const now = new Date();
    const timeframeMs = {
      '1h': 60 * 60 * 1000,
      '24h': 24 * 60 * 60 * 1000,
      '7d': 7 * 24 * 60 * 60 * 1000,
      '30d': 30 * 24 * 60 * 60 * 1000,
    }[timeframe];

    const sinceDate = new Date(now.getTime() - timeframeMs);

    // Aggregates over the timeframe
    const aggregateQuery = await db
      .select({
        totalEvaluations: sql<number>`count(*)`,
        totalRawCost: sql<number>`coalesce(sum(raw_cost_usd), 0)`,
        totalBilledCost: sql<number>`coalesce(sum(billed_cost_usd), 0)`,
        avgLatencyMs: sql<number>`coalesce(avg(latency_ms), 0)`,
        totalTokens: sql<number>`coalesce(sum(total_tokens), 0)`,
      })
      .from(tokenConsumptionLedger)
      .where(gte(tokenConsumptionLedger.timestamp, sinceDate));

    // Time-series breakdown for Recharts Area Chart
    const timeSeries = await db
      .select({
        timestamp: tokenConsumptionLedger.timestamp,
        rawCost: tokenConsumptionLedger.rawCostUsd,
        billedCost: tokenConsumptionLedger.billedCostUsd,
        latencyMs: tokenConsumptionLedger.latencyMs,
      })
      .from(tokenConsumptionLedger)
      .where(gte(tokenConsumptionLedger.timestamp, sinceDate))
      .orderBy(tokenConsumptionLedger.timestamp);

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
      timeSeries: timeSeries.map((t) => ({
        timestamp: t.timestamp.toISOString(),
        rawCost: parseFloat(t.rawCost),
        billedCost: parseFloat(t.billedCost),
        profit: Number((parseFloat(t.billedCost) - parseFloat(t.rawCost)).toFixed(4)),
        latencyMs: t.latencyMs,
      })),
    };
  }
}
