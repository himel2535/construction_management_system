/** Product Guide — curated site map, journeys, and role guides (from codebase scan) */

import { ROLE_LABELS } from "./util_roles.js";

export const ERP_GUIDE_SECTIONS = [
  { id: "overview", label: "সারসংক্ষেপ" },
  { id: "sitemap", label: "Site Map" },
  { id: "roles", label: "Role Guide" },
  { id: "journeys", label: "কাজের ধাপ" },
  { id: "features", label: "Features" },
];

export const ERP_ROLE_OPTIONS = [
  { id: "all", label: "সব role" },
  ...Object.entries(ROLE_LABELS)
    .filter(([id]) => id !== "manager" && id !== "viewer")
    .map(([id, label]) => ({ id, label })),
];

export const ERP_HERO = {
  badge: "Product Guide",
  title: "Construction ERP",
  highlight: "কোথায় যাবেন, কী করবেন",
  subtitle:
    "প্রতিটি menu → tab → button — actual codebase থেকে তৈরি interactive map। Role বেছে নিলে শুধু আপনার relevant path দেখাবে।",
  stats: [
    { value: "15+", label: "Main modules" },
    { value: "80+", label: "Tabs & actions" },
    { value: "8", label: "Scenario journeys" },
    { value: "7", label: "Role guides" },
  ],
};

const R = {
  owner: ["owner"],
  pm: ["owner", "project_manager"],
  se: ["owner", "project_manager", "site_engineer"],
  ss: ["owner", "project_manager", "site_supervisor"],
  acc: ["owner", "accountant"],
  po: ["owner", "procurement_officer"],
  client: ["owner", "client"],
  field: ["owner", "project_manager", "site_engineer", "site_supervisor"],
  finance: ["owner", "accountant"],
  proc: ["owner", "procurement_officer"],
  all: ["owner", "project_manager", "site_engineer", "site_supervisor", "accountant", "procurement_officer", "client"],
};

function act(label, route, hint = "", roles = R.all) {
  return { label, route, hint, roles };
}

