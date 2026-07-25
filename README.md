# Construction ERP — Triniti

A web-based ERP for construction companies. Manage projects, procurement, inventory, HR, billing, and reports from one place.

## Links

- Live demo: https://constructionerp-delta.vercel.app/
- GitHub: https://github.com/himel2535/construction_management_system
- Build version: 20260526.3

## What is this?

Triniti is a construction and real estate ERP built as a single-page web app. It covers the full workflow of a construction business — from contract and BOQ setup to site work, procurement, payroll, billing, and financial reporting.

The app uses vanilla JavaScript with no frontend framework. All data is stored in Firebase Realtime Database with real-time sync, multi-tenant support, and role-based access control.

## Features

**Projects**
- Government and private projects
- BOQ, milestones, progress tracking, project billing

**Supply chain**
- Suppliers, purchase orders, GRN, inventory, issue vouchers

**HR and site**
- Worker directory, attendance, payroll, site diary, site incharge

**Finance**
- Billing, accounting, budget vs actual, profit and loss

**Approvals**
- Role-based approval queue for expenses, POs, and bills

**Real-time**
- Firebase RTDB, multi-tenant architecture, offline sync queue

## Modules

- Dashboard (`/dashboard`) — KPIs, cash flow, pending approvals, attention alerts
- Projects (`/projects`) — contract, BOQ, team, milestones, billing
- Site Management (`/site-incharge`) — site diary, material log, daily progress
- Clients / Contacts (`/clients`) — client directory and linked projects
- Procurement (`/purchases`) — material requests, PO, GRN workflow
- Suppliers (`/suppliers`) — vendor ledger and payment aging
- Inventory (`/inventory`) — stock in/out, catalog, reorder alerts
- HR and Payroll (`/workers`) — worker directory, attendance, salary
- Assets and Equipment (`/assets`) — asset register, assignment, maintenance
- Billing (`/billing`) — invoices, collections, overdue tracking
- Finance (`/accounting`) — revenue, expenses, manual vouchers
- Approvals (`/approvals`) — central approval queue
- Reports (`/reports`) — project cost, analytics, worker payroll
- Client Portal (`/client-portal`) — client-facing project progress and billing
- Settings (`/settings`) — users, roles, company profile

Other routes: `/projects/new`, `/clients/new`, `/reports/project-cost`, `/reports/analytics`, `/reports/worker-payroll`, `/arbitration`

## User roles

- Owner — full access to all modules, users, and permissions
- Project Manager — dashboard, clients, projects, workers, site management, procurement, approvals, reports
- Site Engineer — dashboard, projects, site management, approvals
- Site Supervisor — dashboard, projects, site management, workers
- Accountant — dashboard, clients, billing, accounting, reports, approvals
- Procurement Officer — dashboard, procurement, suppliers, inventory, reports
- Client — client portal and settings only
- Viewer — dashboard, reports, settings (read-only)

Role definitions are in [util_roles.js](util_roles.js).

## Tech stack

- Frontend: Vanilla JavaScript (ES Modules)
- Database: Firebase Realtime Database (erptriniti)
- Styling: Custom CSS with design tokens
- Routing: Custom SPA router (History API)
- Deploy: Vercel (demo), cPanel static bundle (production)
- Build: esbuild (optional production bundle)

App flow:

```
Browser → router.js → page_*.js → svc_*.js → Firebase RTDB
```

## Project structure

The codebase uses a flat, prefix-based layout (no nested src folder):

- `page_` — route screens (e.g. page_dashboard.js, page_inventory.js)
- `cmp_` — UI components (e.g. cmp_layout.js, cmp_table.js)
- `svc_` — business logic and Firebase (e.g. svc_data.js, svc_auth.js)
- `util_` — helpers (e.g. util_roles.js, util_format.js)

Core files: [index.html](index.html), [app.js](app.js), [router.js](router.js), [firebase.js](firebase.js), [styles.css](styles.css)

Full reference: [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md)

## Run locally

Requirements: Node.js 18+, Firebase RTDB configured in [firebase.js](firebase.js)

```bash
git clone https://github.com/himel2535/construction_management_system.git
cd construction_management_system
npm install
npm run dev
```

Open http://localhost:3000

Note: Demo mode may use open RTDB rules. Do not store sensitive production data until Firebase Auth and secure rules are deployed. See [firebase/FIREBASE_SECURE.md](firebase/FIREBASE_SECURE.md).

## Deploy

- Vercel (live demo) — static SPA deploy, all routes rewrite to index.html. Config: [vercel.json](vercel.json)
- cPanel (production) — minified bundle upload to public_html. Guide: [DEPLOY.md](DEPLOY.md)

## More documentation

- [PROJECT_STRUCTURE.md](PROJECT_STRUCTURE.md) — full folder and feature reference
- [DEPLOY.md](DEPLOY.md) — cPanel and bundle deploy guide
- [presentation_documentation.html](presentation_documentation.html) — office presentation (Bangla)
- [firebase/FIREBASE_SECURE.md](firebase/FIREBASE_SECURE.md) — production security checklist

Author: himel2535 — https://github.com/himel2535
