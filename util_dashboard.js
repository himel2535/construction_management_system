import { readRef } from "./svc_tenant.js";
import { valToList } from "./svc_clientCache.js";
import { resolveBudgetTotal } from "./util_projectCore.js";
import { computeProjectBudgetSummary } from "./svc_projectCost.js";
import { milestoneVariance } from "./svc_workflow.js";
import { listLowStock, unitLabel } from "./util_inventory.js";
import { formatBDT } from "./util_format.js";
import { isGovProject } from "./util_govProject.js";
import { isMaintenanceOverdue, latestMaintenanceByAsset } from "./util_assets.js";

const ACTIVE_STATUSES = new Set(["planning", "ongoing", "on_hold"]);
const PURCHASE_APPROVAL_TYPES = new Set([
  "purchaseorder",
  "purchase_requisition",
  "purchase_order",
  "material_request",
]);
const DELIVERED_PO_STATUSES = new Set(["received", "closed", "cancelled", "delivered"]);

export function formatCompactBDT(amount) {
  const v = Number(amount) || 0;
  if (v >= 1e7) return `BDT ${(v / 1e7).toFixed(2)} Cr`;
  if (v >= 1e5) return `BDT ${(v / 1e5).toFixed(2)} Lac`;
  return formatBDT(v);
}

export function resolveProjectCategory(project) {
  const name = String(project?.name || "").toLowerCase();
  if (/residential|villa|court|block|apartment|flat|home/.test(name)) return "Residential";
  if (/commercial|tower|complex|heights|plaza|office|mall/.test(name)) return "Commercial";
  if (isGovProject(project)) return "Government";
  return "Commercial";
}

export function formatDashboardDeadline(date) {
  if (!date || date === "—") return "—";
  try {
    return new Date(date).toLocaleDateString("en-GB", {
      day: "2-digit",
      month: "short",
      year: "numeric",
    });
  } catch {
    return date;
  }
}

export function formatMilestoneDate(date) {
  if (!date || date === "—") return "—";
  try {
    return new Date(date).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
      year: "numeric",
    });
  } catch {
    return date;
  }
}

function milestoneCardMeta(category, health, projectName) {
  const name = String(projectName || "").toLowerCase();
  const cat = String(category || "").toLowerCase();
  let icon = "building";
  let iconTone = "green";

  if (health === "at_risk") {
    iconTone = "orange";
    if (/court|complex|mall|plaza/.test(name)) icon = "bag";
    else if (cat === "residential" || /villa|home|court/.test(name)) icon = "home";
    else icon = "building";
  } else if (/tower|heights|plaza|oceanic/.test(name)) {
    iconTone = "blue";
    icon = "tower";
  } else if (cat === "residential" || /villa|court|home|tower/.test(name)) {
    iconTone = "green";
    icon = "home";
  } else {
    iconTone = "green";
    icon = "building";
  }

  return { icon, iconTone };
}

function projectHealth(project, milestones = [], today = new Date().toISOString().slice(0, 10)) {
  const delayed = milestones.some((m) => milestoneVariance(m, today).key === "delayed");
  if (delayed || project.status === "on_hold") return "delayed";
  const progress = Number(project.progressPercent) || 0;
  const end = project.endDate;
  if (end && end < today && progress < 100) return "at_risk";
  if (progress > 0 && progress < 30 && end) {
    const daysLeft = Math.ceil((new Date(end) - new Date(today)) / 86400000);
    if (daysLeft < 60) return "at_risk";
  }
  return "on_track";
}