export const ERP_SITE_TREE = [
  {
    id: "dashboard",
    label: "Dashboard",
    route: "/dashboard",
    hint: "KPI, alerts, quick links",
    roles: R.all.filter((r) => r !== "client"),
    children: [
      {
        label: "Overview",
        actions: [act("Open module cards", "/dashboard", "sidebar থেকে যেকোনো module")],
      },
    ],
  },
  {
    id: "projects",
    label: "Projects",
    route: "/projects",
    hint: "Project directory + Project Hub",
    roles: R.field.concat(["owner"]),
    children: [
      {
        label: "Directory",
        actions: [
          act("+ New Project", "/projects/new", "নতুন প্রজেক্ট তৈরি", R.pm),
          act("Search / Filter", "/projects", "client, status, type filter"),
          act("Export CSV", "/projects", "table view থেকে"),
          act("Manage project", "/projects?select=PROJECT_ID&hub=1", "card/table থেকে hub খুলুন"),
        ],
      },
      {
        label: "Project Hub — Overview",
        route: "/projects?select=PROJECT_ID&hub=1&tab=home",
        children: [
          {
            label: "Home",
            actions: [
              act("Add BOQ line", "/projects?select=PROJECT_ID&hub=1&tab=boq"),
              act("Log progress", "/projects?select=PROJECT_ID&hub=1&tab=progress"),
              act("New document", "/projects?select=PROJECT_ID&hub=1&tab=documents"),
            ],
          },
        ],
      },
      {
        label: "Project Hub — Planning",
        route: "/projects?select=PROJECT_ID&hub=1&tab=boq",
        children: [
          {
            label: "BOQ & Budget / BOQ & CSR",
            actions: [
              act("Add BOQ line", "/projects?select=PROJECT_ID&hub=1&tab=boq"),
              act("Import CSV", "/projects?select=PROJECT_ID&hub=1&tab=boq", "gov project", R.pm),
              act("Edit / Delete", "/projects?select=PROJECT_ID&hub=1&tab=boq"),
            ],
          },
          {
            label: "Phases",
            actions: [
              act("Add phase", "/projects?select=PROJECT_ID&hub=1&tab=phases"),
              act("Submit → Approve", "/projects?select=PROJECT_ID&hub=1&tab=phases", "workflow"),
            ],
          },
          {
            label: "Milestones",
            actions: [
              act("Add milestone", "/projects?select=PROJECT_ID&hub=1&tab=milestones"),
              act("Submit → Approve", "/projects?select=PROJECT_ID&hub=1&tab=milestones"),
            ],
          },
          {
            label: "Progress",
            actions: [act("Log progress", "/projects?select=PROJECT_ID&hub=1&tab=progress", "দৈনিক % update")],
          },
        ],
      },
      {
        label: "Project Hub — Operations",
        route: "/projects?select=PROJECT_ID&hub=1&tab=documents",
        children: [
          {
            label: "Documents",
            actions: [
              act("Add document", "/projects?select=PROJECT_ID&hub=1&tab=documents"),
              act("Submit → Approve", "/projects?select=PROJECT_ID&hub=1&tab=documents", "gov workflow"),
            ],
          },
          {
            label: "Resources",
            actions: [
              act("Add subcontract", "/projects?select=PROJECT_ID&hub=1&tab=resources"),
              act("Log equipment", "/projects?select=PROJECT_ID&hub=1&tab=resources"),
            ],
          },
          {
            label: "Team",
            actions: [
              act("Add to team", "/projects?select=PROJECT_ID&hub=1&tab=team"),
              act("Add task", "/projects?select=PROJECT_ID&hub=1&tab=team"),
            ],
          },
          {
            label: "Quality & Safety",
            actions: [
              act("Add quality check", "/projects?select=PROJECT_ID&hub=1&tab=quality"),
              act("Log incident / NCR", "/projects?select=PROJECT_ID&hub=1&tab=safety"),
            ],
          },
        ],
      },
      {
        label: "Project Hub — Commercial (Private)",
        route: "/projects?select=PROJECT_ID&hub=1&tab=contract",
        roles: R.pm,
        children: [
          {
            label: "Client Contract",
            actions: [
              act("Add payment milestone", "/projects?select=PROJECT_ID&hub=1&tab=contract"),
              act("Create bill", "/projects?select=PROJECT_ID&hub=1&tab=contract", "milestone থেকে"),
            ],
          },
          {
            label: "Billing",
            actions: [
              act("Create draft bill", "/projects?select=PROJECT_ID&hub=1&tab=billing"),
              act("Submit → Approve → Record payment", "/projects?select=PROJECT_ID&hub=1&tab=billing"),
            ],
          },
          {
            label: "Contracts & Claims",
            actions: [act("Add change order", "/projects?select=PROJECT_ID&hub=1&tab=contracts")],
          },
        ],
      },
      {
        label: "Project Hub — Commercial (Gov)",
        route: "/projects?select=PROJECT_ID&hub=1&tab=measurement",
        roles: R.pm,
        children: [
          {
            label: "Measurement & IPC",
            actions: [
              act("Add measurement", "/projects?select=PROJECT_ID&hub=1&tab=measurement"),
              act("Generate running bill (IPC)", "/projects?select=PROJECT_ID&hub=1&tab=measurement"),
              act("Generate final bill", "/projects?select=PROJECT_ID&hub=1&tab=measurement"),
            ],
          },
          {
            label: "Retention & Final",
            actions: [
              act("Record retention release", "/projects?select=PROJECT_ID&hub=1&tab=retention"),
              act("Update DLP / final bill", "/projects?select=PROJECT_ID&hub=1&tab=retention"),
            ],
          },
          {
            label: "Contract & Compliance",
            actions: [
              act("Edit contract profile", "/projects/new?edit=PROJECT_ID"),
              act("Compliance checklist", "/projects?select=PROJECT_ID&hub=1&tab=compliance"),
            ],
          },
          {
            label: "VO, Claims & EOT",
            actions: [
              act("Add variation order", "/projects?select=PROJECT_ID&hub=1&tab=contracts"),
              act("Submit EOT request", "/projects?select=PROJECT_ID&hub=1&tab=contracts"),
            ],
          },
        ],
      },
    ],
  },
  {
    id: "site-incharge",
    label: "Site Management",
    route: "/site-incharge",
    hint: "Site in-charge hub — diary, material, payroll",
    roles: R.field,
    children: [
      {
        label: "Overview",
        actions: [
          act("+ New site in-charge", "/site-incharge"),
          act("Open project", "/projects?select=PROJECT_ID&hub=1"),
        ],
      },
      {
        label: "Daily diary",
        route: "/site-incharge?tab=diary",
        actions: [
          act("+ Save diary", "/site-incharge?tab=diary", "আবহাওয়া, worker, কাজের বিবরণ"),
          act("Submit", "/site-incharge?tab=diary", "PM approval-এ পাঠান", R.se),
          act("Approve", "/site-incharge?tab=diary", "PM/Owner", R.pm),
        ],
      },
      {
        label: "Material log",
        route: "/site-incharge?tab=material",
        actions: [
          act("+ Log usage", "/site-incharge?tab=material"),
          act("Approve", "/site-incharge?tab=material", "submitted log", R.pm),
        ],
      },
      {
        label: "Equipment",
        route: "/site-incharge?tab=equipment",
        actions: [act("+ Log equipment", "/site-incharge?tab=equipment")],
      },
      {
        label: "Material requests",
        route: "/site-incharge?tab=requests",
        actions: [act("+ Submit requisition", "/site-incharge?tab=requests", "central store-এ")],
      },
      {
        label: "Workers (Roster)",
        route: "/site-incharge?tab=roster",
        actions: [
          act("+ Add worker", "/site-incharge?tab=roster"),
          act("End assignment", "/site-incharge?tab=roster"),
        ],
      },
      {
        label: "Payroll",
        route: "/site-incharge?tab=payroll",
        actions: [
          act("Calculate all roster workers", "/site-incharge?tab=payroll"),
          act("Confirm disbursement", "/site-incharge?tab=payroll"),
        ],
      },
      {
        label: "Settlement",
        route: "/site-incharge?tab=settlement",
        actions: [
          act("Save draft", "/site-incharge?tab=settlement"),
          act("Approve → Mark paid", "/site-incharge?tab=settlement"),
        ],
      },
    ],
  },
  {
    id: "clients",
    label: "Clients / Contacts",
    route: "/clients",
    roles: R.pm.concat(R.finance),
    children: [
      {
        label: "Directory",
        actions: [
          act("+ Add New Client", "/clients/new", "নতুন client/contact"),
          act("Search / Filter", "/clients"),
        ],
      },
    ],
  },
  {
    id: "purchases",
    label: "Procurement",
    route: "/purchases",
    roles: R.proc,
    children: [
      {
        label: "Material requests",
        route: "/purchases?tab=requests",
        actions: [
          act("+ Create request", "/purchases?tab=requests"),
          act("Submit → Approve", "/purchases?tab=requests"),
        ],
      },
      {
        label: "Purchase orders",
        route: "/purchases?tab=orders",
        actions: [
          act("+ Build PO", "/purchases?tab=orders"),
          act("Approve", "/purchases?tab=orders", "draft PO", R.owner),
        ],
      },
      {
        label: "Goods receipt (GRN)",
        route: "/purchases?tab=grn",
        actions: [act("Receive GRN", "/purchases?tab=grn", "stock + AP update")],
      },
    ],
  },
  {
    id: "suppliers",
    label: "Suppliers",
    route: "/suppliers",
    roles: R.proc,
    children: [
      {
        label: "List",
        actions: [
          act("+ New Supplier", "/suppliers"),
          act("Export CSV", "/suppliers"),
        ],
      },
      {
        label: "Detail tabs",
        children: [
          {
            label: "Profile",
            actions: [act("Edit profile", "/suppliers")],
          },
          {
            label: "Products & Services",
            actions: [act("+ Add product", "/suppliers")],
          },
          {
            label: "Payments",
            actions: [
              act("Create bill", "/suppliers"),
              act("+ Payment", "/suppliers", "approved bill"),
            ],
          },
          {
            label: "Documents & Notes",
            actions: [
              act("+ Add document", "/suppliers"),
              act("+ Add note", "/suppliers"),
            ],
          },
        ],
      },
    ],
  },
  {
    id: "inventory",
    label: "Inventory",
    route: "/inventory",
    roles: R.proc,
    children: [
      {
        label: "Materials",
        route: "/inventory?tab=materials",
        actions: [act("+ Add material", "/inventory?tab=materials")],
      },
      {
        label: "Stock In / Out",
        actions: [
          act("+ Record stock in", "/inventory?tab=stock_in"),
          act("+ Issue stock", "/inventory?tab=stock_out"),
        ],
      },
      {
        label: "Issue Vouchers",
        route: "/inventory?tab=issue_vouchers",
        actions: [
          act("Approve MR", "/inventory?tab=issue_vouchers"),
          act("Issue voucher", "/inventory?tab=issue_vouchers"),
        ],
      },
      {
        label: "Low Stock",
        route: "/inventory?tab=low_stock",
        actions: [act("Stock in (restock)", "/inventory?tab=low_stock")],
      },
    ],
  },
  {
    id: "workers",
    label: "HR & Payroll",
    route: "/workers",
    roles: R.field.concat(R.owner),
    children: [
      {
        label: "Worker List",
        route: "/workers?tab=list",
        actions: [act("+ Add Worker", "/workers?tab=list")],
      },
      {
        label: "Attendance",
        route: "/workers?tab=attendance",
        actions: [act("Toggle P/A/H", "/workers?tab=attendance", "grid cell click")],
      },
      {
        label: "Salary",
        route: "/workers?tab=salary",
        actions: [
          act("Give Advance", "/workers?tab=salary"),
          act("Pay", "/workers?tab=salary", "Confirm Payment"),
        ],
      },
      {
        label: "Reports",
        route: "/workers?tab=reports",
        actions: [act("Reconcile payroll", "/workers?tab=reports")],
      },
    ],
  },
  {
    id: "assets",
    label: "Assets & Equipment",
    route: "/assets",
    roles: R.owner,
    children: [
      {
        label: "Asset register",
        actions: [act("View / manage assets", "/assets")],
      },
    ],
  },
  {
    id: "billing",
    label: "Billing",
    route: "/billing",
    roles: R.finance,
    children: [
      {
        label: "Status tabs",
        actions: [
          act("+ Create bill", "/billing", "draft dialog"),
          act("Submit", "/billing", "draft row"),
          act("Approve", "/billing", "submitted row"),
          act("Record full payment", "/billing", "approved row"),
        ],
      },
    ],
  },
  {
    id: "accounting",
    label: "Finance",
    route: "/accounting",
    roles: R.finance,
    children: [
      {
        label: "Ledger & accounts",
        actions: [act("View finance dashboard", "/accounting")],
      },
    ],
  },
  {
    id: "approvals",
    label: "Approvals",
    route: "/approvals",
    roles: R.pm.concat(R.se, R.finance),
    children: [
      {
        label: "Pending queue",
        actions: [
          act("Approve / Reject", "/approvals", "diary, MR, bills, phases..."),
        ],
      },
    ],
  },
  {
    id: "reports",
    label: "Reports",
    route: "/reports",
    roles: R.all.filter((r) => r !== "client"),
    children: [
      {
        label: "Report tabs",
        children: [
          { label: "Client billing", route: "/reports?tab=billing" },
          { label: "Purchases", route: "/reports?tab=purchases" },
          { label: "Financial", route: "/reports?tab=financial" },
          { label: "Project cost", route: "/reports/project-cost", actions: [act("View detail", "/reports/project-cost")] },
          { label: "Procurement", route: "/reports?tab=procurement" },
          { label: "Analytics", route: "/reports/analytics", actions: [act("View detail", "/reports/analytics")] },
          { label: "Worker payroll", route: "/reports/worker-payroll", actions: [act("View detail", "/reports/worker-payroll")] },
        ],
      },
    ],
  },
  {
    id: "client-portal",
    label: "Client Portal",
    route: "/client-portal",
    roles: R.client,
    children: [
      {
        label: "Read-only view",
        actions: [
          act("Your projects", "/client-portal", "progress cards"),
          act("Billing table", "/client-portal", "invoice status"),
          act("Milestones", "/client-portal", "upcoming payments"),
        ],
      },
    ],
  },
  {
    id: "settings",
    label: "Settings",
    route: "/settings",
    roles: R.all,
    children: [
      {
        label: "Company",
        route: "/settings?tab=profile",
        actions: [act("Edit company profile", "/settings?tab=profile", "Owner only", R.owner)],
      },
      {
        label: "Users & roles",
        route: "/settings?tab=users",
        actions: [act("Add employee", "/settings?tab=users", "Owner only", R.owner)],
      },
      { label: "RBAC", route: "/settings?tab=rbac" },
      { label: "Audit log", route: "/settings?tab=audit" },
      {
        label: "Backup",
        route: "/settings?tab=backup",
        actions: [act("Request backup", "/settings?tab=backup")],
      },
      {
        label: "Product Guide",
        route: "/settings?tab=guide",
        actions: [act("Open guide", "/settings?tab=guide", "আপনি এখানে আছেন")],
      },
    ],
  },
  {
    id: "arbitration",
    label: "Arbitration",
    route: "/arbitration",
    roles: R.owner,
    children: [
      {
        label: "Disputes",
        actions: [act("View arbitration cases", "/arbitration")],
      },
    ],
  },
];

