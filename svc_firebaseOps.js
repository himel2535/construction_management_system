import {
  db,
  ref,
  get,
  set,
  push,
  update,
  runTransaction,
  DEMO_ACTOR_UID,
} from "./firebase.js";
import { create, updatePath } from "./svc_data.js";
import { getActiveTenantId, DEFAULT_TENANT_ID, TENANT_LAKEVIEW_ID } from "./svc_tenant.js";
import { getCurrentUserId } from "./svc_auth.js";
import { checklistForAgency } from "./util_govCompliance.js";
import { aggregateProjectCosts, sumBoqBudget, budgetVariance } from "./util_projectCost.js";
import { expiryAlertLevel, requiresExpiry, normalizeDocumentType } from "./util_projectDocument.js";
import { computeAnalyticsSummaries } from "./util_analytics.js";
import { buildWorkerPayrollReports } from "./util_payroll.js";
import { DEMO_ROLE_USERS } from "./svc_demoSession.js";

export { DEMO_ROLE_USERS };
function omitUndefinedDeep(value) {
  if (value === undefined) return undefined;
  if (value === null || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    return value.map((item) => omitUndefinedDeep(item)).filter((item) => item !== undefined);
  }
  const out = {};
  for (const [key, val] of Object.entries(value)) {
    if (val === undefined) continue;
    const next = omitUndefinedDeep(val);
    if (next !== undefined) out[key] = next;
  }
  return out;
}

async function resolveAccountId(codeOrId) {
  if (codeOrId && !String(codeOrId).startsWith("acc_")) return codeOrId;
  const codeMap = {
    acc_cash: "1001",
    acc_bank: "1002",
    acc_income: "4001",
    acc_project_income: "4001",
    acc_expense: "5002",
    acc_purchase: "5001",
    acc_payable: "2101",
  };
  const code = codeMap[codeOrId] || codeOrId;
  const accountsSnap = await get(ref(db, "accounts"));
  const accounts = accountsSnap.val() || {};
  for (const [id, acc] of Object.entries(accounts)) {
    if (acc.code === code) return id;
  }
  throw new Error(`Account not found for ${codeOrId}`);
}

async function nextSequence(counterKey, year, prefix) {
  const counterRef = ref(db, `counters/${counterKey}/${year}`);
  const result = await runTransaction(counterRef, (current) => (current ?? 0) + 1);
  const seq = result.snapshot.val();
  return `${prefix}-${year}-${String(seq).padStart(6, "0")}`;
}

function listNestedProjectRows(snap, projectId) {
  const root = snap.val() || {};
  const bucket = root[projectId] || {};
  return Object.entries(bucket).map(([id, row]) => ({ id, ...row }));
}

function listFlatRows(snap) {
  return Object.entries(snap.val() || {}).map(([id, row]) => ({ id, ...row }));
}

function listAllNestedRows(snap) {
  const root = snap.val() || {};
  const rows = [];
  for (const bucket of Object.values(root)) {
    if (!bucket || typeof bucket !== "object") continue;
    for (const [id, row] of Object.entries(bucket)) {
      rows.push({ id, ...row });
    }
  }
  return rows;
}

function computeBudgetRowFromFirebase(projectId, projectName, prefix, snaps) {
  const [
    boqSnap,
    poSnap,
    grnSnap,
    subSnap,
    eqSnap,
    expSnap,
    purchasesSnap,
    payrollSnap,
    salarySnap,
  ] = snaps;
  const boqItems = listNestedProjectRows(boqSnap, projectId);
  const purchaseOrders = listNestedProjectRows(poSnap, projectId);
  const goodsReceipts = listNestedProjectRows(grnSnap, projectId);
  const subcontracts = listNestedProjectRows(subSnap, projectId);
  const equipmentLogs = listNestedProjectRows(eqSnap, projectId);
  const projectExpenses = listNestedProjectRows(expSnap, projectId);
  const legacyPurchases = listFlatRows(purchasesSnap).filter((p) => p.projectId === projectId);
  const payrollEntries = listFlatRows(payrollSnap).filter((e) => e.projectId === projectId);
  const workerSalaryPayments = listFlatRows(salarySnap).filter(
    (s) => s.projectId === projectId && s.status !== "cancelled"
  );
  const { total: budgetTotal } = sumBoqBudget(boqItems);
  const costs = aggregateProjectCosts({
    purchaseOrders,
    goodsReceipts,
    payrollEntries,
    subcontracts,
    equipmentLogs,
    legacyPurchases,
    projectExpenses,
    workerSalaryPayments,
  });
  const variance = budgetVariance(budgetTotal, costs.committed, costs.actual);
  return {
    projectId,
    name: projectName,
    budgetTotal,
    committed: costs.committed,
    actual: costs.actual,
    remaining: variance.remaining,
    utilization: variance.utilization,
    overBudget: variance.overBudget,
  };
}

function tenantPrefix(tenantId = getActiveTenantId()) {
  return `tenantData/${tenantId}`;
}

async function nodeHasRows(snap) {
  if (!snap.exists()) return false;
  const val = snap.val();
  return val !== null && typeof val === "object" && Object.keys(val).length > 0;
}