export function computeDashboardKpis(state, projects = []) {
  const today = new Date();
  const monthPrefix = today.toISOString().slice(0, 7);
  const lastMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
  const lastMonthPrefix = lastMonth.toISOString().slice(0, 7);

  const active = projects.filter((p) => ACTIVE_STATUSES.has(String(p.status || "ongoing").toLowerCase()));
  let onTrack = 0;
  let delayed = 0;
  for (const p of active) {
    const h = projectHealth(p, state.milestonesByProject?.[p.id] || []);
    if (h === "delayed") delayed += 1;
    else onTrack += 1;
  }

  const contractValue = active.reduce((s, p) => s + resolveBudgetTotal(p), 0);

  const openBills = (state.clientInvoices || []).filter((b) => b.status !== "cancelled" && b.status !== "paid");
  const receivable = openBills.reduce(
    (s, b) => s + Math.max(0, Number(b.amount || 0) - Number(b.paidAmount || 0)),
    0
  );
  const overdue = openBills
    .filter((b) => b.dueDate && b.dueDate < today.toISOString().slice(0, 10))
    .reduce((s, b) => s + Math.max(0, Number(b.amount || 0) - Number(b.paidAmount || 0)), 0);

  const monthCollected = (state.clientInvoices || [])
    .filter((b) => (b.paidDate || b.billDate || "").startsWith(monthPrefix))
    .reduce((s, b) => s + Number(b.paidAmount || 0), 0);
  const monthTarget = Math.max(contractValue * 0.03, monthCollected * 1.15, 1);
  const collectionPct = Math.min(100, Math.round((monthCollected / monthTarget) * 100));

  const monthExpense = (state.projectExpenses || [])
    .filter((e) => (e.expenseDate || e.date || "").startsWith(monthPrefix))
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const lastMonthExpense = (state.projectExpenses || [])
    .filter((e) => (e.expenseDate || e.date || "").startsWith(lastMonthPrefix))
    .reduce((s, e) => s + Number(e.amount || 0), 0);
  const expenseTrend =
    lastMonthExpense > 0 ? Math.round(((monthExpense - lastMonthExpense) / lastMonthExpense) * 100) : 0;

  return {
    activeCount: active.length,
    onTrack,
    delayed,
    contractValue,
    receivable,
    overdue,
    monthCollected,
    monthTarget,
    collectionPct,
    monthExpense,
    expenseTrend,
  };
}

export function buildProjectPerformanceRows(projects = [], milestonesByProject = {}) {
  const today = new Date().toISOString().slice(0, 10);
  return projects
    .filter((p) => ACTIVE_STATUSES.has(String(p.status || "ongoing").toLowerCase()))
    .map((p) => {
      const budget = resolveBudgetTotal(p);
      const summary = computeProjectBudgetSummary(p.id);
      const spent = Number(summary.actual) || 0;
      const remaining = Math.max(0, budget - spent);
      return {
        id: p.id,
        name: p.name,
        category: resolveProjectCategory(p),
        progress: Number(p.progressPercent) || 0,
        budget,
        spent,
        remaining,
        deadline: p.endDate || "—",
        deadlineLabel: formatDashboardDeadline(p.endDate),
        health: projectHealth(p, milestonesByProject[p.id] || [], today),
      };
    })
    .sort((a, b) => b.budget - a.budget)
    .slice(0, 8);
}

