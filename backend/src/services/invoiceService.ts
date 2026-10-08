import { db } from '../db/index.js';
import { invoices, organizations, users, tokenConsumptionLedger, Invoice } from '../db/schema.js';
import { eq, and, sql, desc, gte, lte } from 'drizzle-orm';
import { BillingService } from './billingService.js';

export interface MonthlyExpenseItem {
  billingMonth: string; // '2026-09'
  monthLabel: string; // 'September 2026'
  periodStart: string;
  periodEnd: string;
  totalEvaluations: number;
  totalTokens: number;
  totalAmountUsd: number;
  totalAmountInr: number;
  exchangeRateInr: number;
  status: 'PAID' | 'PAYMENT_DUE' | 'UNBILLED';
  isBillGenerated: boolean;
  invoice: {
    id: string;
    invoiceNumber: string;
    status: string;
    isGenerated: boolean;
    dueDate: string;
    issueDate: string;
    paidAt: string | null;
  } | null;
  canDownload: boolean;
}

export interface InvoiceLineItem {
  id: string;
  category: string;
  description: string;
  quantity: number;
  unit: string;
  unitPriceUsd: number;
  totalUsd: number;
}

const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December'
];

export class InvoiceService {
  public static readonly DEFAULT_UPI_ID = '8999911999-2@ybl';
  public static readonly OWNER_NAME = 'Divy Patel';
  public static readonly OWNER_PHONE = '+91 8999911999';
  public static readonly OWNER_EMAIL = 'divy9954@gmail.com';
  public static readonly DEFAULT_USD_TO_INR_RATE = 86.50;

  static formatMonthLabel(yearMonth: string): string {
    const [yearStr, monthStr] = yearMonth.split('-');
    const monthIdx = parseInt(monthStr, 10) - 1;
    return `${MONTH_NAMES[monthIdx] || monthStr} ${yearStr}`;
  }