export async function ensureFirebaseSeed() {
  const now = Date.now();
  const uid = DEMO_ACTOR_UID;

  const companySnap = await get(ref(db, "companyProfile/main"));
  if (!companySnap.exists()) {
    await set(ref(db, "companyProfile/main"), {
      name: "Triniti Construction",
      address: "Dhaka, Bangladesh",
      phone: "",
      email: "info@triniti.demo",
      currency: "BDT",
      receiptPrefix: "RCP",
      source: "demo",
      updatedAt: now,
    });
  }

  const accountsSnap = await get(ref(db, "accounts"));
  if (!(await nodeHasRows(accountsSnap))) {
    const accounts = [
      { code: "1001", name: "Cash", type: "asset", balance: 500000 },
      { code: "1002", name: "Bank", type: "asset", balance: 2000000 },
      { code: "4001", name: "Contract Revenue", type: "income", balance: 0 },
      { code: "5001", name: "Purchase Expense", type: "expense", balance: 0 },
      { code: "5002", name: "Project Expense", type: "expense", balance: 0 },
      { code: "2101", name: "Accounts Payable", type: "liability", balance: 0 },
    ];
    for (const acc of accounts) {
      await set(push(ref(db, "accounts")), {
        ...acc,
        parentId: "",
        source: "demo",
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const roleSnap = await get(ref(db, `roles/${uid}`));
  if (!roleSnap.exists()) {
    await set(ref(db, `roles/${uid}`), {
      role: "owner",
      displayName: "Demo User",
      email: "owner@demo.com",
      active: true,
      source: "demo",
      updatedAt: now,
    });
  }

  await ensureDemoRoles(now);

  const trinitiTenantSnap = await get(ref(db, "tenants/tenant_triniti"));
  if (!trinitiTenantSnap.exists()) {
    await set(ref(db, "tenants/tenant_triniti"), {
      id: "tenant_triniti",
      name: "Triniti Construction",
      code: "TRINITI",
      active: true,
      source: "demo",
      updatedAt: now,
    });
  }
  const lakeviewTenantSnap = await get(ref(db, "tenants/tenant_lakeview"));
  if (!lakeviewTenantSnap.exists()) {
    await set(ref(db, "tenants/tenant_lakeview"), {
      id: "tenant_lakeview",
      name: "Lake View Corporation",
      code: "LAKEVIEW",
      active: true,
      source: "demo",
      updatedAt: now,
    });
  }

  const trinitiClientsSnap = await get(
    ref(db, `tenantData/${DEFAULT_TENANT_ID}/clients`)
  );
  if (!(await nodeHasRows(trinitiClientsSnap))) {
    await seedTenantDemo(DEFAULT_TENANT_ID, now, uid);
    await refreshReportsCacheClient(DEFAULT_TENANT_ID);
  }

  const lakeviewClientsSnap = await get(
    ref(db, `tenantData/${TENANT_LAKEVIEW_ID}/clients`)
  );
  if (!(await nodeHasRows(lakeviewClientsSnap))) {
    await seedTenantDemo(TENANT_LAKEVIEW_ID, now, uid, { minimal: true });
  }

  await ensureAPAccount();
}

async function ensureDemoRoles(now) {
  for (const u of DEMO_ROLE_USERS) {
    const snap = await get(ref(db, `roles/${u.id}`));
    const existing = snap.exists() ? snap.val() || {} : {};
    if (existing.source === "live") continue;
    const payload = {
      ...existing,
      role: u.role,
      displayName: u.displayName,
      email: u.email,
      source: "demo",
      updatedAt: now,
    };
    if (u.clientId) payload.clientId = u.clientId;
    if (existing.active === false) payload.active = false;
    else payload.active = true;
    await set(ref(db, `roles/${u.id}`), payload);
  }
}

async function ensureAPAccount() {
  const accountsSnap = await get(ref(db, "accounts"));
  const accounts = accountsSnap.val() || {};
  for (const acc of Object.values(accounts)) {
    if (acc.code === "2101") return;
  }
  const now = Date.now();
  await set(push(ref(db, "accounts")), {
    code: "2101",
    name: "Accounts Payable",
    type: "liability",
    balance: 0,
    parentId: "",
    source: "live",
    createdAt: now,
    updatedAt: now,
  });
}

async function seedTenantDemo(tenantId, now, uid, opts = {}) {
  const p = `tenantData/${tenantId}`;
  const today = new Date(now).toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);
  if (opts.minimal) {
    await set(ref(db, `${p}/clients/cust_lv1`), {
      name: "Lake View Client",
      phone: "01700000001",
      status: "active",
      tenantId,
      source: "demo",
      createdAt: now,
      updatedAt: now,
      createdBy: uid,
    });
    return;
  }

  const clientId = "client_1";
  await set(ref(db, `${p}/clients/${clientId}`), {
    name: "Rahim Uddin",
    phone: "01711112222",
    email: "rahim@demo.com",
    contractRef: "WO-2025-014",
    status: "active",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });

  const projPrivateId = "proj_private_1";
  await set(ref(db, `${p}/projects/${projPrivateId}`), {
    name: "Skyline Commercial Tower",
    code: "SCT-01",
    type: "private",
    projectType: "private_civil",
    clientName: "Rahim Uddin",
    clientId,
    projectManagerId: "demo-pm",
    status: "ongoing",
    location: "Gulshan, Dhaka",
    startDate: "2025-01-01",
    endDate: "2026-12-31",
    progressPercent: 50,
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/privateProjectDetails/${projPrivateId}`), {
    projectId: projPrivateId,
    contractValue: 85000000,
    budgetTotal: 85000000,
    updatedAt: now,
  });

  const projHoldId = "proj_private_hold";
  await set(ref(db, `${p}/projects/${projHoldId}`), {
    name: "Banani Residential Block",
    code: "BRB-02",
    type: "private",
    projectType: "private_civil",
    clientName: "Nasir Holdings",
    projectManagerId: "demo-pm",
    status: "on_hold",
    location: "Banani, Dhaka",
    startDate: "2025-05-01",
    endDate: "2026-08-31",
    progressPercent: 15,
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/privateProjectDetails/${projHoldId}`), {
    projectId: projHoldId,
    budgetTotal: 42000000,
    contractValue: 42000000,
    updatedAt: now,
  });

  const projClosedId = "proj_private_closed";
  await set(ref(db, `${p}/projects/${projClosedId}`), {
    name: "Mirpur Warehouse Retrofit",
    code: "MWR-99",
    type: "private",
    projectType: "private_civil",
    clientName: "LogiCorp BD",
    projectManagerId: "demo-pm",
    status: "closed",
    location: "Mirpur, Dhaka",
    startDate: "2023-01-01",
    endDate: "2024-06-30",
    progressPercent: 100,
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/privateProjectDetails/${projClosedId}`), {
    projectId: projClosedId,
    budgetTotal: 12000000,
    contractValue: 12000000,
    updatedAt: now,
  });

  const projGovId = "proj_gov_1";
  await set(ref(db, `${p}/projects/${projGovId}`), {
    name: "LGED Rural Road Package-A",
    code: "LGED-RR-A",
    type: "government",
    projectType: "government_civil",
    clientName: "LGED",
    projectManagerId: "demo-pm",
    status: "ongoing",
    startDate: "2025-03-01",
    endDate: "2027-06-30",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/governmentProjectDetails/${projGovId}`), {
    projectId: projGovId,
    employerAgency: "LGED",
    tenderRef: "e-GP-2025-014",
    tenderNoticeDate: "2025-01-15",
    tenderSubmissionDeadline: "2025-02-28",
    tenderDocUrl: "https://example.com/tender/lged-rr-a.pdf",
    workOrderNo: "WO-LGED-8821",
    workOrderIssueDate: "2025-03-01",
    workOrderScope: "Construction of 12 km rural road including sub-base, base course, and surface dressing.",
    contractValue: 125000000,
    budgetTotal: 125000000,
    performanceGuaranteeAmount: 6250000,
    retentionPercent: 10,
    retentionReleaseConditions: "Release after DLP completion and executive engineer certificate.",
    complianceStatus: "non_compliant",
    bgType: "performance",
    bgAmount: 6250000,
    bgBank: "Sonali Bank",
    bgExpiryDate: "2026-06-30",
    bgStatus: "active",
    updatedAt: now,
  });

  await set(ref(db, `${p}/clientInvoices/bill_1`), {
    clientId,
    clientName: "Rahim Uddin",
    projectId: projPrivateId,
    projectName: "Skyline Commercial Tower",
    billType: "milestone",
    amount: 17000000,
    paidAmount: 17000000,
    status: "paid",
    billDate: "2025-02-01",
    description: "Mobilization advance (20%)",
    submittedAt: now,
    approvedAt: now,
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });

  await set(ref(db, `${p}/paymentMilestones/${projPrivateId}/pm_1`), {
    description: "Mobilization advance",
    percent: 20,
    dueDate: "2025-02-01",
    amount: 17000000,
    status: "paid",
    invoiceId: "bill_1",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/paymentMilestones/${projPrivateId}/pm_2`), {
    description: "Structure complete",
    percent: 50,
    dueDate: "2025-09-30",
    amount: 42500000,
    status: "pending",
    invoiceId: "",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/paymentMilestones/${projPrivateId}/pm_3`), {
    description: "Handover & final",
    percent: 30,
    dueDate: "2026-06-30",
    amount: 25500000,
    status: "pending",
    invoiceId: "",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });

  await set(ref(db, `${p}/projectTeamAssignments/ta_private_pm}`), {
    projectId: projPrivateId,
    userId: "demo-pm",
    role: "project_manager",
    raci: "A",
    allocationPercent: 50,
    startDate: "2025-01-01",
    status: "active",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/projectTeamAssignments/ta_private_se}`), {
    projectId: projPrivateId,
    userId: "demo-site-eng",
    role: "site_engineer",
    raci: "R",
    allocationPercent: 60,
    startDate: "2025-01-01",
    status: "active",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/projectTeamAssignments/ta_gov_pm}`), {
    projectId: projGovId,
    userId: "demo-pm",
    role: "project_manager",
    raci: "A",
    allocationPercent: 50,
    startDate: "2025-03-01",
    status: "active",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/projectTeamAssignments/ta_gov_se}`), {
    projectId: projGovId,
    userId: "demo-site-eng",
    role: "site_engineer",
    raci: "R",
    allocationPercent: 50,
    startDate: "2025-03-01",
    status: "active",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/responsibilityTasks/${projPrivateId}/rt_1}`), {
    title: "Submit weekly progress report",
    assigneeUserId: "demo-site-eng",
    raci: "R",
    priority: "high",
    deadline: "2025-07-25",
    status: "open",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/responsibilityTasks/${projPrivateId}/rt_2}`), {
    title: "Review BOQ variance",
    assigneeUserId: "demo-pm",
    raci: "A",
    priority: "critical",
    deadline: "2025-07-20",
    status: "open",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/responsibilityTasks/${projPrivateId}/rt_3}`), {
    title: "Collect site measurement photos",
    assigneeUserId: "demo-site-eng",
    raci: "R",
    priority: "medium",
    deadline: "2025-07-22",
    parentTaskId: "rt_1",
    status: "open",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/notifications/demo-pm/n_1}`), {
    type: "task",
    title: "Critical task assigned",
    message: "Review BOQ variance",
    link: `/projects?select=${projPrivateId}`,
    projectId: projPrivateId,
    read: false,
    tenantId,
    source: "demo",
    createdAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/notifications/demo-site-eng/n_1}`), {
    type: "assignment",
    title: "Project assignment",
    message: "Assigned to Skyline Commercial Tower",
    link: `/projects?select=${projPrivateId}`,
    projectId: projPrivateId,
    read: false,
    tenantId,
    source: "demo",
    createdAt: now,
    createdBy: uid,
  });

  await set(ref(db, `${p}/projectMilestones/${projPrivateId}/ms_1`), {
    title: "Foundation complete",
    plannedDate: "2025-06-30",
    status: "completed",
    ownerId: "demo-pm",
    responsibleRole: "project_manager",
    workflowStatus: "draft",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });

  await set(ref(db, `${p}/projectMilestones/${projPrivateId}/ms_2`), {
    title: "Structure topping out",
    plannedDate: "2025-12-31",
    status: "in_progress",
    dependsOnId: "ms_1",
    ownerId: "demo-pm",
    responsibleRole: "site_engineer",
    workflowStatus: "draft",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });

  await set(ref(db, `${p}/projectMilestones/${projGovId}/ms_gov_1`), {
    title: "Mobilization complete",
    plannedDate: "2025-04-01",
    status: "completed",
    ownerId: "demo-pm",
    responsibleRole: "project_manager",
    workflowStatus: "approved",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });

  await set(ref(db, `${p}/projectMilestones/${projGovId}/ms_gov_2`), {
    title: "Sub-base certification",
    plannedDate: "2025-03-01",
    status: "in_progress",
    dependsOnId: "ms_gov_1",
    ownerId: "demo-pm",
    responsibleRole: "site_engineer",
    delayCause: "material",
    delayNotes: "Aggregate supply delayed from quarry",
    workflowStatus: "draft",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });

  await set(ref(db, `${p}/projectMessages/${projGovId}/msg_1`), {
    projectId: projGovId,
    authorUid: uid,
    authorName: "Demo PM",
    body: "Please review the updated sub-base test results before tomorrow's inspection.",
    createdAt: now - 86400000,
    tenantId,
    source: "demo",
  });
  await set(ref(db, `${p}/projectMessages/${projGovId}/msg_2`), {
    projectId: projGovId,
    authorUid: "demo-engineer",
    authorName: "Site Engineer",
    body: "Lab reports uploaded to Documents. Ready for PM sign-off.",
    createdAt: now - 43200000,
    tenantId,
    source: "demo",
  });

  const sicId = "sic_demo_1";
  await set(ref(db, `${p}/siteInCharges/${sicId}`), {
    name: "Abdul Jabbar",
    phone: "01799887766",
    userId: "demo-site-sup",
    status: "active",
    monthlyRate: 45000,
    defaultProjectId: projPrivateId,
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/siteInChargeAssignments/asn_private_1}`), {
    siteInChargeId: sicId,
    projectId: projPrivateId,
    projectName: "Skyline Commercial Tower",
    role: "site_in_charge",
    startDate: "2025-01-15",
    status: "active",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });
  await set(ref(db, `${p}/siteInChargeAssignments/asn_gov_1}`), {
    siteInChargeId: sicId,
    projectId: projGovId,
    projectName: "LGED Rural Road Package-A",
    role: "site_in_charge",
    startDate: "2025-03-15",
    status: "active",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });
  await update(ref(db, `${p}/projects/${projPrivateId}`), { siteInChargeId: sicId });
  await update(ref(db, `${p}/projects/${projGovId}`), { siteInChargeId: sicId });
  await set(ref(db, `${p}/siteDiaries/${projPrivateId}/sd_1}`), {
    logDate: "2026-07-17",
    workSummary: "Column casting level 8 - 24 workers on slab prep.",
    photos: [{ url: "https://picsum.photos/seed/sct1/400/300", caption: "Level 8 slab" }],
    laborCount: 24,
    weather: "Sunny",
    siteInChargeId: sicId,
    status: "approved",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/siteDiaries/${projPrivateId}/sd_2}`), {
    logDate: "2026-07-18",
    workSummary: "Rebar fixing and shuttering for beam B-12.",
    photos: [{ url: "https://picsum.photos/seed/sct2/400/300", caption: "Beam B-12" }],
    laborCount: 18,
    weather: "Overcast",
    siteInChargeId: sicId,
    status: "submitted",
    submittedAt: now,
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/siteDiaries/${projGovId}/sd_gov_1}`), {
    logDate: "2026-07-16",
    workSummary: "Sub-base compaction km 4-5 completed.",
    photos: [],
    laborCount: 32,
    weather: "Rain",
    siteInChargeId: sicId,
    status: "approved",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/equipmentLogs/${projPrivateId}/eq_sic_1}`), {
    equipmentName: "Tower crane TC-01",
    hours: 8,
    logDate: "2026-07-18",
    cost: 0,
    siteInChargeId: sicId,
    projectId: projPrivateId,
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/materialRequests/${projPrivateId}/mr_demo_1}`), {
    title: "Cement batch - July",
    requestType: "supplier",
    qty: 500,
    amount: 425000,
    status: "approved",
    deliveryStatus: "partial",
    siteInChargeId: sicId,
    costCategory: "material",
    projectId: projPrivateId,
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });

  await set(ref(db, `${p}/goodsReceipts/${projPrivateId}/grn_demo_1}`), {
    poId: "",
    amount: 85000,
    receiveLines: [{ productName: "Portland Cement", qty: 100, rate: 850, amount: 85000 }],
    status: "received",
    costCategory: "material",
    projectId: projPrivateId,
    receiptDate: "2026-07-10",
    centralStockPosted: true,
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/inventoryStockIn/stockin_grn_1}`), {
    materialId: "mat_1",
    materialName: "Portland Cement",
    quantity: 100,
    invoiceRef: "GRN-grn_demo_1",
    grnId: "grn_demo_1",
    grnProjectId: projPrivateId,
    grnDedupeKey: "grn_demo_1_0",
    receivedBy: uid,
    source: "grn",
    date: "2026-07-10",
    tenantId,
    createdAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/materialRequests/${projPrivateId}/mr_central_1}`), {
    title: "Cement for slab level 8",
    requestType: "central",
    inventoryMaterialId: "mat_1",
    qty: 100,
    purpose: "Slab casting B-12",
    status: "approved",
    deliveryStatus: "approved",
    siteInChargeId: sicId,
    issueVoucherId: "iv_demo_1",
    projectId: projPrivateId,
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/issueVouchers/${projPrivateId}/iv_demo_1}`), {
    requisitionId: "mr_central_1",
    projectId: projPrivateId,
    inventoryMaterialId: "mat_1",
    materialName: "Portland Cement",
    unit: "bag",
    qtyIssued: 100,
    voucherNo: "IV-20260710-0001",
    issueDate: "2026-07-12",
    issuedBy: uid,
    receivedBySiteInChargeId: sicId,
    receivedByName: "Abdul Jabbar",
    status: "issued",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });
  await set(ref(db, `${p}/siteMaterialLogs/${projPrivateId}/sml_usage_1}`), {
    siteInChargeId: sicId,
    logDate: "2026-07-17",
    items: [{
      materialKey: "cement",
      inventoryMaterialId: "mat_1",
      label: "Cement",
      unit: "bag",
      usedQty: 85,
      wastedQty: 5,
      wasteReason: "Bag burst during rain",
      usedFor: "Slab B-12",
      qty: 90,
    }],
    status: "approved",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });

  await set(ref(db, `${p}/measurementEntries/${projGovId}/me_1`), {
    projectId: projGovId,
    date: "2025-04-15",
    qty: 120,
    remarks: "Sub-base layer MB entry",
    status: "submitted",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });

  let gcIdx = 0;
  for (const item of checklistForAgency("LGED")) {
    gcIdx += 1;
    await set(ref(db, `${p}/govComplianceChecklist/${projGovId}/gc_${gcIdx}`), {
      itemKey: item.itemKey,
      label: item.label,
      agency: item.agency,
      status: gcIdx === 1 ? "done" : "pending",
      createdAt: now,
      updatedAt: now,
    });
  }

  await set(ref(db, `${p}/workers/wrk_1`), {
    workerCode: "WRK-001",
    name: "Karim Mia",
    phone: "01712345678",
    designation: "mason",
    employmentType: "daily",
    wageRate: 800,
    dailyWage: 800,
    assignedProjectId: projPrivateId,
    joiningDate: "2025-01-15",
    status: "active",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });
  await set(ref(db, `${p}/workers/wrk_2`), {
    workerCode: "WRK-002",
    name: "Salam Hossain",
    phone: "01812345678",
    designation: "electrician",
    employmentType: "daily",
    wageRate: 900,
    dailyWage: 900,
    assignedProjectId: projGovId,
    joiningDate: "2025-02-01",
    status: "active",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });

  await set(ref(db, `${p}/workerAttendance/wrk_1_${today.slice(0, 10)}`), {
    workerId: "wrk_1",
    projectId: projPrivateId,
    date: today.slice(0, 10),
    status: "present",
    overtimeHours: 2,
    markedBy: "demo-site-sup",
    updatedBy: "demo-site-sup",
    tenantId,
    source: "demo",
  });
  await set(ref(db, `${p}/workerAdvances/adv_demo_1`), {
    workerId: "wrk_2",
    projectId: projGovId,
    amount: 1500,
    date: "2026-07-01",
    reason: "Medical advance",
    note: "Medical advance",
    givenBy: "demo-site-sup",
    createdBy: "demo-site-sup",
    tenantId,
    source: "demo",
    createdAt: now,
  });
  await set(ref(db, `${p}/workerSalaryCalculations/calc_demo_1`), {
    workerId: "wrk_1",
    workerName: "Karim Mia",
    projectId: projPrivateId,
    siteInChargeId: sicId,
    payCycle: "monthly",
    periodStart: `${monthPrefix}-01`,
    periodEnd: `${monthPrefix}-28`,
    monthKey: monthPrefix,
    totalDays: 12,
    overtimeHours: 4,
    grossAmount: 9600,
    advanceDeducted: 0,
    netPayable: 9600,
    status: "confirmed",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: "demo-site-sup",
  });
  await set(ref(db, `${p}/workerSalaryPayments/pay_demo_1`), {
    workerId: "wrk_2",
    projectId: projGovId,
    siteInChargeId: sicId,
    amount: 5400,
    monthKey: monthPrefix,
    date: "2026-07-10",
    paymentMode: "bkash",
    paidBy: "demo-site-sup",
    note: "Salary payment (bkash)",
    status: "paid",
    tenantId,
    source: "demo",
    createdBy: "demo-site-sup",
    createdAt: now,
  });

  await set(ref(db, `${p}/inventoryMaterials/mat_1`), {
    name: "Portland Cement",
    category: "cement",
    unit: "bag",
    currentStock: 120,
    reorderLevel: 50,
    status: "active",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });
  await set(ref(db, `${p}/inventoryMaterials/mat_2`), {
    name: "MS Rod 10mm",
    category: "rod",
    unit: "ton",
    currentStock: 8,
    reorderLevel: 10,
    status: "active",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });
  await set(ref(db, `${p}/inventoryMaterials/mat_3`), {
    name: "Electric Drill",
    category: "tools",
    unit: "piece",
    currentStock: 5,
    reorderLevel: 2,
    status: "active",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });

  await set(ref(db, `${p}/assets/ast_1`), {
    assetCode: "AST-001",
    name: "Concrete Mixer",
    category: "heavy_machinery",
    purchaseDate: "2024-06-01",
    purchaseValue: 450000,
    assignedProjectId: projGovId,
    status: "in_use",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });
  await set(ref(db, `${p}/assets/ast_2`), {
    assetCode: "AST-002",
    name: "Pickup Truck",
    category: "vehicle",
    purchaseDate: "2023-11-15",
    purchaseValue: 1200000,
    assignedProjectId: projGovId,
    status: "under_repair",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });

  await set(ref(db, `${p}/projectExpenses/${projPrivateId}/exp_pending_1`), {
    projectId: projPrivateId,
    category: "Material",
    amount: 35000,
    phaseId: "",
    description: "Misc site consumables — pending approval",
    expenseDate: "2026-07-15",
    status: "submitted",
    approvalStage: "",
    submittedBy: uid,
    submittedAt: now,
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/approvalQueue/aq_exp_pending_1`), {
    entityType: "projectExpense",
    entityId: "exp_pending_1",
    projectId: projPrivateId,
    path: `projectExpenses/${projPrivateId}/exp_pending_1`,
    title: "Material — 35,000 BDT",
    status: "pending",
    approvalStage: "private",
    submittedBy: uid,
    submittedAt: now,
    tenantId,
    createdAt: now,
    updatedAt: now,
  });
  await set(ref(db, `${p}/projectExpenses/${projPrivateId}/exp_approved_1`), {
    projectId: projPrivateId,
    category: "Admin",
    amount: 12000,
    description: "Site office utilities",
    expenseDate: "2026-07-05",
    status: "approved",
    approvedBy: uid,
    approvedAt: now,
    voucherRef: "VCH-DEMO-EXP-1",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/projectExpenses/${projGovId}/exp_gov_acct_1`), {
    projectId: projGovId,
    category: "Equipment",
    amount: 95000,
    description: "Plate compactor rental — LGED site",
    expenseDate: "2026-07-12",
    status: "submitted",
    approvalStage: "accountant",
    submittedBy: uid,
    submittedAt: now,
    lastApprovedBy: uid,
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });
  await set(ref(db, `${p}/approvalQueue/aq_exp_gov_1`), {
    entityType: "projectExpense",
    entityId: "exp_gov_acct_1",
    projectId: projGovId,
    path: `projectExpenses/${projGovId}/exp_gov_acct_1`,
    title: "Equipment — 95,000 BDT (Accountant)",
    status: "pending",
    approvalStage: "accountant",
    submittedAt: now,
    tenantId,
    createdAt: now,
    updatedAt: now,
  });

  const warnExpiry = new Date(Date.now() + 14 * 86400000).toISOString().slice(0, 10);
  await set(ref(db, `${p}/projectDocuments/${projPrivateId}/doc_draw_1`), {
    projectId: projPrivateId,
    title: "Structural GA Drawing",
    type: "Drawing",
    docType: "drawing",
    version: 2,
    revision: "Rev 2",
    fileUrl: "https://example.com/drawings/ga-rev2.pdf",
    expiryDate: "",
    revisionHistory: [
      { version: 1, fileUrl: "https://example.com/drawings/ga-rev1.pdf", revisionLabel: "Rev 1", uploadedAt: now - 86400000 * 30, uploadedBy: uid },
    ],
    status: "approved",
    approvedBy: uid,
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });
  await set(ref(db, `${p}/projectDocuments/${projPrivateId}/doc_permit_1`), {
    projectId: projPrivateId,
    title: "Building Construction Permit",
    type: "Permit",
    docType: "permit",
    version: 1,
    revision: "Rev 1",
    fileUrl: "https://example.com/permits/bcp-2026.pdf",
    expiryDate: warnExpiry,
    revisionHistory: [],
    status: "approved",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });
  await set(ref(db, `${p}/projectDocuments/${projGovId}/doc_license_1`), {
    projectId: projGovId,
    title: "Environmental Clearance License",
    type: "License",
    docType: "license",
    version: 1,
    revision: "Rev 1",
    fileUrl: "",
    expiryDate: "2026-01-01",
    revisionHistory: [],
    status: "draft",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
  });

  await set(ref(db, `${p}/qualityChecks/${projPrivateId}/qc_phase_1`), {
    projectId: projPrivateId,
    title: "Slab casting inspection",
    checkType: "structural",
    phaseId: "phase_demo_1",
    milestoneId: "",
    checklistItems: [
      { text: "Rebar spacing verified", passed: true, notes: "" },
      { text: "Cover block adequate", passed: true, notes: "" },
      { text: "Shuttering oil applied", passed: false, notes: "Missed edge form" },
    ],
    status: "submitted",
    dueDate: "2026-07-20",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });

  await set(ref(db, `${p}/ncrReports/${projPrivateId}/ncr_1`), {
    projectId: projPrivateId,
    title: "Concrete slump test failure — B-12",
    description: "Slump 25mm vs spec 75±25mm",
    severity: "high",
    correctiveAction: "Reject batch; re-test after remix",
    phaseId: "",
    resolutionStatus: "in_progress",
    status: "draft",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });

  await set(ref(db, `${p}/safetyIncidents/${projPrivateId}/si_resolved_1`), {
    projectId: projPrivateId,
    title: "Minor cut — rebar handling",
    severity: "low",
    incidentDate: "2026-07-10",
    rootCause: "Missing gloves",
    correctiveAction: "PPE briefing repeated; first aid applied",
    closureStatus: "closed",
    status: "closed",
    tenantId,
    source: "demo",
    createdAt: now,
    updatedAt: now,
    createdBy: uid,
  });

  await refreshReportsCacheClient(tenantId);
}

