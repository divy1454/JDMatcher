import { pgTable, uuid, varchar, text, numeric, timestamp, integer, boolean, pgEnum, jsonb, index } from 'drizzle-orm/pg-core';
import { relations } from 'drizzle-orm';

// Strict PostgreSQL ENUM Types
export const userRoleEnum = pgEnum('user_role', ['super_admin', 'org_admin', 'recruiter']);
export const visaStatusEnum = pgEnum('visa_status', [
  'US Citizen',
  'Green Card',
  'H-1B',
  'OPT',
  'CPT',
  'TN',
  'E-3',
  'H4-EAD',
  'L2-EAD',
  'Other'
]);
export const workPrefEnum = pgEnum('work_preference', ['Remote', 'Hybrid', 'On-Site']);
export const clearanceEnum = pgEnum('security_clearance', [
  'None',
  'Public Trust',
  'Secret',
  'Top Secret',
  'Top Secret/SCI',
  'Polygraph'
]);
export const evalVerdictEnum = pgEnum('eval_verdict', ['APPLY', 'SKIP']);
export const invoiceStatusEnum = pgEnum('invoice_status', ['draft', 'pending', 'generated', 'paid', 'overdue', 'void']);

// 1. ORGANIZATIONS (Agencies)
export const organizations = pgTable('organizations', {
  id: uuid('id').defaultRandom().primaryKey(),
  name: varchar('name', { length: 255 }).notNull(),
  slug: varchar('slug', { length: 100 }).notNull().unique(),
  securityDepositLimit: numeric('security_deposit_limit', { precision: 12, scale: 4 }).notNull().default('500.0000'),
  totalBilledAmount: numeric('total_billed_amount', { precision: 12, scale: 4 }).notNull().default('0.0000'),
  profitMultiplier: numeric('profit_multiplier', { precision: 6, scale: 2 }).notNull().default('4.00'),
  customEvalPrompt: text('custom_eval_prompt'), // Waterfall Step 1
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 2. USERS (Super Admin, Org Admin, Recruiters)
export const users = pgTable('users', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').references(() => organizations.id, { onDelete: 'cascade' }),
  role: userRoleEnum('role').notNull(),
  email: varchar('email', { length: 255 }).notNull().unique(),
  passwordHash: varchar('password_hash', { length: 255 }).notNull(),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  // Hardware locking for Recruiters
  deviceId: varchar('device_id', { length: 255 }),
  deviceLastLockedAt: timestamp('device_last_locked_at', { withTimezone: true }),
  deviceSwitchAllowedAfter: timestamp('device_switch_allowed_after', { withTimezone: true }),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('users_org_idx').on(t.organizationId),
  index('users_device_idx').on(t.deviceId),
]);

// 3. CANDIDATES (Belong strictly to an organization)
export const candidates = pgTable('candidates', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  createdByRecruiterId: uuid('created_by_recruiter_id').references(() => users.id, { onDelete: 'set null' }),
  fullName: varchar('full_name', { length: 255 }).notNull(),
  primaryTitle: varchar('primary_title', { length: 255 }).notNull(),
  rawResumeText: text('raw_resume_text').notNull(),
  isActive: boolean('is_active').notNull().default(true),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('candidates_org_idx').on(t.organizationId),
  index('candidates_recruiter_idx').on(t.createdByRecruiterId),
]);