export function buildAttentionItems(state, projects = []) {
  const today = todayISO();
  const items = [];

  const delayedProjects = projects.filter(
    (p) => projectHealth(p, state.milestonesByProject?.[p.id] || [], today) === "delayed"
  );
  if (delayedProjects.length) {
    const n = delayedProjects.length;
    items.push({
      icon: "warning",
      title: `${n} Project${n === 1 ? "" : "s"} Delayed`,
      action: "View",
      link: "#/projects",
    });
  }

  const openBills = (state.clientInvoices || []).filter((b) => b.status !== "cancelled" && b.status !== "paid");
  const overdueAmount = openBills
    .filter((b) => b.dueDate && b.dueDate < today)
    .reduce((s, b) => s + Math.max(0, Number(b.amount || 0) - Number(b.paidAmount || 0)), 0);
  if (overdueAmount > 0) {
    items.push({
      icon: "payment",
      title: `${formatCompactBDT(overdueAmount)} Payment Overdue`,
      action: "View",
      link: "#/billing",
    });
  }

  const purchasePending = (state.approvalQueue || []).filter(
    (a) =>
      (a.status === "pending" || a.status === "submitted") &&
      PURCHASE_APPROVAL_TYPES.has(String(a.entityType || "").toLowerCase())
  ).length;
  if (purchasePending > 0) {
    items.push({
      icon: "approval",
      title: `${purchasePending} Purchase Request${purchasePending === 1 ? "" : "s"} Pending Approval`,
      action: "Review",
      link: "#/approvals",
    });
  }

  const lowStock = listLowStock(state.materials || []);
  if (lowStock.length) {
    const n = lowStock.length;
    items.push({
      icon: "materials",
      title: `${n} Material${n === 1 ? "" : "s"} Below Minimum Stock`,
      action: "View",
      link: "#/inventory",
    });
  }

  const maintMap = latestMaintenanceByAsset(state.maintenance || []);
  let maintenanceOverdue = 0;
  for (const record of maintMap.values()) {
    if (isMaintenanceOverdue(record, today)) maintenanceOverdue += 1;
  }
  if (maintenanceOverdue > 0) {
    items.push({
      icon: "maintenance",
      title: `${maintenanceOverdue} Equipment Maintenance Overdue`,
      action: "View",
      link: "#/assets",
    });
  }

  const delayedDeliveries = (state.purchaseOrders || []).filter((po) => {
    const status = String(po.status || "").toLowerCase();
    return po.expectedDate && po.expectedDate < today && !DELIVERED_PO_STATUSES.has(status);
  }).length;
  if (delayedDeliveries > 0) {
    items.push({
      icon: "delivery",
      title: `${delayedDeliveries} Supplier Deliver${delayedDeliveries === 1 ? "y" : "ies"} Delayed`,
      action: "View",
      link: "#/purchases",
    });
  }

  return items.slice(0, 6);
}

const APPROVAL_LABELS = {
  purchase_requisition: "Purchase Requisition",
  material_request: "Material Request",
  expense: "Expense Claim",
  change_order: "Change Order",
  quality: "Quality Check",
  safety: "Safety Incident",
  contract_claim: "Contract Claim",
};

const APPROVAL_CATEGORIES = [
  { id: "requisition", label: "Purchase Requisition", icon: "requisition", types: ["purchase_requisition"] },
  { id: "order", label: "Purchase Order", icon: "order", types: ["purchaseorder", "purchase_order"] },
  { id: "material", label: "Material Request", icon: "material", types: ["material_request"] },
  { id: "expense", label: "Expense Approval", icon: "expense", types: ["projectexpense", "expense"] },
  { id: "billing", label: "Client Billing Approval", icon: "billing", types: ["clientinvoice", "client_invoice", "billing"] },
];

export function buildApprovalGroups(approvalQueue = []) {
  const pending = (approvalQueue || []).filter((a) => a.status === "pending" || a.status === "submitted");
  const typeCounts = new Map();
  for (const row of pending) {
    const key = String(row.entityType || row.type || "other").toLowerCase();
    typeCounts.set(key, (typeCounts.get(key) || 0) + 1);
  }
  return APPROVAL_CATEGORIES.map((cat) => {
    const count = cat.types.reduce((sum, t) => sum + (typeCounts.get(t) || 0), 0);
    return { label: cat.label, count, icon: cat.icon };
  })
    .filter((g) => g.count > 0)
    .slice(0, 5);
}

