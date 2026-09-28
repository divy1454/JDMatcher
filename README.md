# JDMatcher Enterprise

A high-performance B2B SaaS platform engineered specifically for US IT Bench Sales recruiters and staffing agencies. It provides instant, automated evaluations of Job Descriptions against bench candidate profiles with ruthless precision, offline security deposit billing, hardware anti-sharing locks, dynamic waterfall prompting, an isolated Shadow DOM Chrome Extension, and real-time Server-Sent Events (SSE) telemetry.

---

## 🏛️ System Architecture

```
                                  +---------------------------------------+
                                  |           Supabase PostgreSQL         |
                                  +---------------------------------------+
                                                      ^
                                                      | Drizzle ORM (Connection Pool)
                                                      v
+-----------------------------+          +---------------------------------------+          +-----------------------------+
|   Super Admin Dashboard     | <======> |       Fastify Backend API Server      | <======> |     Org Admin Dashboard     |
|   (Next.js 15 App Router)   |   REST   |  - tenantGuard   - deviceGuard        |   REST   |   (Next.js 15 App Router)   |
|   - Live SSE Telemetry      |   SSE    |  - depositGuard  - waterfallPrompt    |          |   - Billing HUD             |
|   - Zero-Knowledge Tenant   |          |  - geminiService - billingLedger      |          |   - Candidates (Strict ENUM)|
+-----------------------------+          +---------------------------------------+          +-----------------------------+
                                                      ^
                                                      | REST (JWT + x-device-id)
                                                      v
                                         +---------------------------------------+
                                         |     Chrome Extension (Manifest V3)    |
                                         |  - Content Script (Shadow DOM Widget) |
                                         |  - Background Service Worker (Resil)  |
                                         |  - chrome.storage.local Cache         |
                                         +---------------------------------------+
```

---

## 🚀 Technology Stack

| Layer | Technology |
|---|---|
| **Database** | Supabase PostgreSQL |
| **ORM** | Drizzle ORM with `drizzle-kit` |
| **Backend API** | Node.js with Fastify & TypeScript |
| **Dashboards** | Next.js 15 (App Router), Tailwind CSS, Lucide React, Recharts |
| **Chrome Extension** | Manifest V3, React 18, Vite, Isolated Shadow DOM |
| **AI Engine** | Google Gemini 3.5 Flash-Lite via `@google/genai` |
| **Deployment Context** | Monorepo designed for Render (Service 1: Backend, Service 2: Frontend) |

---

## 📦 Project Structure

```
jdmatcher-enterprise/
├── docker-compose.yml                    # Local PostgreSQL container (optional)
├── package.json                          # Workspace root scripts
├── .env.example                          # Environment template
├── backend/                              # Service 1: Fastify REST & SSE Backend
│   ├── src/
│   │   ├── db/
│   │   │   ├── index.ts                  # Drizzle client & connection pool
│   │   │   ├── schema.ts                 # Full PostgreSQL schema with Enums
│   │   │   └── migrate.ts                # Migration runner
│   │   ├── middleware/
│   │   │   ├── authGuard.ts              # JWT verification & role authorization
│   │   │   ├── tenantGuard.ts            # Enforces organization boundary
│   │   │   ├── deviceGuard.ts            # Recruiter machine fingerprint (x-device-id)
│   │   │   └── depositGuard.ts           # Pre-flight HTTP 402 deposit limit check
│   │   ├── services/
│   │   │   ├── geminiService.ts          # @google/genai client with Flash-Lite
│   │   │   ├── promptService.ts          # Waterfall prompt resolver & hydrator
│   │   │   ├── billingService.ts         # Token ledger accounting & deposit math
│   │   │   └── telemetryService.ts       # SSE event emitter for live stream
│   │   ├── routes/
│   │   │   ├── auth.routes.ts            # Login, device switch, token refresh
│   │   │   ├── analyze.routes.ts         # Eval execution, save-applied persist
│   │   │   ├── orgs.routes.ts            # Org CRUD, deposit limits, "Mark as Paid"
│   │   │   ├── candidates.routes.ts      # Candidates with strict ENUMs
│   │   │   ├── recruiters.routes.ts      # Recruiter seats & hardware resets
│   │   │   ├── promptSettings.routes.ts  # Global & Org custom prompts
│   │   │   └── telemetry.routes.ts       # SSE stream & Recharts aggregates
│   │   ├── scripts/
│   │   │   └── seed.ts                   # Super Admin & demo agency seeder
│   │   └── server.ts                     # Fastify bootstrap
├── frontend/                             # Service 2: Next.js 15 App Router Frontend
│   └── src/
│       ├── app/
│       │   ├── admin/                    # Super Admin Dashboard (Telemetry, Orgs, Prompts, Recruiters)
│       │   ├── org-portal/               # Org Admin Dashboard (Billing HUD, Candidates, Team, Matched JDs)
│       │   └── login/                    # Strict enterprise login (Zero public signups)
│       ├── components/layout/            # Collapsible sidebars (SuperAdminSidebar, OrgAdminSidebar)
│       └── lib/                          # Typed API client, Auth Context, utilities
└── extension/                            # Chrome Extension (Manifest V3)
    ├── manifest.json                     # MV3 configuration
    ├── dist/                             # Unpacked build ready to load in Chrome
    └── src/
        ├── background/                   # Resilient service worker (evaluations & storage)
        ├── content/                      # React floating widget injected into open Shadow DOM
        └── styles/shadow.css             # Scoped styles preventing host site style pollution
```

