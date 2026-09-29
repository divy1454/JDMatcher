# JDMatcher Enterprise

[![Fastify](https://img.shields.io/badge/Fastify-4.x-black?style=flat&logo=fastify)](https://www.fastify.io/)
[![Next.js](https://img.shields.io/badge/Next.js-15_(App_Router)-black?style=flat&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat&logo=typescript)](https://www.typescriptlang.org/)
[![Drizzle ORM](https://img.shields.io/badge/Drizzle_ORM-PostgreSQL-green?style=flat&logo=postgresql)](https://orm.drizzle.team/)
[![Chrome Extension](https://img.shields.io/badge/Chrome_Extension-Manifest_V3-yellow?style=flat&logo=googlechrome)](https://developer.chrome.com/docs/extensions/mv3/intro/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-3.x-38bdf8?style=flat&logo=tailwindcss)](https://tailwindcss.com/)

A high-velocity, zero-trust B2B SaaS platform engineered specifically for US IT bench sales recruiters and staffing agencies. It provides automated, sub-800ms evaluations of client job descriptions against bench candidate profiles with instant go/no-go verdicts, pure token accounting, real-life UPI QR invoicing, hardware anti-sharing device locks, dynamic waterfall prompting, an isolated Shadow DOM Chrome Extension, and real-time Server-Sent Events (SSE) telemetry.

---

## 🏛️ System Architecture

```
                                  +---------------------------------------+
                                  |         PostgreSQL Database           |
                                  |         (Supabase / Neon DB)          |
                                  +---------------------------------------+
                                                       ^
                                                       | Drizzle ORM (Connection Pool)
                                                       v
+-----------------------------+          +---------------------------------------+          +-----------------------------+
|   Super Admin Dashboard     | <======> |       Fastify Backend API Server      | <======> |     Agency Admin Portal     |
|   (Next.js 15 App Router)   |   REST   |  - tenantGuard   - deviceGuard        |   REST   |   (Next.js 15 App Router)   |
|   - Real-time Telemetry     |   SSE    |  - depositGuard  - waterfallPrompt    |          |   - Monthly Billing Ledger  |
|   - Invoice Generator       |          |  - inferenceEngine- tokenLedger       |          |   - Tax Invoice Download    |
|   - Zero-Knowledge Privacy  |          |  - upiQrService  - telemetryService   |          |   - Bench Candidates (ENUM) |
+-----------------------------+          +---------------------------------------+          +-----------------------------+
                                                       ^
                                                       | REST (JWT + x-device-id)
                                                       v
                                         +---------------------------------------+
                                         |     Chrome Extension (Manifest V3)    |
                                         |  - Isolated Open Shadow DOM Widget    |
                                         |  - Background Service Worker (Resil)  |
                                         |  - Local Storage Snapshot Cache       |
                                         +---------------------------------------+
```

---

## 🚀 Technology Stack

| Layer | Technology | Details |
|---|---|---|
| **Database** | PostgreSQL (Supabase / Neon) | Full ACID relational storage with custom PostgreSQL ENUMs |
| **ORM** | Drizzle ORM + `drizzle-kit` | Type-safe migrations, schema definitions, and pooled client |
| **Backend API** | Node.js + Fastify + TypeScript | High-throughput async REST server with Server-Sent Events (SSE) |
| **Frontend Web App** | Next.js 15 (App Router) + React 19 | Tailwind CSS, Lucide Icons, Recharts Analytics, Responsive Shell |
| **Browser Extension** | Chrome Manifest V3 + React 18 | Vite bundler, isolated Shadow DOM injection, zero host CSS leakage |
| **AI Inference** | Enterprise High-Speed LLM Engine | Sub-800ms low-latency candidate-to-JD evaluation pipeline |
| **Invoicing & Payments** | Real-Life Business Ledger + Dynamic UPI QR | Auto-filled amount & UPI QR code (`8999911999-2@ybl`), INR conversion |
| **Security Layer** | Device Fingerprinting + Zero-Knowledge | Hardware machine locking (`x-device-id`), strict role authorization |

---

## 📦 Project Structure

```
jdmatcher-enterprise/
├── package.json                          # Workspace root scripts
├── .env.example                          # Environment configuration template
├── backend/                              # Service 1: Fastify REST & SSE Backend
│   ├── src/
│   │   ├── db/
│   │   │   ├── index.ts                  # Drizzle database client & connection pool
│   │   │   ├── schema.ts                 # Full PostgreSQL schema with strict ENUMs
│   │   │   └── migrate.ts                # Migration runner
│   │   ├── middleware/
│   │   │   ├── authGuard.ts              # JWT authentication & role-based RBAC
│   │   │   ├── tenantGuard.ts            # Enforces organization isolation
│   │   │   ├── deviceGuard.ts            # Hardware device fingerprint verification (x-device-id)
│   │   │   └── depositGuard.ts           # Pre-flight HTTP 402 security deposit balance check
│   │   ├── services/
│   │   │   ├── inferenceService.ts       # Low-latency AI evaluation execution
│   │   │   ├── promptService.ts          # Dynamic waterfall prompt resolver & hydrator
│   │   │   ├── billingService.ts         # Pure token ledger accounting & deposit math
│   │   │   └── telemetryService.ts       # SSE event emitter for live activity streaming
│   │   ├── routes/
│   │   │   ├── auth.routes.ts            # Secure login, token refresh, device assignment
│   │   │   ├── analyze.routes.ts         # Instant candidate evaluation, save-applied persist
│   │   │   ├── orgs.routes.ts            # Org management, invoices, monthly expense breakdowns
│   │   │   ├── candidates.routes.ts      # Bench consultant profiles with strict ENUMs
│   │   │   ├── recruiters.routes.ts      # Recruiter seats, hardware locks & reset overrides
│   │   │   ├── promptSettings.routes.ts  # Global & Org-level custom evaluation prompts
│   │   │   └── telemetry.routes.ts       # Live SSE stream & Recharts aggregation endpoints
│   │   ├── scripts/
│   │   │   ├── seed.ts                   # Super Admin & agency seeder
│   │   │   └── test-billing-e2e.ts       # End-to-end billing validation script
│   │   └── server.ts                     # Fastify bootstrap & plugin registration
├── frontend/                             # Service 2: Next.js 15 App Router Frontend
│   └── src/
│       ├── app/
│       │   ├── admin/                    # Super Admin Dashboard (Telemetry, Orgs, Invoices, Prompts)
│       │   ├── org-portal/               # Agency Portal (Candidates, Team, Matched JDs, Billing Ledger)
│       │   │   ├── billing/              # Dedicated Monthly Billing Ledger & Invoice HUD
│       │   │   ├── candidates/           # Consultant management
│       │   │   ├── matched-jds/          # Submitted applications & history
│       │   │   └── team/                 # Recruiter seats & device status
│       │   └── login/                    # Zero-autofill enterprise credentials portal
│       ├── components/
│       │   ├── BillingCharts.tsx         # Recharts breakdown (Applied vs. Skipped evaluations)
│       │   ├── InvoiceModal.tsx          # Real-life business invoice preview with dynamic UPI QR
│       │   └── layout/                   # SuperAdminSidebar & OrgAdminSidebar navigation
│       └── lib/                          # Type-safe API client, auth context, currency formatters
└── extension/                            # Chrome Extension (Manifest V3)
    ├── manifest.json                     # MV3 configuration
    ├── dist/                             # Unpacked build ready to load in Chrome
    └── src/
        ├── background/                   # Resilient service worker (evaluations & storage cache)
        ├── content/                      # React floating draggable widget injected into open Shadow DOM
        └── styles/shadow.css             # Scoped styles guaranteeing zero host page CSS pollution
```

---

## 🔑 Core Features & Business Architecture

### 1. Pure Token Accounting & Real-Life Invoicing
- **Pure Token Model**: Agencies are charged purely for LLM tokens consumed during candidate evaluations.
- **Confidential Pricing**: The internal base pricing and agency profit multipliers remain strictly confidential to Super Admins. Agencies see only their total token usage and itemized billing totals.
- **Real-Life Tax Invoice Generation**:
  - Super Admins can generate formal monthly invoices for any agency.
  - When an invoice is generated, the agency unlocks an **"Invoice Download"** button in their dedicated **Billing Ledger** tab.
  - Invoices feature professional business headers:
    - **Issuer Details**: Divy Patel • +91 8999911999 • divy9954@gmail.com
    - **Dynamic UPI QR Code**: Instant auto-fill QR code pointing to `8999911999-2@ybl` with the total bill amount converted from USD to INR at real-time rates (e.g., ₹86.50 / USD).
    - **Itemized Breakdown**: Highlighting token usage, evaluation counts, invoice reference numbers, and payment terms.

### 2. Zero-Trust Hardware Device Lock (`x-device-id`)
- **Single Physical Node Binding**: Each recruiter seat is cryptographically bound to a unique physical device signature (`x-device-id`).
- **Anti-Credential Sharing**: If an agency recruiter attempts to log into the Chrome Extension or web portal from an unauthorized machine, the request is rejected with **HTTP 403 Device Mismatch**.
- **Admin Overrides**: A 30-day self-service transfer window is enforced with instant hardware reset overrides for Super Admins and Org Admins.

### 3. Sub-800ms Dynamic Waterfall Prompting
- The evaluation pipeline resolves prompts dynamically:
  1. **Priority 1 (Agency Override)**: Agency-specific `custom_eval_prompt` (if configured in Org Settings).
  2. **Priority 2 (Global Default)**: `platform_settings.GLOBAL_EVAL_PROMPT` (managed centrally in Super Admin).
- **Template Hydration**: Automatically maps consultant variables:
  `{{candidate_name}}`, `{{candidate_title}}`, `{{visa_status}}`, `{{clearance}}`, `{{work_preference}}`, `{{candidate_resume}}`, `{{jd_text}}`.
- Returns concise **Go / No-Go** recommendations with match percentages and justification.

### 4. Zero-Knowledge Tenant Isolation
- **Data Boundary Guarantee**: Super Admins have zero visibility into candidate raw resumes, job description text, or confidential client evaluations.
- **Strict PostgreSQL ENUMs**: Candidate records enforce standardized constraints:
  - **Visa Status**: `US Citizen`, `Green Card`, `H-1B`, `OPT`, `CPT`, `TN`, `E-3`, `H4-EAD`, `L2-EAD`, `Other`
  - **Work Preference**: `Remote`, `Hybrid`, `On-Site`
  - **Security Clearance**: `None`, `Public Trust`, `Secret`, `Top Secret`, `Top Secret/SCI`, `Polygraph`

### 5. Isolated Shadow DOM Chrome Extension
- Injected as an isolated **Floating Draggable Widget** inside an open Shadow DOM.
- Guarantees complete CSS isolation—preventing styling leakage on job platforms like LinkedIn, Dice, Indeed, Monster, and Greenhouse.
- Displays green (**APPLY**) or red (**SKIP**) verdict banners.
- Features one-click **"Save as Applied"** persistence to database or **"Discard"** to avoid bloat.

### 6. Live SSE Telemetry & Visual Analytics
- Real-time Server-Sent Events (SSE) telemetry feed streaming live agency evaluations to the Super Admin HUD.
- Agency dashboard includes Recharts data visualizations displaying:
  - Monthly expense trajectories.
  - Evaluation breakdown (Total vs. Applied vs. Skipped).
  - High-contrast, theme-consistent hover tooltips.

---

## 🛠️ Getting Started

### Prerequisites
- **Node.js**: v18.0.0 or higher
- **PostgreSQL**: Local instance or cloud database (Supabase / Neon)
- **Google Chrome**: For running the Manifest V3 extension

---

### Step 1: Environment Configuration

Create a `.env` file in the root directory (or respective `backend/.env` and `frontend/.env`):

#### Backend (`backend/.env`):
```env
PORT=4000
DATABASE_URL=postgresql://postgres:password@localhost:5432/jdmatcher
JWT_SECRET=super-secret-enterprise-key-at-least-32-chars
AI_API_KEY=your_inference_api_key_here
FRONTEND_URL=http://localhost:3000
```

#### Frontend (`frontend/.env`):
```env
NEXT_PUBLIC_API_URL=http://localhost:4000
```

---

### Step 2: Database Setup & Seeding

Run the database schema push and initialize the system:

```bash
cd backend
npm install
npm run db:push
npm run db:seed
```

#### Default Credentials:
| Portal | Role | Email | Password |
|---|---|---|---|
| `/login` | **Super Admin** | Configured in `backend/src/scripts/seed.ts` | Configured securely in seed script |
| `/login` | **Agency Admin** | `admin@apexit.com` | `ApexAdmin2026!` |
| Chrome Ext | **Recruiter** | `recruiter@apexit.com` | `Recruiter2026!` |

---

### Step 3: Run the Development Servers

#### Terminal 1 — Fastify Backend:
```bash
cd backend
npm run dev
# Server listening on http://localhost:4000
```

#### Terminal 2 — Next.js 15 Frontend:
```bash
cd frontend
npm run dev
# Frontend live at http://localhost:3000
```

---

### Step 4: Install the Chrome Extension

1. Build the extension (or use the pre-built `extension/dist` folder):
   ```bash
   cd extension
   npm install
   npm run build
   ```
2. Open Chrome and navigate to `chrome://extensions/`.
3. Toggle on **Developer mode** in the top-right corner.
4. Click **Load unpacked**.
5. Select the `extension/dist` directory.
6. Pin the extension and open any job posting page to test evaluations!

---

## 📡 Key API Routes

### Authentication (`/api/auth`)
- `POST /login` — Authenticate user and issue JWT token.
- `POST /switch-device` — Request hardware device binding transfer.
- `GET /me` — Fetch authenticated profile and assigned organization.

### Evaluation Engine (`/api/analyze`)
- `POST /evaluate` — Execute sub-second JD evaluation against candidate profile.
- `POST /save-applied` — Persist JD and application record to `matched_jds`.

### Organization & Invoicing (`/api/orgs`)
- `GET /` — List all organizations (Super Admin only).
- `GET /:orgId/expenses` — Retrieve monthly itemized token usage and billing history.
- `POST /:orgId/invoices` — Generate an official monthly bill (Super Admin only).
- `GET /:orgId/invoices/:invoiceId` — Download official invoice payload.
- `PATCH /:orgId/mark-paid` — Clear outstanding balance and mark invoice paid.

### Bench Candidates (`/api/candidates`)
- `GET /` — List agency bench consultants.
- `POST /` — Add candidate with strict visa, clearance, and skill tags.
- `PUT /:id` — Update consultant details.

---

## 🔒 Security Best Practices

1. **Anti-Leak Policy**: Raw LLM model names and supplier telemetry are obfuscated throughout all client responses.
2. **Zero-Trust Device Binding**: Recruiter authentication requires both valid JWT bearer tokens and matching `x-device-id` hardware headers.
3. **No Staged Credentials**: Login screens enforce zero auto-fill values to protect enterprise workstations from credential exposure.
4. **Deposit Guard**: Proactive HTTP 402 interceptor shuts down rogue evaluation loops if security deposit thresholds are exceeded.

---

## 📄 License

Proprietary enterprise software. All rights reserved. Confidential property of JDMatcher Enterprise.