export function buildSiteActivity(state, projects = [], today = todayISO()) {
  const scoped = projects.filter((p) => ACTIVE_STATUSES.has(String(p.status || "ongoing").toLowerCase()));
  const active = scoped.filter((p) => (p.status || "ongoing") === "ongoing");
  const totalSites = scoped.length;
  const activeSites = active.length;

  const workersPresent = (state.attendance || []).filter(
    (a) => a.date === today && (a.status === "present" || a.status === "half_day")
  ).length;

  let siteDiaries = 0;
  for (const p of scoped) {
    const rows = state.siteDiariesByProject?.[p.id] || [];
    siteDiaries += rows.filter(
      (d) => d.logDate === today && (d.status === "submitted" || d.status === "approved")
    ).length;
  }

  const siteInCharge = (state.siteInCharges || []).filter(
    (s) => String(s.status || "active").toLowerCase() === "active"
  ).length;

  const allIncidents = Object.values(state.safetyIncidentsByProject || {}).flat();
  const safetyIssues = allIncidents.filter((i) => {
    const status = String(i.status || i.closureStatus || "").toLowerCase();
    return status !== "closed" && status !== "resolved";
  }).length;

  let workDelays = 0;
  for (const p of scoped) {
    if (projectHealth(p, state.milestonesByProject?.[p.id] || [], today) === "delayed") workDelays += 1;
  }

  const rows = active.map((p) => {
    const dayAttendance = (state.attendance || []).filter((a) => a.projectId === p.id && a.date === today);
    const present = dayAttendance.filter((a) => a.status === "present" || a.status === "half_day").length;
    const absentMarked = dayAttendance.filter((a) => a.status === "absent").length;
    const roster = (state.projectRosterByProject?.[p.id] || []).filter(
      (r) => String(r.status || "active").toLowerCase() === "active"
    );
    let totalWorkers = roster.length;
    if (!totalWorkers) totalWorkers = dayAttendance.length;
    if (!totalWorkers && present) totalWorkers = present;
    const absent = absentMarked || Math.max(0, totalWorkers - present);
    const health = projectHealth(p, state.milestonesByProject?.[p.id] || [], today);
    return { site: p.name, totalWorkers, present, absent, health };
  });

  return {
    stats: {
      workersPresent,
      activeSites,
      totalSites,
      siteDiaries,
      siteInCharge,
      safetyIssues,
      workDelays,
    },
    rows: rows.slice(0, 8),
  };
}

function formatMaterialStockQty(material) {
  const stock = Number(material?.currentStock) || 0;
  const unit = unitLabel(material?.unit);
  const unitDisplay = unit === "bag" ? "Bags" : unit.charAt(0).toUpperCase() + unit.slice(1);
  const qty = Number.isInteger(stock) ? String(stock) : stock.toFixed(1).replace(/\.0$/, "");
  return `${qty} ${unitDisplay}`;
}

function materialCategoryIcon(category) {
  const cat = String(category || "").toLowerCase();
  if (cat === "cement") return "cement";
  if (cat === "rod") return "rod";
  if (cat === "sand") return "sand";
  return "material";
}

function flattenMaterialRequests(mrsByProject = {}) {
  const rows = [];
  for (const list of Object.values(mrsByProject || {})) {
    if (Array.isArray(list)) rows.push(...list);
  }
  return rows;
}