// 4. MATCHED JDS (Persistent storage only when "Save as Applied" is clicked)
export const matchedJds = pgTable('matched_jds', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  recruiterId: uuid('recruiter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  candidateId: uuid('candidate_id').notNull().references(() => candidates.id, { onDelete: 'cascade' }),
  jobTitle: varchar('job_title', { length: 255 }).notNull(),
  companyOrClient: varchar('company_or_client', { length: 255 }),
  jobUrl: text('job_url'),
  rawJdText: text('raw_jd_text').notNull(),
  verdict: evalVerdictEnum('verdict').notNull(),
  matchScore: integer('match_score').notNull(),
  matchReasoning: text('match_reasoning').notNull(),
  appliedAt: timestamp('applied_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('matched_jds_org_idx').on(t.organizationId),
  index('matched_jds_candidate_idx').on(t.candidateId),
]);

// 5. TOKEN CONSUMPTION LEDGER (Telemetry & Exact Accounting)
export const tokenConsumptionLedger = pgTable('token_consumption_ledger', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  recruiterId: uuid('recruiter_id').notNull().references(() => users.id, { onDelete: 'cascade' }),
  inputTokens: integer('input_tokens').notNull(),
  outputTokens: integer('output_tokens').notNull(),
  totalTokens: integer('total_tokens').notNull(),
  rawCostUsd: numeric('raw_cost_usd', { precision: 12, scale: 6 }).notNull(),
  profitMultiplier: numeric('profit_multiplier', { precision: 6, scale: 2 }).notNull(),
  billedCostUsd: numeric('billed_cost_usd', { precision: 12, scale: 6 }).notNull(),
  latencyMs: integer('latency_ms').notNull(),
  modelName: varchar('model_name', { length: 100 }).notNull().default('gemini-3.5-flash-lite'),
  timestamp: timestamp('timestamp', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('ledger_org_idx').on(t.organizationId),
  index('ledger_timestamp_idx').on(t.timestamp),
]);

// 6. PLATFORM SETTINGS (Global Configuration, e.g. Fallback Prompt)
export const platformSettings = pgTable('platform_settings', {
  key: varchar('key', { length: 100 }).primaryKey(),
  value: text('value').notNull(),
  description: text('description'),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
});

// 7. INVOICES (Monthly Business Level Billing & Invoicing)
export const invoices = pgTable('invoices', {
  id: uuid('id').defaultRandom().primaryKey(),
  organizationId: uuid('organization_id').notNull().references(() => organizations.id, { onDelete: 'cascade' }),
  invoiceNumber: varchar('invoice_number', { length: 100 }).notNull().unique(),
  billingMonth: varchar('billing_month', { length: 7 }).notNull(), // 'YYYY-MM'
  periodStart: timestamp('period_start', { withTimezone: true }).notNull(),
  periodEnd: timestamp('period_end', { withTimezone: true }).notNull(),
  issueDate: timestamp('issue_date', { withTimezone: true }).defaultNow().notNull(),
  dueDate: timestamp('due_date', { withTimezone: true }).notNull(),
  status: invoiceStatusEnum('status').notNull().default('generated'),
  isGenerated: boolean('is_generated').notNull().default(true), // Super admin approval flag
  totalEvaluations: integer('total_evaluations').notNull().default(0),
  totalTokens: integer('total_tokens').notNull().default(0),
  rawCostUsd: numeric('raw_cost_usd', { precision: 12, scale: 4 }).notNull().default('0.0000'),
  subtotalUsd: numeric('subtotal_usd', { precision: 12, scale: 4 }).notNull().default('0.0000'),
  taxUsd: numeric('tax_usd', { precision: 12, scale: 4 }).notNull().default('0.0000'),
  totalAmountUsd: numeric('total_amount_usd', { precision: 12, scale: 4 }).notNull().default('0.0000'),
  exchangeRateInr: numeric('exchange_rate_inr', { precision: 10, scale: 4 }).notNull().default('86.5000'),
  totalAmountInr: numeric('total_amount_inr', { precision: 12, scale: 2 }).notNull().default('0.00'),
  upiId: varchar('upi_id', { length: 100 }).notNull().default('8999911999-2@ybl'),
  ownerName: varchar('owner_name', { length: 255 }).notNull().default('Divy Patel'),
  ownerPhone: varchar('owner_phone', { length: 50 }).notNull().default('+91 8999911999'),
  ownerEmail: varchar('owner_email', { length: 255 }).notNull().default('divy9954@gmail.com'),
  lineItems: jsonb('line_items').notNull().default([]),
  notes: text('notes'),
  generatedBy: varchar('generated_by', { length: 255 }),
  generatedAt: timestamp('generated_at', { withTimezone: true }),
  paidAt: timestamp('paid_at', { withTimezone: true }),
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
}, (t) => [
  index('invoices_org_idx').on(t.organizationId),
  index('invoices_month_idx').on(t.billingMonth),
  index('invoices_status_idx').on(t.status),
]);

// Relations
export const organizationsRelations = relations(organizations, ({ many }) => ({
  users: many(users),
  candidates: many(candidates),
  matchedJds: many(matchedJds),
  ledgerEntries: many(tokenConsumptionLedger),
  invoices: many(invoices),
}));

export const invoicesRelations = relations(invoices, ({ one }) => ({
  organization: one(organizations, {
    fields: [invoices.organizationId],
    references: [organizations.id],
  }),
}));

export const usersRelations = relations(users, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [users.organizationId],
    references: [organizations.id],
  }),
  matchedJds: many(matchedJds),
  ledgerEntries: many(tokenConsumptionLedger),
}));

export const candidatesRelations = relations(candidates, ({ one, many }) => ({
  organization: one(organizations, {
    fields: [candidates.organizationId],
    references: [organizations.id],
  }),
  matchedJds: many(matchedJds),
}));

export const matchedJdsRelations = relations(matchedJds, ({ one }) => ({
  organization: one(organizations, {
    fields: [matchedJds.organizationId],
    references: [organizations.id],
  }),
  recruiter: one(users, {
    fields: [matchedJds.recruiterId],
    references: [users.id],
  }),
  candidate: one(candidates, {
    fields: [matchedJds.candidateId],
    references: [candidates.id],
  }),
}));

export const tokenConsumptionLedgerRelations = relations(tokenConsumptionLedger, ({ one }) => ({
  organization: one(organizations, {
    fields: [tokenConsumptionLedger.organizationId],
    references: [organizations.id],
  }),
  recruiter: one(users, {
    fields: [tokenConsumptionLedger.recruiterId],
    references: [users.id],
  }),
}));

// Export inferred types
export type Organization = typeof organizations.$inferSelect;
export type InsertOrganization = typeof organizations.$inferInsert;

export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;

export type Candidate = typeof candidates.$inferSelect;
export type InsertCandidate = typeof candidates.$inferInsert;

export type MatchedJd = typeof matchedJds.$inferSelect;
export type InsertMatchedJd = typeof matchedJds.$inferInsert;

export type TokenLedgerEntry = typeof tokenConsumptionLedger.$inferSelect;
export type InsertTokenLedgerEntry = typeof tokenConsumptionLedger.$inferInsert;

export type PlatformSetting = typeof platformSettings.$inferSelect;
export type InsertPlatformSetting = typeof platformSettings.$inferInsert;

export type Invoice = typeof invoices.$inferSelect;
export type InsertInvoice = typeof invoices.$inferInsert;
