import { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { db } from '../db/index.js';
import { organizations, users, tokenConsumptionLedger, matchedJds, invoices } from '../db/schema.js';
import { eq, desc, sql, and, gte, lte, ne } from 'drizzle-orm';
import { authGuard, requireRole } from '../middleware/authGuard.js';
import { BillingService } from '../services/billingService.js';

const createOrgSchema = z.object({
  name: z.string().min(2),
  slug: z.string().min(2).regex(/^[a-z0-9-]+$/, 'Slug must be URL-safe (lowercase, numbers, hyphens)'),
  securityDepositLimit: z.preprocess((val) => (val !== undefined && val !== null ? Number(val) : 500), z.number().min(0.01)).default(500),
  profitMultiplier: z.number().min(1).default(4.0),
  adminEmail: z.string().email(),
  adminFullName: z.string().min(2),
  adminPassword: z.string().min(8),
});

const updateBillingSchema = z.object({
  securityDepositLimit: z.preprocess((val) => (val !== undefined && val !== null ? Number(val) : undefined), z.number().min(0.01).optional()),
  profitMultiplier: z.number().min(1).optional(),
  isActive: z.boolean().optional(),
});

export const orgsRoutes: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  // GET /api/orgs (Super Admin only: lists all agencies and billing meters)
  fastify.get(
    '/',
    { preHandler: [authGuard, requireRole(['super_admin'])] },
    async (request, reply) => {
      // Pagination support
      const query = request.query as { limit?: string; offset?: string };
      const limit = Math.min(Math.max(parseInt(query.limit || '50', 10) || 50, 1), 200);
      const offset = Math.max(parseInt(query.offset || '0', 10) || 0, 0);

      const list = await db
        .select({
          id: organizations.id,
          name: organizations.name,
          slug: organizations.slug,
          securityDepositLimit: organizations.securityDepositLimit,
          totalBilledAmount: organizations.totalBilledAmount,
          profitMultiplier: organizations.profitMultiplier,
          isActive: organizations.isActive,
          createdAt: organizations.createdAt,
          updatedAt: organizations.updatedAt,
          recruiterCount: sql<number>`(SELECT count(*) FROM users WHERE users.organization_id = organizations.id AND users.role = 'recruiter')`,
          resumeAnalysisCount: sql<number>`(SELECT count(*) FROM token_consumption_ledger WHERE token_consumption_ledger.organization_id = organizations.id AND token_consumption_ledger.action_type = 'resume_analysis')::int`,
          cumulativeLifetimeSpend: sql<number>`(SELECT coalesce(sum(billed_cost_usd), 0)::float FROM token_consumption_ledger WHERE token_consumption_ledger.organization_id = organizations.id)`,
        })
        .from(organizations)
        .orderBy(desc(organizations.createdAt))
        .limit(limit)
        .offset(offset);

      return reply.send(list);
    }
  );

  // POST /api/orgs (Super Admin only: provisions agency & initial Org Admin account)
  fastify.post(
    '/',
    { preHandler: [authGuard, requireRole(['super_admin'])] },
    async (request, reply) => {
      const parseResult = createOrgSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'INVALID_PAYLOAD', details: parseResult.error.issues });
      }

      const data = parseResult.data;

      // Check if slug or admin email exists
      const existingOrg = await db.select().from(organizations).where(eq(organizations.slug, data.slug)).limit(1);
      if (existingOrg.length > 0) {
        return reply.status(409).send({ error: 'SLUG_EXISTS', message: 'An organization with this slug already exists' });
      }

      const existingUser = await db.select().from(users).where(eq(users.email, data.adminEmail.toLowerCase().trim())).limit(1);
      if (existingUser.length > 0) {
        return reply.status(409).send({ error: 'EMAIL_EXISTS', message: 'User with this email already exists' });
      }

      const passwordHash = await bcrypt.hash(data.adminPassword, 10);

      // Execute within transaction
      const result = await db.transaction(async (tx) => {
        const [org] = await tx
          .insert(organizations)
          .values({
            name: data.name,
            slug: data.slug,
            securityDepositLimit: data.securityDepositLimit.toFixed(4),
            profitMultiplier: data.profitMultiplier.toFixed(2),
            totalBilledAmount: '0.0000',
          })
          .returning();

        const [adminUser] = await tx
          .insert(users)
          .values({
            organizationId: org.id,
            role: 'org_admin',
            email: data.adminEmail.toLowerCase().trim(),
            passwordHash,
            fullName: data.adminFullName,
          })
          .returning();

        return { org, adminUser };
      });

      return reply.status(201).send({
        organization: result.org,
        initialAdmin: {
          id: result.adminUser.id,
          email: result.adminUser.email,
          fullName: result.adminUser.fullName,
          role: result.adminUser.role,
        },
      });
    }
  );

  // POST /api/orgs/:id/mark-paid (Super Admin only: resets total_billed_amount to $0.00)
  fastify.post(
    '/:id/mark-paid',
    { preHandler: [authGuard, requireRole(['super_admin'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const user = request.user!;
      const result = await BillingService.markAsPaid(id, user.email);
      return reply.send({
        message: 'Security deposit balance marked as paid and reset to $0.00',
        ...result,
      });
    }
  );

  // PATCH /api/orgs/:id/billing-settings (Super Admin only: adjusts limits/multipliers)
  fastify.patch(
    '/:id/billing-settings',
    { preHandler: [authGuard, requireRole(['super_admin'])] },
    async (request, reply) => {
      const { id } = request.params as { id: string };
      const parseResult = updateBillingSchema.safeParse(request.body);
      if (!parseResult.success) {
        return reply.status(400).send({ error: 'INVALID_PAYLOAD', details: parseResult.error.issues });
      }

      const updates: Record<string, any> = { updatedAt: new Date() };
      if (parseResult.data.securityDepositLimit !== undefined) {
        updates.securityDepositLimit = parseResult.data.securityDepositLimit.toFixed(4);
      }
      if (parseResult.data.profitMultiplier !== undefined) {
        updates.profitMultiplier = parseResult.data.profitMultiplier.toFixed(2);
      }
      if (parseResult.data.isActive !== undefined) {
        updates.isActive = parseResult.data.isActive;
      }

      const [updated] = await db
        .update(organizations)
        .set(updates)
        .where(eq(organizations.id, id))
        .returning();

      if (!updated) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Organization not found' });
      }

      return reply.send(updated);
    }
  );

const hudFilterQuerySchema = z.object({
  startDate: z.string().optional(),
  endDate: z.string().optional(),
  recruiterId: z.string().optional(),
  actionType: z.enum(['all', 'jd_evaluation', 'resume_analysis']).optional(),
});

  // GET /api/orgs/my-org (Org Admin only: retrieves agency info & billing HUD data with optional filters)
  fastify.get(
    '/my-org',
    { preHandler: [authGuard, requireRole(['org_admin'])] },
    async (request, reply) => {
      const user = request.user!;
      const query = hudFilterQuerySchema.safeParse(request.query).data || {};

      const [org] = await db
        .select()
        .from(organizations)
        .where(eq(organizations.id, user.organizationId!))
        .limit(1);

      if (!org) {
        return reply.status(404).send({ error: 'NOT_FOUND', message: 'Organization not found' });
      }

      // Build dynamic filter conditions for the ledger
      const ledgerConditions = [eq(tokenConsumptionLedger.organizationId, user.organizationId!)];

      if (query.recruiterId && query.recruiterId !== 'all') {
        ledgerConditions.push(eq(tokenConsumptionLedger.recruiterId, query.recruiterId));
      }
      if (query.actionType === 'jd_evaluation') {
        ledgerConditions.push(ne(tokenConsumptionLedger.actionType, 'resume_analysis'));
      } else if (query.actionType === 'resume_analysis') {
        ledgerConditions.push(eq(tokenConsumptionLedger.actionType, 'resume_analysis'));
      }
      if (query.startDate) {
        ledgerConditions.push(gte(tokenConsumptionLedger.timestamp, new Date(query.startDate)));
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        if (query.endDate.length === 10) {
          end.setHours(23, 59, 59, 999);
        }
        ledgerConditions.push(lte(tokenConsumptionLedger.timestamp, end));
      }

      // Aggregated Ledger per recruiter (with active filter conditions applied)
      const recruiterConsumption = await db
        .select({
          recruiterId: tokenConsumptionLedger.recruiterId,
          recruiterName: users.fullName,
          recruiterEmail: users.email,
          totalEvaluations: sql<number>`count(${tokenConsumptionLedger.id})::int`,
          regularEvalCount: sql<number>`count(case when ${tokenConsumptionLedger.actionType} != 'resume_analysis' then 1 else null end)::int`,
          resumeAnalysisCount: sql<number>`count(case when ${tokenConsumptionLedger.actionType} = 'resume_analysis' then 1 else null end)::int`,
          totalTokens: sql<number>`coalesce(sum(${tokenConsumptionLedger.totalTokens}), 0)::int`,
          totalBilledCostUsd: sql<string>`coalesce(sum(${tokenConsumptionLedger.billedCostUsd}), 0)::text`,
          lastEvaluationAt: sql<string>`max(${tokenConsumptionLedger.timestamp})::text`,
        })
        .from(tokenConsumptionLedger)
        .leftJoin(users, eq(tokenConsumptionLedger.recruiterId, users.id))
        .where(and(...ledgerConditions))
        .groupBy(tokenConsumptionLedger.recruiterId, users.fullName, users.email)
        .orderBy(desc(sql`sum(${tokenConsumptionLedger.billedCostUsd})`));

      const [filteredStats] = await db
        .select({
          totalEvaluations: sql<number>`count(${tokenConsumptionLedger.id})::int`,
          totalTokens: sql<number>`coalesce(sum(${tokenConsumptionLedger.totalTokens}), 0)::int`,
          totalBilledCostUsd: sql<number>`coalesce(sum(${tokenConsumptionLedger.billedCostUsd}), 0)::float`,
        })
        .from(tokenConsumptionLedger)
        .where(and(...ledgerConditions));

      const [orgResumeStats] = await db
        .select({
          totalAnalyses: sql<number>`count(*)::int`,
          totalBilled: sql<number>`coalesce(sum(${tokenConsumptionLedger.billedCostUsd}), 0)::float`,
        })
        .from(tokenConsumptionLedger)
        .where(
          and(
            eq(tokenConsumptionLedger.organizationId, user.organizationId!),
            eq(tokenConsumptionLedger.actionType, 'resume_analysis')
          )
        );

      const [lifetimeStats] = await db
        .select({
          totalLifetime: sql<number>`coalesce(sum(${tokenConsumptionLedger.billedCostUsd}), 0)::float`,
        })
        .from(tokenConsumptionLedger)
        .where(eq(tokenConsumptionLedger.organizationId, user.organizationId!));

      const [paidStats] = await db
        .select({
          totalPaid: sql<number>`coalesce(sum(${invoices.totalAmountUsd}), 0)::float`,
        })
        .from(invoices)
        .where(and(eq(invoices.organizationId, user.organizationId!), eq(invoices.status, 'paid')));

      const limit = parseFloat(org.securityDepositLimit);
      const billed = parseFloat(org.totalBilledAmount);
      const remainingDeposit = Math.max(0, limit - billed);
      const usagePercentage = Number(((billed / limit) * 100).toFixed(2));
      const totalLifetimeBilled = Number((lifetimeStats?.totalLifetime || 0).toFixed(4));
      const totalPaid = Number((paidStats?.totalPaid || 0).toFixed(4));

      // Omit internal pricing secrets: agency should NEVER see their profitMultiplier
      const { profitMultiplier: _hiddenMultiplier, ...sanitizedOrg } = org;

      return reply.send({
        organization: sanitizedOrg,
        hud: {
          securityDepositLimit: limit,
          totalBilledAmount: billed, // Outstanding balance towards limit
          outstandingDepositUsed: billed,
          cumulativeLifetimeSpend: totalLifetimeBilled, // Exact match with Billing Ledger
          totalPaidAmount: totalPaid,
          remainingDeposit,
          usagePercentage,
          isLocked: billed >= limit,
          resumeAnalysisCount: orgResumeStats?.totalAnalyses || 0,
          resumeAnalysisBilledAmount: Number((orgResumeStats?.totalBilled || 0).toFixed(4)),
        },
        filteredStats: {
          totalEvaluations: filteredStats?.totalEvaluations || 0,
          totalTokens: filteredStats?.totalTokens || 0,
          totalBilledCostUsd: Number((filteredStats?.totalBilledCostUsd || 0).toFixed(4)),
        },
        recruiterConsumption,
      });
    }
  );

  // GET /api/orgs/my-org/analytics (Org Admin: API usage charts data with filter support)
  fastify.get(
    '/my-org/analytics',
    { preHandler: [authGuard, requireRole(['org_admin'])] },
    async (request, reply) => {
      const user = request.user!;
      const query = hudFilterQuerySchema.safeParse(request.query).data || {};

      const ledgerConditions = [eq(tokenConsumptionLedger.organizationId, user.organizationId!)];

      if (query.recruiterId && query.recruiterId !== 'all') {
        ledgerConditions.push(eq(tokenConsumptionLedger.recruiterId, query.recruiterId));
      }
      if (query.actionType === 'jd_evaluation') {
        ledgerConditions.push(ne(tokenConsumptionLedger.actionType, 'resume_analysis'));
      } else if (query.actionType === 'resume_analysis') {
        ledgerConditions.push(eq(tokenConsumptionLedger.actionType, 'resume_analysis'));
      }
      if (query.startDate) {
        ledgerConditions.push(gte(tokenConsumptionLedger.timestamp, new Date(query.startDate)));
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        if (query.endDate.length === 10) {
          end.setHours(23, 59, 59, 999);
        }
        ledgerConditions.push(lte(tokenConsumptionLedger.timestamp, end));
      }

      // 1. Daily evaluations & tokens
      const dailyStats = await db
        .select({
          date: sql<string>`to_char(${tokenConsumptionLedger.timestamp}, 'YYYY-MM-DD')`,
          evaluations: sql<number>`count(${tokenConsumptionLedger.id})::int`,
          totalTokens: sql<number>`coalesce(sum(${tokenConsumptionLedger.totalTokens}), 0)::int`,
          billedCostUsd: sql<number>`coalesce(sum(${tokenConsumptionLedger.billedCostUsd}), 0)::float`,
        })
        .from(tokenConsumptionLedger)
        .where(and(...ledgerConditions))
        .groupBy(sql`to_char(${tokenConsumptionLedger.timestamp}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${tokenConsumptionLedger.timestamp}, 'YYYY-MM-DD')`);

      // 2. Recruiter volume breakdown
      const recruiterBreakdown = await db
        .select({
          recruiterId: tokenConsumptionLedger.recruiterId,
          recruiterName: sql<string>`coalesce(${users.fullName}, 'Unassigned')`,
          evaluations: sql<number>`count(${tokenConsumptionLedger.id})::int`,
          count: sql<number>`count(${tokenConsumptionLedger.id})::int`,
          totalTokens: sql<number>`coalesce(sum(${tokenConsumptionLedger.totalTokens}), 0)::int`,
        })
        .from(tokenConsumptionLedger)
        .leftJoin(users, eq(tokenConsumptionLedger.recruiterId, users.id))
        .where(and(...ledgerConditions))
        .groupBy(tokenConsumptionLedger.recruiterId, users.fullName)
        .orderBy(desc(sql`count(${tokenConsumptionLedger.id})`));

      // 3. Verdict distribution from matched JDs
      const matchedJdConditions = [eq(matchedJds.organizationId, user.organizationId!)];
      if (query.recruiterId && query.recruiterId !== 'all') {
        matchedJdConditions.push(eq(matchedJds.recruiterId, query.recruiterId));
      }
      if (query.startDate) {
        matchedJdConditions.push(gte(matchedJds.appliedAt, new Date(query.startDate)));
      }
      if (query.endDate) {
        const end = new Date(query.endDate);
        if (query.endDate.length === 10) {
          end.setHours(23, 59, 59, 999);
        }
        matchedJdConditions.push(lte(matchedJds.appliedAt, end));
      }

      const verdictRows = await db
        .select({
          verdict: sql<string>`${matchedJds.verdict}`,
          count: sql<number>`count(${matchedJds.id})::int`,
        })
        .from(matchedJds)
        .where(and(...matchedJdConditions))
        .groupBy(matchedJds.verdict);

      const applyCount = verdictRows.find((r) => r.verdict === 'APPLY')?.count || 0;
      const skipCount = verdictRows.find((r) => r.verdict === 'SKIP')?.count || 0;
      const pendingCount = verdictRows.find((r) => r.verdict === 'PENDING')?.count || 0;
      const otherCount = verdictRows
        .filter((r) => r.verdict !== 'APPLY' && r.verdict !== 'SKIP' && r.verdict !== 'PENDING')
        .reduce((sum, r) => sum + r.count, 0);

      return reply.send({
        dailyStats,
        recruiterBreakdown,
        verdictStats: {
          applyCount,
          skipCount,
          pendingCount,
          otherCount,
        },
      });
    }
  );
};