export async function refreshReportsCacheClient(tenantId = getActiveTenantId()) {
  const prefix = tenantPrefix(tenantId);
  const today = new Date().toISOString().slice(0, 10);
  const monthPrefix = today.slice(0, 7);
  const [
    invoicesSnap,
    purchasesSnap,
    subcontractsSnap,
    projectsSnap,
    boqSnap,
    poSnap,
    grnSnap,
    subSnap,
    eqSnap,
    expSnap,
    payrollSnap,
    salarySnap,
    qualitySnap,
    safetySnap,
    ncrSnap,
    docsSnap,
    msSnap,
    teamSnap,
    salesSnap,
    rolesSnap,
    workersSnap,
    attSnap,
    advSnap,
    calcSnap,
    sicSnap,
  ] = await Promise.all([
    get(ref(db, `${prefix}/clientInvoices`)),
    get(ref(db, `${prefix}/purchases`)),
    get(ref(db, `${prefix}/subcontracts`)),
    get(ref(db, `${prefix}/projects`)),
    get(ref(db, `${prefix}/boqItems`)),
    get(ref(db, `${prefix}/purchaseOrders`)),
    get(ref(db, `${prefix}/goodsReceipts`)),
    get(ref(db, `${prefix}/subcontracts`)),
    get(ref(db, `${prefix}/equipmentLogs`)),
    get(ref(db, `${prefix}/projectExpenses`)),
    get(ref(db, "payrollEntries")),
    get(ref(db, `${prefix}/workerSalaryPayments`)),
    get(ref(db, `${prefix}/qualityChecks`)),
    get(ref(db, `${prefix}/safetyIncidents`)),
    get(ref(db, `${prefix}/ncrReports`)),
    get(ref(db, `${prefix}/projectDocuments`)),
    get(ref(db, `${prefix}/projectMilestones`)),
    get(ref(db, `${prefix}/projectTeamAssignments`)),
    get(ref(db, `${prefix}/sales`)),
    get(ref(db, "roles")),
    get(ref(db, `${prefix}/workers`)),
    get(ref(db, `${prefix}/workerAttendance`)),
    get(ref(db, `${prefix}/workerAdvances`)),
    get(ref(db, `${prefix}/workerSalaryCalculations`)),
    get(ref(db, `${prefix}/siteInCharges`)),
  ]);

  let openBills = 0;
  let outstanding = 0;
  const invoices = invoicesSnap.val();
  if (invoices) {
    for (const row of Object.values(invoices)) {
      if (row.status === "cancelled") continue;
      const due = Math.max(0, Number(row.amount || 0) - Number(row.paidAmount || 0));
      if (due > 0) {
        openBills++;
        outstanding += due;
      }
    }
  }

  let monthExpense = 0;
  const purchases = purchasesSnap.val();
  if (purchases) {
    for (const p of Object.values(purchases)) {
      if (p.date?.startsWith(monthPrefix) && p.status !== "cancelled") {
        monthExpense += Number(p.amount) || 0;
      }
    }
  }
  for (const ex of listAllNestedRows(expSnap)) {
    if (ex.status === "approved" && (ex.expenseDate || "").startsWith(monthPrefix)) {
      monthExpense += Number(ex.amount) || 0;
    }
  }

  let subcontractOutstanding = 0;
  const subcontracts = subcontractsSnap.val();
  if (subcontracts) {
    for (const s of Object.values(subcontracts)) {
      if (s.status === "closed") continue;
      subcontractOutstanding += Math.max(0, Number(s.contractValue || 0) - Number(s.paidAmount || 0));
    }
  }

  const costSnaps = [boqSnap, poSnap, grnSnap, subSnap, eqSnap, expSnap, purchasesSnap, payrollSnap, salarySnap];
  const projectCostSummary = [];
  const projects = projectsSnap.val() || {};
  for (const [projectId, row] of Object.entries(projects)) {
    projectCostSummary.push(
      computeBudgetRowFromFirebase(projectId, row.name || projectId, prefix, costSnaps)
    );
  }

  let govIpcOutstanding = 0;
  const ipcSnap = await get(ref(db, `${prefix}/ipcBills`));
  for (const bill of listAllNestedRows(ipcSnap)) {
    if ((bill.status || "draft") === "certified") continue;
    govIpcOutstanding += Number(bill.netPayable) || 0;
  }

  let qualityOpen = 0;
  let qualityApproved = 0;
  let safetyOpen = 0;
  let safetyCritical = 0;
  let ncrOpen = 0;
  let documentExpiryWarn = 0;
  let documentExpiryCritical = 0;
  for (const q of listAllNestedRows(qualitySnap)) {
    if (q.status === "approved" || q.status === "closed") qualityApproved++;
    else qualityOpen++;
  }
  for (const s of listAllNestedRows(safetySnap)) {
    if (s.status !== "closed") safetyOpen++;
    if (s.severity === "critical" || s.severity === "high") safetyCritical++;
  }
  for (const n of listAllNestedRows(ncrSnap)) {
    if ((n.resolutionStatus || "open") !== "closed" && n.status !== "closed") ncrOpen++;
  }
  for (const d of listAllNestedRows(docsSnap)) {
    if (!requiresExpiry(normalizeDocumentType(d.type || d.docType))) continue;
    const lvl = expiryAlertLevel(d.expiryDate);
    if (lvl === "warn") documentExpiryWarn++;
    if (lvl === "critical") documentExpiryCritical++;
  }

  const projectList = Object.entries(projects).map(([id, row]) => ({ id, ...row }));
  const flatRows = (snap) => {
    const v = snap?.val?.() ?? snap;
    if (!v) return [];
    return Object.entries(v).map(([id, row]) => ({ id, ...row }));
  };
  const analytics = computeAnalyticsSummaries({
    projects: projectList,
    milestonesRoot: msSnap.val() || {},
    assignments: flatRows(teamSnap),
    sales: salesSnap.val() || {},
    users: flatRows(rolesSnap),
    costSummary: projectCostSummary,
    governance: {
      ncrOpen,
      qualityOpen,
      safetyOpen,
      safetyCritical,
    },
  });

  const workerPayroll = buildWorkerPayrollReports({
    projects: projectList,
    workers: flatRows(workersSnap),
    attendance: flatRows(attSnap),
    advances: flatRows(advSnap),
    payments: flatRows(salarySnap),
    calculations: flatRows(calcSnap),
    siteInCharges: flatRows(sicSnap),
    monthKey: monthPrefix,
  });

  await update(
    ref(db, `reportsCache/${tenantId}`),
    omitUndefinedDeep({
      dailySummary: {
        date: today,
        openBills,
        clientReceivable: outstanding,
        subcontractOutstanding,
        govIpcOutstanding,
        updatedAt: Date.now(),
        source: "live",
      },
      monthlyExpense: { month: monthPrefix, total: monthExpense, updatedAt: Date.now(), source: "live" },
      projectCostSummary,
      governanceCompliance: {
        qualityOpen,
        qualityApproved,
        safetyOpen,
        safetyCritical,
        ncrOpen,
        documentExpiryWarn,
        documentExpiryCritical,
        updatedAt: Date.now(),
      },
      hseSummary: {
        qualityOpen,
        safetyOpen,
        safetyCritical,
        ncrOpen,
        updatedAt: Date.now(),
      },
      documentExpiry: {
        warn: documentExpiryWarn,
        critical: documentExpiryCritical,
        updatedAt: Date.now(),
      },
      analytics,
      workerPayroll: { ...workerPayroll, monthKey: monthPrefix },
    })
  );
}