export const ERP_JOURNEYS = [
  {
    id: "new_project",
    title: "নতুন প্রজেক্ট শুরু",
    roles: R.pm,
    steps: [
      { text: "Clients page-এ client যোগ করুন", route: "/clients/new", action: "+ Add New Client" },
      { text: "Projects → + New Project", route: "/projects/new", action: "+ New Project" },
      { text: "Project Hub → BOQ tab-এ line যোগ করুন", route: "/projects?hub=1&tab=boq", action: "Add BOQ line" },
      { text: "Milestones tab-এ milestone যোগ → Submit → Approve", route: "/projects?hub=1&tab=milestones", action: "Add milestone" },
      { text: "Team tab-এ site engineer assign করুন", route: "/projects?hub=1&tab=team", action: "Add to team" },
    ],
  },
  {
    id: "procurement",
    title: "মাল কেনা ও inventory",
    roles: R.proc,
    steps: [
      { text: "Inventory → Materials-এ item যোগ করুন", route: "/inventory?tab=materials", action: "+ Add material" },
      { text: "Procurement → Material request তৈরি → Submit", route: "/purchases?tab=requests", action: "+ Create request" },
      { text: "Approve করুন → Purchase Order বানান", route: "/purchases?tab=orders", action: "+ Build PO" },
      { text: "GRN receive করুন — stock update হবে", route: "/purchases?tab=grn", action: "Receive GRN" },
      { text: "Low stock alert দেখুন", route: "/inventory?tab=low_stock", action: "Stock in" },
    ],
  },
  {
    id: "site_diary",
    title: "Site diary ও approval",
    roles: R.field,
    steps: [
      { text: "Site Management → site in-charge select করুন", route: "/site-incharge", action: "Select site" },
      { text: "Daily diary tab → আবহাওয়া, worker, কাজ লিখুন", route: "/site-incharge?tab=diary", action: "+ Save diary" },
      { text: "Submit চাপুন — PM approval queue-তে যাবে", route: "/site-incharge?tab=diary", action: "Submit" },
      { text: "PM → Approvals page-এ approve করুন", route: "/approvals", action: "Approve" },
    ],
  },
  {
    id: "client_bill",
    title: "Client bill পাঠানো (Private)",
    roles: R.pm.concat(R.finance),
    steps: [
      { text: "Project Hub → Client Contract → payment milestone যোগ", route: "/projects?hub=1&tab=contract", action: "Add payment milestone" },
      { text: "Billing tab → Create draft bill", route: "/projects?hub=1&tab=billing", action: "Create draft bill" },
      { text: "Submit → Approve workflow", route: "/projects?hub=1&tab=billing", action: "Submit" },
      { text: "Billing module-এ status track করুন", route: "/billing", action: "View bills" },
      { text: "Payment record করুন", route: "/billing", action: "Record full payment" },
    ],
  },
  {
    id: "gov_ipc",
    title: "Gov project — Measurement & IPC",
    roles: R.pm,
    steps: [
      { text: "Project Hub → Measurement tab → measurement entry", route: "/projects?hub=1&tab=measurement", action: "Add measurement" },
      { text: "Submit → Approve MB entry", route: "/projects?hub=1&tab=measurement", action: "Submit" },
      { text: "Generate running bill (IPC)", route: "/projects?hub=1&tab=measurement", action: "Generate running bill" },
      { text: "Retention & Final tab-এ release track", route: "/projects?hub=1&tab=retention", action: "Record retention release" },
    ],
  },
  {
    id: "worker_payroll",
    title: "Worker payroll",
    roles: R.field.concat(R.finance),
    steps: [
      { text: "HR & Payroll → Worker List-এ worker যোগ", route: "/workers?tab=list", action: "+ Add Worker" },
      { text: "Attendance mark করুন", route: "/workers?tab=attendance", action: "Toggle P/A/H" },
      { text: "Site Management → Payroll tab → calculate", route: "/site-incharge?tab=payroll", action: "Calculate all" },
      { text: "Confirm disbursement / Pay worker", route: "/site-incharge?tab=payroll", action: "Pay worker" },
      { text: "Reports → Worker payroll reconcile", route: "/reports/worker-payroll", action: "View detail" },
    ],
  },
  {
    id: "material_site",
    title: "Site থেকে material request",
    roles: R.field.concat(R.proc),
    steps: [
      { text: "Site → Material requests → requisition submit", route: "/site-incharge?tab=requests", action: "+ Submit requisition" },
      { text: "Inventory → Issue Vouchers → approve MR", route: "/inventory?tab=issue_vouchers", action: "Approve MR" },
      { text: "Issue voucher — site-এ material issue", route: "/inventory?tab=issue_vouchers", action: "Issue voucher" },
      { text: "Site → Material log-এ usage record", route: "/site-incharge?tab=material", action: "+ Log usage" },
    ],
  },
  {
    id: "client_view",
    title: "Client — progress দেখা",
    roles: R.client,
    steps: [
      { text: "Login → Client Portal auto-open", route: "/client-portal", action: "Open portal" },
      { text: "Your projects — progress cards", route: "/client-portal", action: "View projects" },
      { text: "Billing table — invoice status", route: "/client-portal", action: "View billing" },
      { text: "Milestones — upcoming payments", route: "/client-portal", action: "View milestones" },
    ],
  },
];