---

## 🔑 Core Architectural Features & Business Rules

### 1. Offline Security Deposit Billing (No Stripe)
- Agencies operate on a zero-risk prepaid security deposit (e.g., $500.00).
- For every evaluation:
  $$\text{Raw Cost} = (\text{InputTokens} / 1,000,000 \times \$0.30) + (\text{OutputTokens} / 1,000,000 \times \$2.50)$$
  $$\text{Billed Cost} = \text{Raw Cost} \times \text{profitMultiplier (e.g. 4.0x)}$$
- `depositGuard` executes before LLM inference. If `total_billed_amount >= security_deposit_limit`, it returns **HTTP 402 Payment Required** and locks the Chrome Extension.
- Super Admin dashboard features a **"Mark as Paid"** button for each agency that clears the balance back to **$0.00**.

### 2. Recruiter Hardware Lock (`x-device-id`)
- Recruiter seats are locked to a single physical machine fingerprint (`x-device-id`).
- On initial login, the machine ID is bound to the recruiter record.
- If a recruiter attempts to evaluate from an unauthorized computer, a **403 Device Mismatch** error is thrown.
- A **30-day self-service transfer window** is enforced. Super Admins and Org Admins have emergency reset overrides.

### 3. Dynamic Waterfall Prompting Engine
- The evaluation prompt is resolved dynamically:
  1. **Priority 1**: Agency `custom_eval_prompt` (if configured in Org Settings).
  2. **Priority 2**: Fallback to `platform_settings.GLOBAL_EVAL_PROMPT` (managed in Super Admin).
- Hydrates variables before sending to Gemini:
  `{{candidate_name}}`, `{{candidate_title}}`, `{{visa_status}}`, `{{clearance}}`, `{{work_preference}}`, `{{candidate_resume}}`, `{{jd_text}}`.

### 4. Candidate Profile Strictness & Zero-Knowledge Privacy
- Candidate records enforce strict PostgreSQL ENUM dropdowns:
  - **Visa Status**: `US Citizen`, `Green Card`, `H-1B`, `OPT`, `CPT`, `TN`, `E-3`, `H4-EAD`, `L2-EAD`, `Other`
  - **Work Preference**: `Remote`, `Hybrid`, `On-Site`
  - **Security Clearance**: `None`, `Public Trust`, `Secret`, `Top Secret`, `Top Secret/SCI`, `Polygraph`
- Includes hidden raw resume text blocks.
- **Zero-Knowledge Privacy**: Super Admin APIs are strictly blocked from viewing candidate resumes, job descriptions, or evaluation verdicts.

### 5. Chrome Extension (Shadow DOM & Resilient Background Sync)
- Injected as an isolated **Floating Draggable Widget** inside an open Shadow DOM to guarantee zero styling conflicts with LinkedIn, Dice, Indeed, or Greenhouse.
- When **"Evaluate"** is clicked, the task is handed to `background.js` Service Worker. Reopening the widget restores evaluation state from `chrome.storage.local`.
- Displays Green (**APPLY**) or Red (**SKIP**) verdict banner with qualification breakdown.
- Action Buttons:
  - **Save as Applied**: Persists the raw JD to `matched_jds` in the DB.
  - **Discard**: Clears local storage state with **zero database bloat**.
- Recruiters never see token costs or quota meters.

---

## ⚡ Quick Start Guide

### 1. Database & Seeding
Set your `DATABASE_URL` in `.env` (or use `docker compose up -d` for local PostgreSQL):
```bash
# In backend/
npm run db:seed
```

Seeded Accounts:
- **Super Admin**: `admin@jdmatcher.internal` / `ChangeMeInProd123!`
- **Org Admin (Apex IT)**: `admin@apexit.com` / `ApexAdmin2026!`
- **Recruiter (Apex IT)**: `recruiter@apexit.com` / `Recruiter2026!`

### 2. Start Backend API
```bash
cd backend
npm run dev
# Running on http://localhost:4000
```

### 3. Start Next.js Frontend
```bash
cd frontend
npm run dev
# Running on http://localhost:3000
```

### 4. Load Chrome Extension in Browser
1. In Chrome, open `chrome://extensions/`.
2. Enable **Developer mode** (top-right toggle).
3. Click **Load unpacked**.
4. Select the `extension/dist` folder.
5. The JDMatcher widget will inject into any job board webpage!