export async function triggerBackupMetaClient() {
  await set(ref(db, "backupMeta/latest"), {
    triggeredAt: Date.now(),
    triggeredBy: getCurrentUserId(),
    status: "requested",
    note: "Firebase RTDB backup marker",
    source: "live",
  });
}

export async function createClientInvoice({
  client,
  project,
  billType,
  amount,
  paidAmount,
  billDate,
  description,
}) {
  const tenantId = getActiveTenantId();
  const prefix = tenantPrefix(tenantId);
  const now = Date.now();
  const actor = getCurrentUserId();
  const billAmount = Number(amount || 0);
  const paid = Number(paidAmount || 0);
  let status = "draft";
  if (paid >= billAmount && billAmount > 0) status = "paid";
  else if (paid > 0) status = "partial";

  const invoiceRef = push(ref(db, `${prefix}/clientInvoices`));
  const invoiceId = invoiceRef.key;
  await set(invoiceRef, {
    clientId: client.id,
    clientName: client.name,
    projectId: project.id,
    projectName: project.name,
    billType: billType || "milestone",
    amount: billAmount,
    paidAmount: paid,
    status,
    billDate: billDate || new Date().toISOString().slice(0, 10),
    description: description || "",
    tenantId,
    source: "live",
    createdAt: now,
    updatedAt: now,
    createdBy: actor,
  });

  await refreshReportsCacheClient(tenantId);
  return invoiceId;
}

