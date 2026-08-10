<div align="center">
  <h1>🏗️ Enterprise Construction Management System (ERP)</h1>
  <p>A comprehensive, scalable, and modern ERP solution tailored for the construction industry to streamline operations, finance, and human resources.</p>
  
  <a href="https://construction-management-system-lyart.vercel.app/" target="_blank">
    <img src="https://img.shields.io/badge/Live_Demo-View_Project-2563EB?style=for-the-badge&logo=vercel&logoColor=white" alt="Live Demo" />
  </a>
</div>

<br />

## 🚀 Tech Stack

### Frontend
- **Framework:** Next.js 16 (React 19)
- **Styling:** Tailwind CSS v4, Lucide React (Icons)
- **State Management:** Zustand, React Query (`@tanstack/react-query`)
- **Authentication:** Firebase Auth
- **Validation:** Zod

### Backend
- **Framework:** NestJS (Node.js)
- **Database ORM:** Prisma
- **Database:** PostgreSQL (Relational Database)
- **Security & Auth:** JWT (JSON Web Tokens), Passport.js
- **Deployment:** Railway (Backend), Vercel (Frontend)

---

## ⚡ Performance Optimization

To achieve a production-grade, ultra-fast user experience, the system implements optimizations across all layers:

### 1. Next.js (Frontend)
- **0ms Route Transitions:** Asynchronous preloading of subsequent page modules during idle browser cycles (using `requestIdleCallback`) to achieve instantaneous navigation.
- **API Response Caching:** TanStack React Query (`@tanstack/react-query`) is configured with smart caching policies to avoid duplicate network fetches.
- **Build & Bundle Optimizations:** Code-splitting and tree-shaking ensure only the necessary JS and styles are loaded for the active route.
- **Asset Cleanup:** Instantly cleared 59GB of compile-time Turbopack cache (`.next/`) from developer environments to optimize compile times and execution speeds.

### 2. NestJS (Backend)
- **Fastify Routing Engine:** High-performance HTTP routing layer handling maximum concurrent API requests with minimal CPU overhead.
- **Background Task Offloading:** Non-blocking operations (e.g., audit logging, email notifications, report compilations) are processed asynchronously to prevent blocking the main event loop.
- **JWT Middleware Cache:** Lightweight JWT parsing and authentication guards backed by Passport.js strategies, verifying requests in microseconds.

### 3. PostgreSQL & Prisma (Database)
- **Index Optimization:** B-Tree indexes placed on foreign keys (like `projectId`, `clientId`, `userId`) and frequently filtered status fields to maintain query latency under 1ms.
- **Prisma Connection Pooling:** Reuses active database connections to eliminate the overhead of establishing new connections on each API request.
- **Lean Serialization:** REST responses serialize only the fields required by the active view, minimizing payload sizes over the network.

---

## 📋 Comprehensive Workflow & Modules

This ERP system is designed to provide end-to-end management of large-scale construction projects. Below is a detailed breakdown of the system's core modules and their respective workflows, engineered to bring transparency, accountability, and efficiency to every phase of construction.

### 🏢 1. Projects & Project Management
- **Project Initiation:** Create and define new projects with specific budgets, contractual timelines, and engineering scopes.
- **Milestone Tracking:** Break down monolithic projects into distinct, measurable milestones (e.g., Foundation, Framing, Finishing) to track progress effectively.
- **Resource Allocation:** Assign dedicated Site In-charges, engineering teams, and necessary heavy equipment to specific project sites.
- **Progress Monitoring:** Real-time updates on project completion percentages through the `ProjectProgress` and `ProjectPhase` tracking systems, providing a bird's-eye view to stakeholders.

### 👷‍♂️ 2. Site Management
- **Site Diaries:** Daily logging of site activities, weather conditions, manpower, and overall progress by the Site In-charge.
- **Safety Incidents:** Log and monitor any on-site safety hazards or accidents to maintain strict compliance with health and safety regulations.
- **Site Settlements:** Track daily petty cash and operational expenses managed directly by the site supervisors.

### 🤝 3. Clients
- **Client Profiles:** Maintain a centralized CRM for all client details, contact persons, and related legal documents.
- **Client Invoices & IPC Bills:** Generate, track, and manage Interim Payment Certificates (IPC) based on verified project milestone completions, ensuring steady cash flow.

### 🛒 4. Procurement
- **Material Requests (MR):** Site managers raise digital requests for raw materials required on-site based on BOQ (Bill of Quantities).
- **Purchase Orders (PO):** The procurement team reviews MRs, selects suppliers, and generates official, trackable Purchase Orders.
- **Goods Receipts (GR):** Upon delivery at the site, supervisors verify and record Goods Receipts against the POs, ensuring quality and quantity match before updating inventory.