export function buildProcurementAlerts(state = {}) {
  const materials = state.materials || [];
  const purchaseOrders = state.purchaseOrders || [];
  const materialRequestsByProject = state.materialRequestsByProject || {};
  const alerts = [];
  const today = todayISO();

  const lowStock = listLowStock(materials)
    .map((m) => ({
      ...m,
      shortfall: Math.max(0, (Number(m.reorderLevel) || 0) - (Number(m.currentStock) || 0)),
    }))
    .sort((a, b) => b.shortfall - a.shortfall);

  for (const m of lowStock.slice(0, 3)) {
    const name = m.name || m.materialName || "Material";
    const stock = Number(m.currentStock) || 0;
    if (stock > 0) {
      alerts.push({
        icon: materialCategoryIcon(m.category),
        iconTone: "green",
        title: `${name} Low Stock: ${formatMaterialStockQty(m)}`,
        tag: "Low Stock",
        tagTone: "low-stock",
        link: "#/inventory",
      });
    } else {
      alerts.push({
        icon: materialCategoryIcon(m.category),
        iconTone: "green",
        title: `${name} Reorder Required`,
        tag: "Reorder",
        tagTone: "reorder",
        link: "#/inventory",
      });
    }
  }

  const delayedPos = (purchaseOrders || []).filter((po) => {
    const status = String(po.status || "").toLowerCase();
    return po.expectedDate && po.expectedDate < today && !DELIVERED_PO_STATUSES.has(status);
  });
  if (delayedPos.length) {
    const n = delayedPos.length;
    alerts.push({
      icon: "po",
      iconTone: "red",
      title: `${n} Purchase Order${n === 1 ? "" : "s"} Delayed`,
      tag: "Delayed",
      tagTone: "delayed",
      link: "#/purchases",
    });
  }

  const overdueSuppliers = new Set(
    delayedPos.map((po) => po.vendorId || po.supplierId).filter(Boolean)
  );
  if (overdueSuppliers.size) {
    const n = overdueSuppliers.size;
    alerts.push({
      icon: "delivery",
      iconTone: "red",
      title: `${n} Supplier${n === 1 ? "" : "s"} Delivery Overdue`,
      tag: "Overdue",
      tagTone: "overdue",
      link: "#/purchases",
    });
  }

  const pendingMrs = flattenMaterialRequests(materialRequestsByProject).filter((mr) => {
    const status = String(mr.status || "").toLowerCase();
    const delivery = String(mr.deliveryStatus || "").toLowerCase();
    return (status === "submitted" || status === "approved") && delivery !== "delivered";
  });
  if (pendingMrs.length) {
    const n = pendingMrs.length;
    alerts.push({
      icon: "request",
      iconTone: "red",
      title: `${n} Material Request${n === 1 ? "" : "s"} Pending`,
      tag: "Pending",
      tagTone: "pending",
      link: "#/purchases",
    });
  }

  return alerts.slice(0, 6);
}

export function buildBillingSnapshot(clientInvoices = [], today = todayISO()) {
  const open = (clientInvoices || []).filter((b) => b.status !== "cancelled" && b.status !== "paid");
  const balance = (b) => Math.max(0, Number(b.amount || 0) - Number(b.paidAmount || 0));
  const dueSoonEnd = (() => {
    const d = new Date(today);
    d.setDate(d.getDate() + 30);
    return d.toISOString().slice(0, 10);
  })();

  let receivable = 0;
  let current = 0;
  let due = 0;
  let overdue = 0;

  for (const b of open) {
    const bal = balance(b);
    if (bal <= 0) continue;
    receivable += bal;
    const dueDate = b.dueDate || "";
    if (dueDate && dueDate < today) overdue += bal;
    else if (dueDate && dueDate <= dueSoonEnd) due += bal;
    else current += bal;
  }

  const upcoming = open
    .filter((b) => b.dueDate && b.dueDate >= today && balance(b) > 0)
    .map((b) => ({
      client: b.clientName || "—",
      project: b.projectName || "—",
      amount: balance(b),
      dueDate: b.dueDate,
      dueDateLabel: formatDashboardDeadline(b.dueDate),
    }))
    .sort((a, b) => String(a.dueDate).localeCompare(String(b.dueDate)))
    .slice(0, 5);

  return { receivable, current, due, overdue, upcoming };
}

export function buildBudgetSummary(projects = []) {
  let budget = 0;
  let spent = 0;
  for (const p of projects) {
    if (!ACTIVE_STATUSES.has(String(p.status || "ongoing").toLowerCase())) continue;
    budget += resolveBudgetTotal(p);
    spent += Number(computeProjectBudgetSummary(p.id).actual) || 0;
  }
  const committed = Math.round(budget * 0.12);
  const remaining = Math.max(0, budget - spent - committed);
  return { budget, spent, committed, remaining };
}