export const ERP_ROLE_GUIDES = [
  {
    role: "owner",
    title: "মালিক / Admin",
    canAccess: ["সব module", "Users & RBAC", "Company profile", "Backup", "Assets"],
    dailyTasks: [
      { text: "Dashboard KPI review", route: "/dashboard" },
      { text: "Pending approvals", route: "/approvals" },
      { text: "Financial summary", route: "/reports?tab=financial" },
      { text: "User management", route: "/settings?tab=users" },
    ],
  },
  {
    role: "project_manager",
    title: "Project Manager",
    canAccess: ["Projects hub", "Site Management", "Clients", "Workers", "Approvals", "Reports"],
    dailyTasks: [
      { text: "Project progress review", route: "/projects?hub=1&tab=progress" },
      { text: "Approve site diary", route: "/approvals" },
      { text: "Milestone / phase approvals", route: "/projects?hub=1&tab=milestones" },
      { text: "Team assignment", route: "/projects?hub=1&tab=team" },
    ],
  },
  {
    role: "site_engineer",
    title: "Site Engineer",
    canAccess: ["Projects (view)", "Site Management", "Approvals (submit)"],
    dailyTasks: [
      { text: "Daily diary entry", route: "/site-incharge?tab=diary" },
      { text: "Material usage log", route: "/site-incharge?tab=material" },
      { text: "Progress update", route: "/projects?hub=1&tab=progress" },
      { text: "Quality / safety log", route: "/projects?hub=1&tab=quality" },
    ],
  },
  {
    role: "site_supervisor",
    title: "Site Supervisor",
    canAccess: ["Site Management", "Workers", "Projects (view)"],
    dailyTasks: [
      { text: "Worker roster manage", route: "/site-incharge?tab=roster" },
      { text: "Attendance mark", route: "/workers?tab=attendance" },
      { text: "Material log", route: "/site-incharge?tab=material" },
      { text: "Payroll calculate", route: "/site-incharge?tab=payroll" },
    ],
  },
  {
    role: "accountant",
    title: "Accountant / Finance",
    canAccess: ["Billing", "Finance", "Clients", "Reports", "Approvals (finance)"],
    dailyTasks: [
      { text: "Bill approval queue", route: "/billing" },
      { text: "Payment recording", route: "/billing" },
      { text: "Financial reports", route: "/reports?tab=financial" },
      { text: "Supplier payments", route: "/suppliers" },
    ],
  },
  {
    role: "procurement_officer",
    title: "Procurement Officer",
    canAccess: ["Procurement", "Suppliers", "Inventory", "Reports"],
    dailyTasks: [
      { text: "Approve material requests", route: "/purchases?tab=requests" },
      { text: "Build & approve PO", route: "/purchases?tab=orders" },
      { text: "GRN receive", route: "/purchases?tab=grn" },
      { text: "Low stock check", route: "/inventory?tab=low_stock" },
    ],
  },
  {
    role: "client",
    title: "Client (Portal)",
    canAccess: ["Client Portal (read-only)", "Settings (profile)"],
    dailyTasks: [
      { text: "Project progress দেখুন", route: "/client-portal" },
      { text: "Billing status check", route: "/client-portal" },
      { text: "Upcoming milestones", route: "/client-portal" },
    ],
  },
];

export const ERP_FEATURES = [
  {
    title: "Role-based access",
    desc: "Owner থেকে Client — প্রতিটি role শুধু relevant menu দেখে। RBAC matrix Settings-এ।",
    route: "/settings?tab=rbac",
  },
  {
    title: "Approval workflows",
    desc: "Diary, material, phases, milestones, bills — submit → approve chain।",
    route: "/approvals",
  },
  {
    title: "Gov vs Private projects",
    desc: "Gov: Measurement/IPC, Retention, Compliance। Private: Client Contract, Billing।",
    route: "/projects?hub=1&tab=measurement",
  },
  {
    title: "Central inventory",
    desc: "Stock in/out, issue vouchers, site requisitions — end-to-end material flow।",
    route: "/inventory",
  },
  {
    title: "Site payroll",
    desc: "Roster → attendance → calculate → disburse — site level payroll।",
    route: "/site-incharge?tab=payroll",
  },
  {
    title: "Reports hub",
    desc: "11 report tabs — billing, cost, analytics, payroll, governance।",
    route: "/reports",
  },
];