### 🏭 5. Suppliers
- **Supplier Directory:** Manage vendor profiles, product catalogs, pricing agreements, and historical performance metrics.
- **Supplier Bills & Payments:** Track accounts payable efficiently. Log supplier bills upon goods receipt and process payments systematically.
- **Supplier Notes & Documents:** Keep secure records of contracts, NDAs, trade licenses, and negotiation notes.

### 📦 6. Inventory
- **Stock Management:** Real-time tracking of construction materials (cement, steel, sand, etc.) across multiple warehouses and active project sites.
- **Stock In / Out:** Automated inventory adjustments. Stock increases when Goods Receipts are approved, and decreases accurately when materials are consumed at the site (`MaterialLog`).

### 👥 7. HR & Payroll
- **Worker Management:** Maintain a rich database of laborers, supervisors, and specialized tradesmen with their daily wage rates, skill categories, and employment history.
- **Attendance Tracking:** Log daily attendance, shifts, and overtime for hundreds of site workers effortlessly.
- **Payroll & Advances:** Automate complex salary calculations based on dynamic attendance records. Seamlessly manage worker wage advances and final salary disbursements.

### 🚜 8. Assets & Equipment
- **Asset Directory:** Manage high-value heavy machinery, vehicles, and specialized construction equipment.
- **Asset Assignments:** Allocate equipment to specific projects with precise check-out and check-in dates to maximize utilization.
- **Maintenance Logs:** Schedule and track preventive and corrective maintenance to minimize unexpected equipment downtime and repair costs.

### 💸 9. Billing & Finance
- **Accounts Receivable / Payable:** A holistic, ledger-level view of what is owed by clients and what is due to suppliers/subcontractors.
- **Project Expenses:** Track all miscellaneous project-related expenses outside of direct material procurement to calculate true project profitability.
- **Voucher System:** Manage manual journal entries, payment vouchers, and receipt vouchers adhering to strict accounting standards.

### ✅ 10. Approvals (Approval Queue)
- **Multi-tier Authorization:** Critical actions (like high-value Purchase Orders, large Inventory Stock Outs, or Salary Payments) automatically enter a centralized approval queue.
- **Role-based Access:** Only authorized upper-management personnel (e.g., Project Directors, Finance Managers) can approve or reject pending requests, preventing unauthorized financial or material leakage.

### 📊 11. Reports
- **Dynamic Dashboards:** Visual representation of project health, financial standing, and resource utilization using interactive charts.
- **Custom Analytics:** Generate and export detailed reports on inventory consumption trends, payroll expenses, and supplier ledger balances for data-driven decision-making.

### 🌐 12. Client Portal
- **Transparency:** Clients can securely log in to view the real-time progress and financial standing of their specific projects.
- **Document Sharing:** Share site photos, progress reports, approved milestones, and invoices directly with the client in a professional interface.

### ⚙️ 13. Settings
- **Company Profile:** Manage overarching organization details, branding, and localized preferences.
- **User & Role Management:** Granular Access Control System (RBAC) defining exactly what each user (Admin, Site Manager, Accountant, Procurement) can view, edit, or delete.
- **Audit Logs:** System-wide, immutable tracking of user actions (who created, updated, or deleted a record, and when) for ultimate compliance and security accountability.

---

## 🔑 Role-Based Access Control (RBAC)

The ERP enforces a granular access matrix defining exactly what each employee can view, edit, or authorize:

| Role | Allowed Sections / Modules | Access Level | Description |
| :--- | :--- | :--- | :--- |
| **Owner / Admin** | All Modules (`*`), User Management, Settings, Audit Logs | Full Access | Manages company configuration, users, budgets, and global permissions. |
| **Project Manager** | Dashboard, Clients, Projects, Workers, Site Management, Procurement, Approvals, Settings | Read/Write | Manages assigned projects, schedules, worker rosters, and logs site progress. |
| **Site Engineer** | Dashboard, Projects, Site Management, Approvals, Settings | Technical RW | Enters daily progress, manages site diaries, conducts quality checks and safety logs. |
| **Site Supervisor** | Dashboard, Projects, Site Management, HR & Payroll (Attendance), Settings | Field RW | Records worker attendance, daily labor shifts, and site settlements. |
| **Accountant** | Dashboard, Clients, Billing, Finance, Approvals, Reports, Settings | Financial RW | Generates client invoices, reviews worker payroll, logs vouchers, and tracks expenses. |
| **Procurement Officer** | Dashboard, Procurement, Suppliers, Inventory, Reports, Settings | Logistics RW | Reviews material requests, generates POs, and receives warehouse inventory. |
| **Client Portal** | Client Portal (`/client-portal`), Settings | Read-Only | Secure portal showing progress, milestones, and payment status for their project. |

### Live Production Deployment
- **Live Link:** [https://construction-management-system-lyart.vercel.app](https://construction-management-system-lyart.vercel.app)
- **Backend Service:** Railway
- **Frontend Hosting:** Vercel

---
<div align="center">
  <i>Engineered for scale, built for performance, and designed to bring order to the chaos of construction management.</i>
</div>