export async function updateClientInvoiceStatus(invoiceId, toStatus, extra = {}) {
  const tenantId = getActiveTenantId();
  const prefix = tenantPrefix(tenantId);
  const now = Date.now();
  const actor = getCurrentUserId();
  const cur = (await get(ref(db, `${prefix}/clientInvoices/${invoiceId}`))).val() || {};
  const patch = { status: toStatus, updatedAt: now, ...extra };
  if (toStatus === "submitted") {
    patch.submittedAt = now;
    patch.submittedBy = actor;
  }
  if (toStatus === "approved") {
    patch.approvedAt = now;
    patch.approvedBy = actor;
    const amount = Number(cur.amount || 0);
    const paid = Number(cur.paidAmount || 0);
    if (paid >= amount && amount > 0) patch.status = "paid";
    else if (paid > 0) patch.status = "partial";
    else patch.status = "approved";
  }
  await update(ref(db, `${prefix}/clientInvoices/${invoiceId}`), patch);
  await refreshReportsCacheClient(tenantId);
  return patch.status;
}

/** @deprecated use createClientInvoice */
export async function createSaleBooking(args) {
  return createClientInvoice(args);
}

export async function postManualVoucherClient(payload, tenantId = getActiveTenantId()) {
  const debitId = await resolveAccountId(payload.debit);
  const creditId = await resolveAccountId(payload.credit);
  const year = new Date(payload.date || Date.now()).getFullYear().toString();
  const voucherNo = await nextSequence("voucher", year, "VCH");
  const now = Date.now();
  const amount = Number(payload.amount);
  const voucherRef = push(ref(db, "vouchers"));
  await set(voucherRef, {
    voucherNo,
    date: payload.date,
    type: "journal",
    narration: payload.narration || "",
    lines: [
      { accountId: debitId, debit: amount, credit: 0 },
      { accountId: creditId, debit: 0, credit: amount },
    ],
    tenantId,
    createdAt: now,
    createdBy: getCurrentUserId(),
    source: "live",
    updatedAt: now,
  });
  await runTransaction(ref(db, `accounts/${debitId}/balance`), (b) => (b ?? 0) + amount);
  await runTransaction(ref(db, `accounts/${creditId}/balance`), (b) => (b ?? 0) + amount);
  return { voucherNo, id: voucherRef.key };
}