export function buildUpcomingMilestones(milestonesByProject = {}, projects = [], days = 7) {
  const today = new Date();
  const end = new Date(today);
  end.setDate(today.getDate() + days);
  const todayStr = today.toISOString().slice(0, 10);
  const endStr = end.toISOString().slice(0, 10);
  const projectMap = new Map(projects.map((p) => [p.id, p]));
  const items = [];

  for (const [pid, list] of Object.entries(milestonesByProject || {})) {
    const proj = projectMap.get(pid);
    const projectName = proj?.name || pid;
    const category = resolveProjectCategory(proj);
    const projHealth = projectHealth(proj, list || [], todayStr);
    const health = projHealth === "at_risk" || projHealth === "delayed" ? "at_risk" : "on_track";
    const { icon, iconTone } = milestoneCardMeta(category, health, projectName);
    for (const m of list || []) {
      if (m.status === "completed") continue;
      if (!m.plannedDate || m.plannedDate < todayStr || m.plannedDate > endStr) continue;
      items.push({
        title: m.title,
        projectName,
        date: m.plannedDate,
        dateLabel: formatMilestoneDate(m.plannedDate),
        category,
        health,
        icon,
        iconTone,
      });
    }
  }

  return items.sort((a, b) => String(a.date).localeCompare(String(b.date))).slice(0, 5);
}

export function formatChartDayLabel(isoDate) {
  try {
    return new Date(isoDate).toLocaleDateString("en-US", { month: "short", day: "numeric" });
  } catch {
    return isoDate;
  }
}

function cashFlowDayKeys(period) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const keys = [];
  if (period === "week") {
    for (let i = 6; i >= 0; i -= 1) {
      const d = new Date(today);
      d.setDate(today.getDate() - i);
      keys.push(d.toISOString().slice(0, 10));
    }
    return keys;
  }
  const year = today.getFullYear();
  const month = today.getMonth();
  for (let day = 1; day <= today.getDate(); day += 1) {
    keys.push(new Date(year, month, day).toISOString().slice(0, 10));
  }
  return keys;
}

function addCashFlowBucket(buckets, dateKey, field, amount) {
  const key = String(dateKey || "").slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(key)) return;
  if (!buckets[key]) {
    buckets[key] = { clientCollection: 0, projectExpense: 0, purchaseExpense: 0, salaryWages: 0 };
  }
  buckets[key][field] += Number(amount) || 0;
}

export function buildCashFlowChartData(state, period = "month") {
  const buckets = {};
  const dayKeys = cashFlowDayKeys(period);

  for (const inv of state.clientInvoices || []) {
    if (Number(inv.paidAmount) > 0 && inv.paidDate) {
      addCashFlowBucket(buckets, inv.paidDate, "clientCollection", inv.paidAmount);
    }
  }
  for (const exp of state.projectExpenses || []) {
    const date = exp.expenseDate || exp.date;
    if (date) addCashFlowBucket(buckets, date, "projectExpense", exp.amount);
  }
  for (const po of state.purchaseOrders || []) {
    if (po.orderDate) addCashFlowBucket(buckets, po.orderDate, "purchaseExpense", po.amount);
  }
  for (const pay of state.salaryPayments || []) {
    if (pay.date) addCashFlowBucket(buckets, pay.date, "salaryWages", pay.amount);
  }

  const labels = [];
  const clientCollection = [];
  const projectExpense = [];
  const purchaseExpense = [];
  const salaryWages = [];
  const net = [];

  for (const key of dayKeys) {
    const row = buckets[key] || { clientCollection: 0, projectExpense: 0, purchaseExpense: 0, salaryWages: 0 };
    labels.push(formatChartDayLabel(key));
    clientCollection.push(row.clientCollection);
    projectExpense.push(row.projectExpense);
    purchaseExpense.push(row.purchaseExpense);
    salaryWages.push(row.salaryWages);
    net.push(row.clientCollection - row.projectExpense - row.purchaseExpense - row.salaryWages);
  }

  const peak = Math.max(
    ...clientCollection,
    ...projectExpense,
    ...purchaseExpense,
    ...salaryWages,
    ...net.map((v) => Math.abs(v)),
    1
  );
  const peakLac = peak / 100000;
  const yMaxLac = Math.max(5, Math.ceil(peakLac / 5) * 5);

  return {
    labels,
    clientCollection,
    projectExpense,
    purchaseExpense,
    salaryWages,
    net,
    yMaxLac,
  };
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function countPendingApprovals(approvalQueue = []) {
  return (approvalQueue || []).filter((a) => a.status === "pending" || a.status === "submitted").length;
}

export { projectHealth };
