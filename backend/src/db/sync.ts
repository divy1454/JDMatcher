import pg from 'pg';
import { env } from '../env.js';

const { Client } = pg;

async function syncSchema() {
  console.log('Connecting to Supabase PostgreSQL at:', env.DATABASE_URL.replace(/:[^:@]+@/, ':****@'));
  const client = new Client({ connectionString: env.DATABASE_URL });
  await client.connect();

  const ddl = `
DO $$ BEGIN
  CREATE TYPE "user_role" AS ENUM('super_admin', 'org_admin', 'recruiter');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "visa_status" AS ENUM('US Citizen', 'Green Card', 'H-1B', 'OPT', 'CPT', 'TN', 'E-3', 'H4-EAD', 'L2-EAD', 'Other');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "work_preference" AS ENUM('Remote', 'Hybrid', 'On-Site');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "security_clearance" AS ENUM('None', 'Public Trust', 'Secret', 'Top Secret', 'Top Secret/SCI', 'Polygraph');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "eval_verdict" AS ENUM('APPLY', 'SKIP');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TYPE "invoice_status" AS ENUM('draft', 'pending', 'generated', 'paid', 'overdue', 'void');
EXCEPTION WHEN duplicate_object THEN null;
END $$;

CREATE TABLE IF NOT EXISTS "organizations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "name" varchar(255) NOT NULL,
  "slug" varchar(100) NOT NULL UNIQUE,
  "security_deposit_limit" numeric(12, 4) NOT NULL DEFAULT '500.0000',
  "total_billed_amount" numeric(12, 4) NOT NULL DEFAULT '0.0000',
  "profit_multiplier" numeric(6, 2) NOT NULL DEFAULT '4.00',
  "custom_eval_prompt" text,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "users" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid REFERENCES "organizations"("id") ON DELETE CASCADE,
  "role" "user_role" NOT NULL,
  "email" varchar(255) NOT NULL UNIQUE,
  "password_hash" varchar(255) NOT NULL,
  "full_name" varchar(255) NOT NULL,
  "device_id" varchar(255),
  "device_last_locked_at" timestamp with time zone,
  "device_switch_allowed_after" timestamp with time zone,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "candidates" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "created_by_recruiter_id" uuid REFERENCES "users"("id") ON DELETE SET NULL,
  "full_name" varchar(255) NOT NULL,
  "primary_title" varchar(255) NOT NULL,
  "visa_status" "visa_status" NOT NULL,
  "work_preference" "work_preference" NOT NULL,
  "security_clearance" "security_clearance" NOT NULL DEFAULT 'None',
  "years_of_experience" integer NOT NULL DEFAULT 0,
  "key_skills" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "raw_resume_text" text NOT NULL,
  "is_active" boolean NOT NULL DEFAULT true,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "matched_jds" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "recruiter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "candidate_id" uuid NOT NULL REFERENCES "candidates"("id") ON DELETE CASCADE,
  "job_title" varchar(255) NOT NULL,
  "company_or_client" varchar(255),
  "job_url" text,
  "raw_jd_text" text NOT NULL,
  "verdict" "eval_verdict" NOT NULL,
  "match_score" integer NOT NULL,
  "match_reasoning" text NOT NULL,
  "applied_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "token_consumption_ledger" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "recruiter_id" uuid NOT NULL REFERENCES "users"("id") ON DELETE CASCADE,
  "input_tokens" integer NOT NULL,
  "output_tokens" integer NOT NULL,
  "total_tokens" integer NOT NULL,
  "raw_cost_usd" numeric(12, 6) NOT NULL,
  "profit_multiplier" numeric(6, 2) NOT NULL,
  "billed_cost_usd" numeric(12, 6) NOT NULL,
  "latency_ms" integer NOT NULL,
  "model_name" varchar(100) NOT NULL DEFAULT 'gemini-3.5-flash-lite',
  "timestamp" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "platform_settings" (
  "key" varchar(100) PRIMARY KEY,
  "value" text NOT NULL,
  "description" text,
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS "invoices" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "organization_id" uuid NOT NULL REFERENCES "organizations"("id") ON DELETE CASCADE,
  "invoice_number" varchar(100) NOT NULL UNIQUE,
  "billing_month" varchar(7) NOT NULL,
  "period_start" timestamp with time zone NOT NULL,
  "period_end" timestamp with time zone NOT NULL,
  "issue_date" timestamp with time zone NOT NULL DEFAULT now(),
  "due_date" timestamp with time zone NOT NULL,
  "status" "invoice_status" NOT NULL DEFAULT 'generated',
  "is_generated" boolean NOT NULL DEFAULT true,
  "total_evaluations" integer NOT NULL DEFAULT 0,
  "total_tokens" integer NOT NULL DEFAULT 0,
  "raw_cost_usd" numeric(12, 4) NOT NULL DEFAULT '0.0000',
  "subtotal_usd" numeric(12, 4) NOT NULL DEFAULT '0.0000',
  "tax_usd" numeric(12, 4) NOT NULL DEFAULT '0.0000',
  "total_amount_usd" numeric(12, 4) NOT NULL DEFAULT '0.0000',
  "exchange_rate_inr" numeric(10, 4) NOT NULL DEFAULT '86.5000',
  "total_amount_inr" numeric(12, 2) NOT NULL DEFAULT '0.00',
  "upi_id" varchar(100) NOT NULL DEFAULT '8999911999-2@ybl',
  "owner_name" varchar(255) NOT NULL DEFAULT 'Divy Patel',
  "owner_phone" varchar(50) NOT NULL DEFAULT '+91 8999911999',
  "owner_email" varchar(255) NOT NULL DEFAULT 'divy9954@gmail.com',
  "line_items" jsonb NOT NULL DEFAULT '[]'::jsonb,
  "notes" text,
  "generated_by" varchar(255),
  "generated_at" timestamp with time zone,
  "paid_at" timestamp with time zone,
  "created_at" timestamp with time zone NOT NULL DEFAULT now(),
  "updated_at" timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS "candidates_org_idx" ON "candidates"("organization_id");
CREATE INDEX IF NOT EXISTS "candidates_recruiter_idx" ON "candidates"("created_by_recruiter_id");
CREATE INDEX IF NOT EXISTS "matched_jds_org_idx" ON "matched_jds"("organization_id");
CREATE INDEX IF NOT EXISTS "matched_jds_candidate_idx" ON "matched_jds"("candidate_id");
CREATE INDEX IF NOT EXISTS "ledger_org_idx" ON "token_consumption_ledger"("organization_id");
CREATE INDEX IF NOT EXISTS "ledger_timestamp_idx" ON "token_consumption_ledger"("timestamp");
CREATE INDEX IF NOT EXISTS "users_org_idx" ON "users"("organization_id");
CREATE INDEX IF NOT EXISTS "users_device_idx" ON "users"("device_id");
CREATE INDEX IF NOT EXISTS "invoices_org_idx" ON "invoices"("organization_id");
CREATE INDEX IF NOT EXISTS "invoices_month_idx" ON "invoices"("billing_month");
CREATE INDEX IF NOT EXISTS "invoices_status_idx" ON "invoices"("status");

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ language 'plpgsql';

DO $$ BEGIN
  CREATE TRIGGER update_organizations_updated_at BEFORE UPDATE ON organizations FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_users_updated_at BEFORE UPDATE ON users FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_candidates_updated_at BEFORE UPDATE ON candidates FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
  CREATE TRIGGER update_invoices_updated_at BEFORE UPDATE ON invoices FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
EXCEPTION WHEN duplicate_object THEN null;
END $$;
  `;

  await client.query(ddl);
  console.log('✅ All tables, ENUMs, and indices synced to Supabase successfully!');
  await client.end();
}

export { syncSchema };

if (process.argv[1] && (process.argv[1].endsWith('sync.ts') || process.argv[1].endsWith('sync.js'))) {
  syncSchema().catch((err) => {
    console.error('Schema sync failed:', err);
    process.exit(1);
  });
}