export async function postExpenseClient({
  projectId,
  amount,
  costCategory,
  narration,
  refType,
  refId,
  date,
}) {
  const tenantId = getActiveTenantId();
  let expenseAccountId;
  let cashAccountId;
  const accountsSnap = await get(ref(db, "accounts"));
  const accounts = accountsSnap.val() || {};
  for (const [id, acc] of Object.entries(accounts)) {
    if (acc.code === "5002" || acc.code === "5001") expenseAccountId = expenseAccountId || id;
    if (acc.code === "1001") cashAccountId = cashAccountId || id;
  }
  if (!expenseAccountId || !cashAccountId) throw new Error("Default accounts missing");

  const year = new Date(date || Date.now()).getFullYear().toString();
  const voucherNo = await nextSequence("voucher", year, "VCH");
  const now = Date.now();
  const voucherRef = push(ref(db, "vouchers"));
  await set(voucherRef, {
    voucherNo,
    date: date || new Date().toISOString().slice(0, 10),
    type: "payment",
    narration: narration || `Project expense ${projectId}`,
    lines: [
      { accountId: expenseAccountId, debit: amount, credit: 0 },
      { accountId: cashAccountId, debit: 0, credit: amount },
    ],
    refType: refType || "projectExpense",
    refId: refId || projectId,
    projectId,
    costCategory,
    tenantId,
    createdAt: now,
    createdBy: getCurrentUserId(),
    source: "live",
    updatedAt: now,
  });
  await runTransaction(ref(db, `accounts/${expenseAccountId}/balance`), (b) => (b ?? 0) + amount);
  await runTransaction(ref(db, `accounts/${cashAccountId}/balance`), (b) => (b ?? 0) - amount);
  return voucherNo;
}