  /**
   * Retrieves monthly expense tracking for an agency.
   * Merges ledger telemetry with invoice generation states.
   */
  static async getAgencyMonthlyExpenses(organizationId: string): Promise<MonthlyExpenseItem[]> {
    // 1. Fetch all invoices for this organization
    const orgInvoices = await db
      .select()
      .from(invoices)
      .where(eq(invoices.organizationId, organizationId))
      .orderBy(desc(invoices.billingMonth));

    const invoiceMap = new Map<string, Invoice>();
    for (const inv of orgInvoices) {
      invoiceMap.set(inv.billingMonth, inv);
    }

    // 2. Aggregate token ledger consumption by month
    const ledgerAggregates = await db
      .select({
        monthStr: sql<string>`to_char(${tokenConsumptionLedger.timestamp}, 'YYYY-MM')`,
        totalEvaluations: sql<number>`count(${tokenConsumptionLedger.id})::int`,
        totalTokens: sql<number>`coalesce(sum(${tokenConsumptionLedger.totalTokens}), 0)::int`,
        totalCostUsd: sql<number>`coalesce(sum(${tokenConsumptionLedger.billedCostUsd}), 0)::float`,
      })
      .from(tokenConsumptionLedger)
      .where(eq(tokenConsumptionLedger.organizationId, organizationId))
      .groupBy(sql`to_char(${tokenConsumptionLedger.timestamp}, 'YYYY-MM')`)
      .orderBy(desc(sql`to_char(${tokenConsumptionLedger.timestamp}, 'YYYY-MM')`));

    // Combine distinct months from invoices and ledger
    const allMonths = Array.from(
      new Set([...orgInvoices.map((i) => i.billingMonth), ...ledgerAggregates.map((l) => l.monthStr)])
    ).sort((a, b) => b.localeCompare(a)); // Descending

    const results: MonthlyExpenseItem[] = allMonths.map((month) => {
      const inv = invoiceMap.get(month);
      const ledger = ledgerAggregates.find((l) => l.monthStr === month);

      const [year, m] = month.split('-').map(Number);
      const periodStart = new Date(Date.UTC(year, m - 1, 1)).toISOString();
      const periodEnd = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999)).toISOString();

      if (inv) {
        const isPaid = inv.status === 'paid';
        const isGen = inv.isGenerated;
        let displayStatus: 'PAID' | 'PAYMENT_DUE' | 'UNBILLED' = 'UNBILLED';
        if (isPaid) {
          displayStatus = 'PAID';
        } else if (isGen) {
          displayStatus = 'PAYMENT_DUE';
        }

        return {
          billingMonth: month,
          monthLabel: this.formatMonthLabel(month),
          periodStart: inv.periodStart.toISOString(),
          periodEnd: inv.periodEnd.toISOString(),
          totalEvaluations: inv.totalEvaluations,
          totalTokens: inv.totalTokens,
          totalAmountUsd: parseFloat(inv.totalAmountUsd),
          totalAmountInr: parseFloat(inv.totalAmountInr),
          exchangeRateInr: parseFloat(inv.exchangeRateInr),
          status: displayStatus,
          isBillGenerated: isGen,
          invoice: {
            id: inv.id,
            invoiceNumber: inv.invoiceNumber,
            status: inv.status,
            isGenerated: inv.isGenerated,
            dueDate: inv.dueDate.toISOString(),
            issueDate: inv.issueDate.toISOString(),
            paidAt: inv.paidAt ? inv.paidAt.toISOString() : null,
          },
          // Invoice download button is available ONLY if super admin has generated the bill!
          canDownload: isGen,
        };
      }

      // Ledger only, no invoice created yet
      const evals = ledger ? ledger.totalEvaluations : 0;
      const tokens = ledger ? ledger.totalTokens : 0;
      const costUsd = ledger ? Number(ledger.totalCostUsd.toFixed(4)) : 0;
      const costInr = Number((costUsd * this.DEFAULT_USD_TO_INR_RATE).toFixed(2));

      return {
        billingMonth: month,
        monthLabel: this.formatMonthLabel(month),
        periodStart,
        periodEnd,
        totalEvaluations: evals,
        totalTokens: tokens,
        totalAmountUsd: costUsd,
        totalAmountInr: costInr,
        exchangeRateInr: this.DEFAULT_USD_TO_INR_RATE,
        status: 'UNBILLED',
        isBillGenerated: false,
        invoice: null,
        canDownload: false, // Super admin hasn't generated bill yet
      };
    });

    return results;
  }

  /**
   * Retrieves full Real-life Business Level Invoice by ID with UPI payment deep link.
   */
  static async getInvoiceDetails(invoiceId: string, options?: { organizationId?: string; isSuperAdmin?: boolean }) {
    const [inv] = await db
      .select()
      .from(invoices)
      .where(eq(invoices.id, invoiceId))
      .limit(1);

    if (!inv) {
      throw new Error('Invoice not found');
    }

    // Permission check for tenant agency
    if (!options?.isSuperAdmin) {
      if (options?.organizationId && inv.organizationId !== options.organizationId) {
        throw new Error('Unauthorized access to invoice');
      }
      if (!inv.isGenerated) {
        throw new Error('Invoice has not been issued by Super Admin yet');
      }
    }

    // Fetch Organization details
    const [org] = await db
      .select({
        id: organizations.id,
        name: organizations.name,
        slug: organizations.slug,
        securityDepositLimit: organizations.securityDepositLimit,
      })
      .from(organizations)
      .where(eq(organizations.id, inv.organizationId))
      .limit(1);

    const amountInr = parseFloat(inv.totalAmountInr);
    const amountUsd = parseFloat(inv.totalAmountUsd);

    // Standard UPI Deep link format (auto-fills VPA, Name, Amount in INR, Note)
    const upiNote = `Invoice ${inv.invoiceNumber}`;
    const upiDeepLink = `upi://pay?pa=${inv.upiId}&pn=${encodeURIComponent(inv.ownerName)}&am=${amountInr.toFixed(2)}&cu=INR&tn=${encodeURIComponent(upiNote)}`;

    return {
      invoice: {
        ...inv,
        subtotalUsd: parseFloat(inv.subtotalUsd),
        taxUsd: parseFloat(inv.taxUsd),
        totalAmountUsd: amountUsd,
        exchangeRateInr: parseFloat(inv.exchangeRateInr),
        totalAmountInr: amountInr,
        lineItems: (inv.lineItems as InvoiceLineItem[]) || [],
      },
      organization: org,
      owner: {
        name: inv.ownerName,
        phone: inv.ownerPhone,
        email: inv.ownerEmail,
        upiId: inv.upiId,
      },
      payment: {
        upiId: inv.upiId,
        upiDeepLink,
        amountInr,
        amountUsd,
        exchangeRate: parseFloat(inv.exchangeRateInr),
      },
    };
  }

  /**
   * Helper to fetch live USD to INR exchange rate with fallbacks
   */
  static async fetchLiveUsdToInrRate(): Promise<{ rate: number; isLive: boolean }> {
    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 4000);
      const res = await fetch('https://open.er-api.com/v6/latest/USD', { signal: controller.signal });
      clearTimeout(timeoutId);
      if (res.ok) {
        const data: any = await res.json();
        if (data && data.rates && typeof data.rates.INR === 'number') {
          return { rate: Number(data.rates.INR.toFixed(2)), isLive: true };
        }
      }
    } catch (_err) {
      try {
        const controller2 = new AbortController();
        const timeoutId2 = setTimeout(() => controller2.abort(), 3000);
        const res2 = await fetch('https://api.frankfurter.app/latest?from=USD&to=INR', { signal: controller2.signal });
        clearTimeout(timeoutId2);
        if (res2.ok) {
          const data2: any = await res2.json();
          if (data2 && data2.rates && typeof data2.rates.INR === 'number') {
            return { rate: Number(data2.rates.INR.toFixed(2)), isLive: true };
          }
        }
      } catch (_err2) {}
    }
    return { rate: this.DEFAULT_USD_TO_INR_RATE, isLive: false };
  }

  /**
   * Super Admin helper: Fetch exact agency ledger consumption for a billing month
   */
  static async getAgencyMonthConsumption(organizationId: string, billingMonth: string) {
    const [year, m] = billingMonth.split('-').map(Number);
    const periodStart = new Date(Date.UTC(year, m - 1, 1));
    const periodEnd = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));

    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    const [ledgerStats] = await db
      .select({
        evaluations: sql<number>`count(${tokenConsumptionLedger.id})::int`,
        inputTokens: sql<number>`coalesce(sum(${tokenConsumptionLedger.inputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${tokenConsumptionLedger.outputTokens}), 0)::int`,
        totalTokens: sql<number>`coalesce(sum(${tokenConsumptionLedger.totalTokens}), 0)::int`,
        cost: sql<number>`coalesce(sum(${tokenConsumptionLedger.billedCostUsd}), 0)::float`,
      })
      .from(tokenConsumptionLedger)
      .where(
        and(
          eq(tokenConsumptionLedger.organizationId, organizationId),
          gte(tokenConsumptionLedger.timestamp, periodStart),
          lte(tokenConsumptionLedger.timestamp, periodEnd)
        )
      );

    const evaluations = ledgerStats?.evaluations || 0;
    const inputTokens = ledgerStats?.inputTokens || 0;
    const outputTokens = ledgerStats?.outputTokens || 0;
    const totalTokens = ledgerStats?.totalTokens || (inputTokens + outputTokens);
    const multiplier = parseFloat(org.profitMultiplier) || 4.0;
    const inputRatePerM = Number((0.30 * multiplier).toFixed(2));
    const outputRatePerM = Number((2.50 * multiplier).toFixed(2));
    const inputCostUsd = Number(((inputTokens / 1_000_000) * inputRatePerM).toFixed(4));
    const outputCostUsd = Number(((outputTokens / 1_000_000) * outputRatePerM).toFixed(4));
    // Strictly prioritize exact recorded ledger cost to prevent any penny divergence
    const subtotalUsd = ledgerStats?.cost !== undefined && ledgerStats.cost > 0
      ? Number(ledgerStats.cost.toFixed(4))
      : Number((inputCostUsd + outputCostUsd).toFixed(4));

    const liveRateInfo = await this.fetchLiveUsdToInrRate();
    const totalInr = Number((subtotalUsd * liveRateInfo.rate).toFixed(2));

    return {
      organizationId,
      organizationName: org.name,
      billingMonth,
      evaluations,
      inputTokens,
      outputTokens,
      totalTokens,
      subtotalUsd,
      exchangeRateInr: liveRateInfo.rate,
      isLiveRate: liveRateInfo.isLive,
      totalInr,
    };
  }

  /**
   * Super Admin action: Generate or update an invoice for an agency month.
   * Charges strictly for exact agency consumed tokens.
   */
  static async generateInvoice(params: {
    organizationId: string;
    billingMonth: string; // 'YYYY-MM'
    superAdminEmail: string;
    exchangeRateInr?: number;
    customSubtotalUsd?: number;
    notes?: string;
    dueDateDays?: number;
  }) {
    const { organizationId, billingMonth, superAdminEmail } = params;
    let rate = params.exchangeRateInr;
    if (!rate || rate <= 0) {
      const live = await this.fetchLiveUsdToInrRate();
      rate = live.rate;
    }
    const dueDays = params.dueDateDays || 15;

    // Check organization
    const [org] = await db
      .select()
      .from(organizations)
      .where(eq(organizations.id, organizationId))
      .limit(1);

    if (!org) {
      throw new Error(`Organization ${organizationId} not found`);
    }

    const [year, m] = billingMonth.split('-').map(Number);
    const periodStart = new Date(Date.UTC(year, m - 1, 1));
    const periodEnd = new Date(Date.UTC(year, m, 0, 23, 59, 59, 999));
    const dueDate = new Date(Date.now() + dueDays * 24 * 60 * 60 * 1000);

    const multiplier = parseFloat(org.profitMultiplier) || 4.0;
    const inputRatePerM = Number((0.30 * multiplier).toFixed(2));
    const outputRatePerM = Number((2.50 * multiplier).toFixed(2));

    // Fetch actual telemetry from token ledger for that month
    const [ledgerStats] = await db
      .select({
        evaluations: sql<number>`count(${tokenConsumptionLedger.id})::int`,
        inputTokens: sql<number>`coalesce(sum(${tokenConsumptionLedger.inputTokens}), 0)::int`,
        outputTokens: sql<number>`coalesce(sum(${tokenConsumptionLedger.outputTokens}), 0)::int`,
        totalTokens: sql<number>`coalesce(sum(${tokenConsumptionLedger.totalTokens}), 0)::int`,
        cost: sql<number>`coalesce(sum(${tokenConsumptionLedger.billedCostUsd}), 0)::float`,
      })
      .from(tokenConsumptionLedger)
      .where(
        and(
          eq(tokenConsumptionLedger.organizationId, organizationId),
          gte(tokenConsumptionLedger.timestamp, periodStart),
          lte(tokenConsumptionLedger.timestamp, periodEnd)
        )
      );

    const evaluations = ledgerStats?.evaluations || 0;
    const inputTokens = ledgerStats?.inputTokens || 0;
    const outputTokens = ledgerStats?.outputTokens || 0;

    // Requirement 5: strictly use actual consumed tokens and billed cost directly from ledger!
    const subtotalUsd = ledgerStats?.cost !== undefined && ledgerStats.cost > 0
      ? Number(ledgerStats.cost.toFixed(4))
      : Number((((inputTokens / 1_000_000) * inputRatePerM) + ((outputTokens / 1_000_000) * outputRatePerM)).toFixed(4));
    const inputCostUsd = Number(((inputTokens / 1_000_000) * inputRatePerM).toFixed(4));
    const outputCostUsd = Number((subtotalUsd - inputCostUsd).toFixed(4));

    const totalTokens = inputTokens + outputTokens;
    const taxUsd = 0; // Standard zero export tax
    const totalUsd = Number((subtotalUsd + taxUsd).toFixed(4));
    const totalInr = Number((totalUsd * rate).toFixed(2));

    // Charged STRICTLY for tokens only (Clean client-facing description, no multiplier or base cost exposed)
    const lineItems: InvoiceLineItem[] = [
      {
        id: 'li-input-tokens',
        category: 'Input Tokens',
        description: 'Enterprise AI Input Tokens (Prompt & Context Processing)',
        quantity: inputTokens,
        unit: 'tokens',
        unitPriceUsd: Number((inputRatePerM / 1_000_000).toFixed(8)),
        totalUsd: inputCostUsd,
      },
      {
        id: 'li-output-tokens',
        category: 'Output Tokens',
        description: 'Enterprise AI Output Tokens (Evaluation Reasoning & Match Scoring)',
        quantity: outputTokens,
        unit: 'tokens',
        unitPriceUsd: Number((outputRatePerM / 1_000_000).toFixed(8)),
        totalUsd: outputCostUsd,
      },
    ];

    // Check if invoice already exists
    const [existing] = await db
      .select()
      .from(invoices)
      .where(and(eq(invoices.organizationId, organizationId), eq(invoices.billingMonth, billingMonth)))
      .limit(1);

    const invoiceNumber = existing?.invoiceNumber || `JDM-${billingMonth.replace('-', '')}-${org.slug.substring(0, 4).toUpperCase()}${Math.floor(100 + Math.random() * 900)}`;

    if (existing) {
      const [updated] = await db
        .update(invoices)
        .set({
          isGenerated: true,
          status: existing.status === 'paid' ? 'paid' : 'generated',
          totalEvaluations: evaluations,
          totalTokens,
          subtotalUsd: subtotalUsd.toFixed(4),
          totalAmountUsd: totalUsd.toFixed(4),
          exchangeRateInr: rate.toFixed(4),
          totalAmountInr: totalInr.toFixed(2),
          lineItems,
          notes: params.notes || existing.notes || 'Payment via UPI is instantly credited upon transaction ID verification.',
          generatedBy: superAdminEmail,
          generatedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(invoices.id, existing.id))
        .returning();
      return updated;
    }

    const [created] = await db
      .insert(invoices)
      .values({
        organizationId,
        invoiceNumber,
        billingMonth,
        periodStart,
        periodEnd,
        dueDate,
        status: 'generated',
        isGenerated: true,
        totalEvaluations: evaluations,
        totalTokens,
        subtotalUsd: subtotalUsd.toFixed(4),
        taxUsd: '0.0000',
        totalAmountUsd: totalUsd.toFixed(4),
        exchangeRateInr: rate.toFixed(4),
        totalAmountInr: totalInr.toFixed(2),
        upiId: this.DEFAULT_UPI_ID,
        ownerName: this.OWNER_NAME,
        ownerPhone: this.OWNER_PHONE,
        ownerEmail: this.OWNER_EMAIL,
        lineItems,
        notes: params.notes || 'Payment via UPI is instantly verified. Auto-converts to INR.',
        generatedBy: superAdminEmail,
        generatedAt: new Date(),
      })
      .returning();

    // Reconcile organization outstanding deposit balance
    await BillingService.recalculateOrgBilledAmount(organizationId);

    return created;
  }

  /**
   * Super Admin action: Toggle whether the agency can download/see the generated bill.
   */
  static async toggleGeneration(invoiceId: string, isGenerated: boolean, superAdminEmail: string) {
    const [updated] = await db
      .update(invoices)
      .set({
        isGenerated,
        generatedBy: isGenerated ? superAdminEmail : null,
        generatedAt: isGenerated ? new Date() : null,
        updatedAt: new Date(),
      })
      .where(eq(invoices.id, invoiceId))
      .returning();

    if (!updated) {
      throw new Error('Invoice not found');
    }
    return updated;
  }

  /**
   * Super Admin action: Update payment status (paid, pending, void)
   */
  static async updateStatus(invoiceId: string, status: 'draft' | 'pending' | 'generated' | 'paid' | 'overdue' | 'void') {
    const updates: Partial<Invoice> = {
      status,
      updatedAt: new Date(),
    };
    if (status === 'paid') {
      updates.paidAt = new Date();
    } else {
      updates.paidAt = null;
    }

    const [updated] = await db
      .update(invoices)
      .set(updates)
      .where(eq(invoices.id, invoiceId))
      .returning();

    if (!updated) {
      throw new Error('Invoice not found');
    }

    // Immediately reconcile organization outstanding security deposit balance
    await BillingService.recalculateOrgBilledAmount(updated.organizationId);

    return updated;
  }

  /**
   * Super Admin list of all invoices
   */
  static async listAllInvoices(filters?: { organizationId?: string; status?: string; billingMonth?: string }) {
    let query = db
      .select({
        id: invoices.id,
        organizationId: invoices.organizationId,
        organizationName: organizations.name,
        organizationSlug: organizations.slug,
        invoiceNumber: invoices.invoiceNumber,
        billingMonth: invoices.billingMonth,
        issueDate: invoices.issueDate,
        dueDate: invoices.dueDate,
        status: invoices.status,
        isGenerated: invoices.isGenerated,
        totalEvaluations: invoices.totalEvaluations,
        totalTokens: invoices.totalTokens,
        totalAmountUsd: invoices.totalAmountUsd,
        totalAmountInr: invoices.totalAmountInr,
        exchangeRateInr: invoices.exchangeRateInr,
        generatedAt: invoices.generatedAt,
        generatedBy: invoices.generatedBy,
        paidAt: invoices.paidAt,
      })
      .from(invoices)
      .leftJoin(organizations, eq(invoices.organizationId, organizations.id))
      .orderBy(desc(invoices.billingMonth));

    const all = await query;
    return all.filter((inv) => {
      if (filters?.organizationId && inv.organizationId !== filters.organizationId) return false;
      if (filters?.status && inv.status !== filters.status) return false;
      if (filters?.billingMonth && inv.billingMonth !== filters.billingMonth) return false;
      return true;
    });
  }

  /**
   * Super Admin summary of platform billing:
   * Reconciles all-time income, invoiced volume, unbilled token usage, deposit health, and multi-agency breakdown.
   */
  static async getAdminInvoiceSummary(filterOrgId?: string) {
    const allOrgs = await db.select().from(organizations);
    const allUsers = await db.select({
      id: users.id,
      organizationId: users.organizationId,
      role: users.role,
      email: users.email,
    }).from(users);
    const allInvoices = await db.select().from(invoices);

    // Group users by org
    const orgUsersMap = new Map<string, { recruiters: number; adminEmail: string | null }>();
    for (const u of allUsers) {
      if (!u.organizationId) continue;
      const existing = orgUsersMap.get(u.organizationId) || { recruiters: 0, adminEmail: null };
      if (u.role === 'recruiter') existing.recruiters += 1;
      if (u.role === 'org_admin' && !existing.adminEmail) existing.adminEmail = u.email;
      orgUsersMap.set(u.organizationId, existing);
    }

    // Ledger consumption by org and month
    const ledgerAggs = await db
      .select({
        organizationId: tokenConsumptionLedger.organizationId,
        monthStr: sql<string>`to_char(${tokenConsumptionLedger.timestamp}, 'YYYY-MM')`,
        totalCostUsd: sql<number>`coalesce(sum(${tokenConsumptionLedger.billedCostUsd}), 0)::float`,
      })
      .from(tokenConsumptionLedger)
      .groupBy(tokenConsumptionLedger.organizationId, sql`to_char(${tokenConsumptionLedger.timestamp}, 'YYYY-MM')`);

    // Invoices by org
    const orgInvoicesMap = new Map<string, typeof allInvoices>();
    const invoicedMonthsSet = new Set<string>();

    for (const inv of allInvoices) {
      invoicedMonthsSet.add(`${inv.organizationId}_${inv.billingMonth}`);
      const list = orgInvoicesMap.get(inv.organizationId) || [];
      list.push(inv);
      orgInvoicesMap.set(inv.organizationId, list);
    }

    // Unbilled ledger costs by org
    const orgUnbilledMap = new Map<string, number>();
    for (const l of ledgerAggs) {
      if (!invoicedMonthsSet.has(`${l.organizationId}_${l.monthStr}`)) {
        const cur = orgUnbilledMap.get(l.organizationId) || 0;
        orgUnbilledMap.set(l.organizationId, cur + l.totalCostUsd);
      }
    }

    let globalInvoicedUsd = 0;
    let globalPaidUsd = 0;
    let globalPendingUsd = 0;
    let globalUnbilledUsd = 0;
    let globalDepositPoolUsd = 0;
    let globalDepositUsedUsd = 0;
    let paidInvoicesCount = 0;
    let pendingInvoicesCount = 0;

    const agenciesBreakdown = allOrgs.map((org) => {
      const orgInvs = orgInvoicesMap.get(org.id) || [];
      const userMeta = orgUsersMap.get(org.id) || { recruiters: 0, adminEmail: null };
      const unbilledUsd = orgUnbilledMap.get(org.id) || 0;

      let orgInvoicedUsd = 0;
      let orgPaidUsd = 0;
      let orgPendingUsd = 0;
      let orgPaidCount = 0;
      let orgPendingCount = 0;

      // Sort invoices by billingMonth desc
      orgInvs.sort((a, b) => b.billingMonth.localeCompare(a.billingMonth));
      const latestInv = orgInvs[0];

      for (const inv of orgInvs) {
        const amt = parseFloat(inv.totalAmountUsd) || 0;
        orgInvoicedUsd += amt;
        if (inv.status === 'paid') {
          orgPaidUsd += amt;
          orgPaidCount += 1;
        } else if (inv.status !== 'void') {
          orgPendingUsd += amt;
          orgPendingCount += 1;
        }
      }

      const depositAllowed = parseFloat(org.securityDepositLimit) || 500;
      const depositUsed = Number((orgPendingUsd + unbilledUsd).toFixed(2));
      const depositRemaining = Math.max(0, Number((depositAllowed - depositUsed).toFixed(2)));
      const depositUsagePercent = depositAllowed > 0 ? Math.min(100, Math.round((depositUsed / depositAllowed) * 100)) : 0;
      const lifetimeUsd = Number((orgInvoicedUsd + unbilledUsd).toFixed(2));

      globalInvoicedUsd += orgInvoicedUsd;
      globalPaidUsd += orgPaidUsd;
      globalPendingUsd += orgPendingUsd;
      globalUnbilledUsd += unbilledUsd;
      globalDepositPoolUsd += depositAllowed;
      globalDepositUsedUsd += depositUsed;
      paidInvoicesCount += orgPaidCount;
      pendingInvoicesCount += orgPendingCount;

      let status: 'good_standing' | 'pending_payment' | 'deposit_alert' = 'good_standing';
      if (depositUsagePercent >= 85) {
        status = 'deposit_alert';
      } else if (orgPendingCount > 0) {
        status = 'pending_payment';
      }

      return {
        organizationId: org.id,
        organizationName: org.name,
        organizationSlug: org.slug,
        isActive: org.isActive,
        adminEmail: userMeta.adminEmail,
        recruiterCount: userMeta.recruiters,
        totalInvoicedUsd: Number(orgInvoicedUsd.toFixed(2)),
        totalPaidUsd: Number(orgPaidUsd.toFixed(2)), // All-Time Settled Income
        totalPendingUsd: Number(orgPendingUsd.toFixed(2)), // Pending Due
        totalUnbilledUsd: Number(unbilledUsd.toFixed(2)), // Ongoing unbilled WIP
        totalLifetimeVolumeUsd: lifetimeUsd,
        depositUsed,
        depositAllowed,
        depositRemaining,
        depositUsagePercent,
        invoicesCount: orgInvs.length,
        paidCount: orgPaidCount,
        pendingCount: orgPendingCount,
        latestInvoiceMonth: latestInv ? latestInv.billingMonth : null,
        latestInvoiceStatus: latestInv ? latestInv.status : null,
        status,
      };
    });

    return {
      totalInvoicedUsd: Number(globalInvoicedUsd.toFixed(2)),
      totalPaidUsd: Number(globalPaidUsd.toFixed(2)), // All-time settled income platform-wide
      totalPendingUsd: Number(globalPendingUsd.toFixed(2)),
      totalUnbilledUsd: Number(globalUnbilledUsd.toFixed(2)),
      totalPlatformVolumeUsd: Number((globalInvoicedUsd + globalUnbilledUsd).toFixed(2)),
      totalSecurityDepositPoolUsd: Number(globalDepositPoolUsd.toFixed(2)),
      totalDepositUsedUsd: Number(globalDepositUsedUsd.toFixed(2)),
      invoicesCount: allInvoices.length,
      paidInvoicesCount,
      pendingInvoicesCount,
      agenciesCount: allOrgs.length,
      activeAgenciesCount: allOrgs.filter((o) => o.isActive).length,
      agenciesBreakdown,
    };
  }
}

