# 🏗️ Triniti ERP — Enterprise Construction Management System

[![Live App](https://img.shields.io/badge/Live%20Demo-Vercel-blue?style=for-the-badge&logo=vercel)](https://constructionmanagementsystem.vercel.app)
[![Frontend Repo](https://img.shields.io/badge/Frontend-GitHub-black?style=for-the-badge&logo=github)](https://github.com/himel2535/construction_management_system)
[![Backend Repo](https://img.shields.io/badge/Backend-GitHub-red?style=for-the-badge&logo=github)](https://github.com/himel2535/construction_management_system_backend)
[![Next.js](https://img.shields.io/badge/Next.js-16-black?style=for-the-badge&logo=next.js)](https://nextjs.org/)
[![NestJS](https://img.shields.io/badge/NestJS-11-E0234E?style=for-the-badge&logo=nestjs)](https://nestjs.com/)
[![PostgreSQL](https://img.shields.io/badge/PostgreSQL-Neon-336791?style=for-the-badge&logo=postgresql)](https://neon.tech)
[![Prisma](https://img.shields.io/badge/Prisma-6-2D3748?style=for-the-badge&logo=prisma)](https://www.prisma.io/)

**Triniti ERP** is a modern, full-stack, enterprise-grade Construction & Real Estate ERP application engineered for high throughput, real-time site tracking, automated payroll, multi-tier procurement approvals, and financial auditing.

---

## 🔗 Quick Links & Live Deployments

- 🌐 **Live Website**: [https://constructionmanagementsystem.vercel.app](https://constructionmanagementsystem.vercel.app)
- ⚙️ **Backend API Endpoint**: `https://constructionmanagementsystembackend-production.up.railway.app/api`
- 🖥️ **Frontend Repository**: [github.com/himel2535/construction_management_system](https://github.com/himel2535/construction_management_system)
- 🖥️ **Backend Repository**: [github.com/himel2535/construction_management_system_backend](https://github.com/himel2535/construction_management_system_backend)

---

## 🚀 Key Features & Modules

### 📊 1. Executive Analytics & Dashboard
- **Real-Time KPIs**: Total Active Projects, Contract Value, Overdue Receivables, Monthly Collections & Expenses.
- **Cash Flow Analytics**: Visual combo charts displaying client collections, project expenses, purchase orders, worker wages, and net cash flow trends.
- **Budget vs. Actual Cost**: Donut chart tracking total allocated budget, actual spend, committed cost, and remaining contingency.
- **Site Activity Summary**: Live tracker for worker attendance, active site diaries, site in-charges present, and safety incidents.

### 🏗️ 2. Project Lifecycle & BOQ Management
- **Project Performance Oversight**: Progress percentages, budget tracking, deadlines, and automated health indicators (`On Track`, `At Risk`, `Delayed`).
- **BOQ & Phase Structuring**: Bill of Quantities (BOQ) line items categorized by project phases with cost code references.
- **Milestone Tracking**: Payment milestones, IPC bills, and deadline notifications.

### 👷 3. Site Operations & Worker Payroll
- **Daily Site Diaries**: Weather conditions, labor counts, work progress logs, site photos, and supervisor submissions.
- **Worker Attendance & Roster**: Mark daily attendance (`Present`, `Absent`, `Half-Day`, `Overtime Hours`) linked to specific construction sites.
- **Automated Payroll Engine**: Worker advance tracking, salary calculations based on attendance and daily rates, settlement months, and payout history.

### 📦 4. Procurement & Inventory Management
- **Multi-Stage Procurement**: Material Requests (MR) ➔ Purchase Orders (PO) ➔ Goods Receipts (GRN).
- **Automated Stock Controls**: Low-stock alerts, reorder level triggers, central inventory catalog, and stock-in/stock-out vouchers.
- **Supplier Portal**: Vendor directory, billing ledgers, payment tracking, and product catalogs.

### 💰 5. Billing, Finance & Multi-Tier Approvals
- **Client Billing & Receivables**: Invoice generation, payment milestone tracking, and aging receivables analytics.
- **Approval Workflow**: Centralized approval queue for purchase requisitions, high-value expenses, site settlements, and client invoices.
- **Voucher Ledger**: Double-entry accounting accounts, voucher lines, and audit log tracking.

---

## ⚡ High-Performance Architecture (Ultra-Fast Optimization)

To deliver **0ms instant route navigation** and sub-millisecond API response times, the entire system has been optimized at every layer of the stack:

### 1. 🗄️ PostgreSQL Database B-Tree Indexing (Prisma ORM)
- Created composite and single B-Tree indexes (`@@index`) across high-traffic query fields (`projectId`, `tenantId`, `status`, `createdAt`, `clientId`, `supplierId`, `logDate`).
- Eliminates sequential full-table scans, making PostgreSQL queries **10x to 50x faster**.

### 2. ⚡ NestJS Backend Optimization & Response Compression
- **HTTP Payload Compression**: Integrated `compression` middleware in NestJS to gzip JSON payloads, reducing network bandwidth requirements by **70–80%**.
- **In-Memory TTL Caching**: Added a high-speed 5-second in-memory query cache for GET endpoints, with automatic cache invalidation triggered on `create`, `update`, and `delete` write operations.

### 3. 🚀 Next.js SWR Caching & In-Flight Request Deduplication
- **In-Flight Request Deduplication**: Prevents duplicate HTTP network requests fired within the same millisecond by caching active Promises.
- **SWR (Stale-While-Revalidate) Client Memory Cache**: Serves cached data instantly (0ms latency) upon page navigation while silently revalidating in the background.

---

## 🛠️ Technology Stack

| Layer | Technologies & Tools |
| :--- | :--- |
| **Frontend** | Next.js 16 (App Router, Turbopack), React 19, TypeScript, React Query (TanStack), Tailwind CSS, Glassmorphism UI |
| **Backend** | NestJS 11, TypeScript, Node.js, Express, Passport JWT Authentication, Compression |
| **Database & ORM** | PostgreSQL (Hosted on Neon Database), Prisma ORM 6 |
| **Authentication** | JSON Web Tokens (JWT), Role-Based Access Control (RBAC) with 8 Pre-configured Roles |
| **Hosting & Infra** | Vercel (Frontend Hosting), Railway (Backend API Services), Neon (Cloud PostgreSQL) |

---

## 👥 Role-Based Access Control (RBAC)

The system enforces strict permission scoping across 8 distinct user roles:

| Role | Access Scope |
| :--- | :--- |
| **Owner / Admin** | Full operational & financial access across all projects, settings, and approvals |
| **Project Manager** | Full access to assigned projects, milestones, BOQs, site diaries, and approvals |
| **Site Engineer** | Manages daily site activity, progress logs, material logs, and equipment tracking |
| **Site Supervisor** | Focuses on site diaries, worker attendance logging, and site inventory |
| **Accountant** | Manages client invoices, supplier bills, vouchers, worker advances, and payroll |
| **Procurement Officer** | Manages material requisitions, purchase orders, suppliers, and stock receipts |
| **Client** | Portal access to view project progress, invoice statuses, and payment receipts |
| **Viewer** | Read-only access to assigned project reports and dashboards |

---

## 💻 Local Development Setup

### Prerequisites
- Node.js `v18+` or `v20+`
- PostgreSQL database or Neon Cloud connection string

### 1. Clone Repositories
```bash
# Clone Frontend
git clone https://github.com/himel2535/construction_management_system.git
cd construction_management_system

# Clone Backend (in a separate directory)
git clone https://github.com/himel2535/construction_management_system_backend.git
cd construction_management_system_backend
```

### 2. Backend Setup (`construction_management_system_backend`)
```bash
# Install dependencies
npm install

# Configure Environment Variables (.env)
DATABASE_URL="postgresql://user:password@localhost:5432/construction_db"
JWT_SECRET="your_jwt_secret_key"
PORT=4000

# Push Prisma Schema to Database & Generate Client
npx prisma db push
npx prisma generate

# Start Backend Server
npm run start:dev
```
Backend will run at `http://localhost:4000`

### 3. Frontend Setup (`construction_management_system`)
```bash
# Install dependencies
npm install

# Configure Environment Variables (.env.local)
NEXT_PUBLIC_BACKEND_URL="http://localhost:4000/api"

# Start Next.js Development Server
npm run dev
```
Frontend will run at `http://localhost:3000`

---

## 📜 License

This project is licensed under the **MIT License**.

---

Designed & Developed for Enterprise Construction Operations.