export async function postSupplierBillClient({
  projectId,
  amount,
  costCategory,
  narration,
  supplierId,
  supplierName,
  billId,
  date,
}) {
  await ensureAPAccount();
  const expenseAccountId = await resolveAccountId("5002");
  const apAccountId = await resolveAccountId("2101");
  const tenantId = getActiveTenantId();
  const year = new Date(date || Date.now()).getFullYear().toString();
  const voucherNo = await nextSequence("voucher", year, "VCH");
  const now = Date.now();
  const voucherRef = push(ref(db, "vouchers"));
  await set(voucherRef, {
    voucherNo,
    date: date || new Date().toISOString().slice(0, 10),
    type: "journal",
    narration: narration || `Supplier bill ${billId}`,
    lines: [
      { accountId: expenseAccountId, debit: amount, credit: 0 },
      { accountId: apAccountId, debit: 0, credit: amount },
    ],
    refType: "supplierBill",
    refId: billId,
    supplierId: supplierId || "",
    supplierName: supplierName || "",
    projectId: projectId || "",
    costCategory: costCategory || "material",
    tenantId,
    createdAt: now,
    createdBy: getCurrentUserId(),
    source: "live",
    updatedAt: now,
  });
  await runTransaction(ref(db, `accounts/${expenseAccountId}/balance`), (b) => (b ?? 0) + amount);
  await runTransaction(ref(db, `accounts/${apAccountId}/balance`), (b) => (b ?? 0) + amount);
  return voucherNo;
}

export async function postSupplierPaymentClient({
  amount,
  narration,
  supplierId,
  supplierName,
  paymentId,
  method,
  date,
}) {
  await ensureAPAccount();
  const apAccountId = await resolveAccountId("2101");
  const creditCode = method === "bank" ? "1002" : "1001";
  const creditAccountId = await resolveAccountId(creditCode);
  const tenantId = getActiveTenantId();
  const year = new Date(date || Date.now()).getFullYear().toString();
  const voucherNo = await nextSequence("voucher", year, "VCH");
  const now = Date.now();
  const voucherRef = push(ref(db, "vouchers"));
  await set(voucherRef, {
    voucherNo,
    date: date || new Date().toISOString().slice(0, 10),
    type: "payment",
    narration: narration || `Supplier payment ${paymentId}`,
    lines: [
      { accountId: apAccountId, debit: amount, credit: 0 },
      { accountId: creditAccountId, debit: 0, credit: amount },
    ],
    refType: "supplierPayment",
    refId: paymentId,
    supplierId: supplierId || "",
    supplierName: supplierName || "",
    tenantId,
    createdAt: now,
    createdBy: getCurrentUserId(),
    source: "live",
    updatedAt: now,
  });
  await runTransaction(ref(db, `accounts/${apAccountId}/balance`), (b) => (b ?? 0) - amount);
  await runTransaction(ref(db, `accounts/${creditAccountId}/balance`), (b) => (b ?? 0) - amount);
  return voucherNo;
}
