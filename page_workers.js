import { getCurrentRole, canPerformAction } from "./svc_governance.js";
import { getCurrentUserId } from "./svc_auth.js";
import { readRef } from "./svc_data.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { showToast } from "./cmp_toast.js";
import { formatBDT } from "./util_format.js";
import { openEditDialog, renderDataTable, escapeHtml } from "./cmp_projectTab.js";
import { icon } from "./cmp_icons.js";
import { kpiIcon } from "./cmp_dashboardIcons.js";
import { formatCompactBDT } from "./util_dashboard.js";
import {
  WORKER_TABS,
  WORKER_PROFILE_TABS,
  renderWorkerTabBar,
  renderWorkerDetailHeader,
  renderWorkerAvatar,
  renderWorkerNameCell,
  renderWorkerListNameCell,
  renderWorkerStatusBadge,
  renderReturnStatusBadge,
  renderAttendanceCell,
  renderAttendanceLegend,
  renderMonthPicker,
  renderWorkerStatCards,
  renderWorkerEmptyState,
  renderIconBtn,
  renderListDetailsBtn,
  renderMobileDetailsBadge,
  renderProfileCard,
} from "./cmp_workerHub.js";
import { renderPagination } from "./cmp_moduleHub.js";
import {
  WORKER_DESIGNATIONS,
  EMPLOYMENT_TYPES,
  designationLabel,
  employmentTypeLabel,
  filterWorkers,
  paginateSlice,
  summarizeAttendance,
  computeSalaryDue,
  advancesForWorkerMonth,
  presentDaysForWorkerMonth,
  monthDays,
  todayISO,
  countTotalWorkers,
  countPresentToday,
  countOnLeaveToday,
  resolveWorkerListStatus,
} from "./util_workers.js";
import {
  confirmSalaryPayment,
  calculateSalary,
  recordAdvanceWithAuthority,
  recordAttendanceWithAuthority,
  reconcileSitePayroll,
} from "./svc_payroll.js";
import {
  buildSitePayrollSummary,
  buildCrossSiteAttendanceHistory,
  computeOutstandingAdvances,
  buildPaymentConfirmationLog,
  paymentModeLabel,
} from "./util_payroll.js";
import {
  createWorker,
  updateWorker,
  recordAttendance,
  recordAdvance,
  recordSiteTransfer,
  createWorkerDocument,
} from "./svc_workers.js";
import { listenList, removePath } from "./svc_data.js";

const ATTENDANCE_TOGGLE = ["present", "absent", "half_day"];
const PAYMENT_METHODS = [
  { value: "cash", label: "Cash" },
  { value: "bank", label: "Bank transfer" },
  { value: "mobile", label: "Mobile banking" },
];

function currentMonthKey() {
  return todayISO().slice(0, 7);
}

function workerSparklineSvg(values = [], tone = "green") {
  const pts = values.length ? values : [3, 4, 4, 5, 5, 6, 6];
  const max = Math.max(...pts, 1);
  const w = 56;
  const h = 22;
  const coords = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1 || 1)) * w;
      const y = h - (v / max) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const strokes = {
    blue: "#2563eb",
    green: "#047857",
    orange: "#d97706",
    teal: "#0d9488",
    red: "#B91C1C",
    yellow: "#CA8A04",
  };
  const stroke = strokes[tone] || strokes.green;
  return `<svg class="dash-sparkline dash-sparkline--${tone}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

function nextAttendanceStatus(current) {
  if (!current || current === "leave") return "present";
  const idx = ATTENDANCE_TOGGLE.indexOf(current);
  if (idx === -1) return "present";
  if (idx === ATTENDANCE_TOGGLE.length - 1) return "";
  return ATTENDANCE_TOGGLE[idx + 1];
}

function workerFormFields(projects) {
  return [
    { name: "name", label: "Full name *", required: true },
    { name: "phone", label: "Phone" },
    { name: "nid", label: "NID / ID" },
    { name: "address", label: "Address", type: "textarea" },
    {
      name: "designation",
      label: "Designation",
      type: "select",
      options: WORKER_DESIGNATIONS.map((d) => ({ value: d.id, label: d.label })),
    },
    {
      name: "employmentType",
      label: "Employment type",
      type: "select",
      options: EMPLOYMENT_TYPES.map((t) => ({ value: t.id, label: t.label })),
    },
    { name: "wageRate", label: "Wage rate", type: "number", step: "0.01" },
    {
      name: "assignedProjectId",
      label: "Assigned site",
      type: "select",
      options: [{ value: "", label: "Unassigned" }, ...projects.map((p) => ({ value: p.id, label: p.name }))],
    },
    { name: "joiningDate", label: "Joining date", type: "date" },
    { name: "photoUrl", label: "Photo URL" },
    {
      name: "status",
      label: "Status",
      type: "select",
      options: [
        { value: "active", label: "Active" },
        { value: "inactive", label: "Inactive" },
      ],
    },
  ];
}

function defaultWorkerValues() {
  return {
    name: "",
    phone: "",
    nid: "",
    address: "",
    designation: "helper",
    employmentType: "daily",
    wageRate: "",
    assignedProjectId: "",
    joiningDate: todayISO(),
    photoUrl: "",
    status: "active",
  };
}

function printPayslip(worker, { monthKey, daysPresent, advance, gross, net, paymentDate, note }) {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><title>Payslip ? ${escapeHtml(worker.name)}</title>
<style>
body{font-family:system-ui,sans-serif;padding:32px;max-width:640px;margin:0 auto;color:#111}
h1{font-size:1.25rem;margin:0 0 8px}
.meta{color:#555;margin-bottom:20px;line-height:1.5}
table{width:100%;border-collapse:collapse}
td,th{padding:10px 0;border-bottom:1px solid #e5e5e5}
.right{text-align:right}
.total th,.total td{border-top:2px solid #111;font-size:1.1rem}
@media print{body{padding:0}}
</style></head><body>
<h1>Salary Payslip</h1>
<div class="meta">
<strong>${escapeHtml(worker.name)}</strong> (${escapeHtml(worker.workerCode || "?")})<br>
${escapeHtml(designationLabel(worker.designation))} ? ${escapeHtml(employmentTypeLabel(worker.employmentType))}<br>
Period: ${escapeHtml(monthKey)}
</div>
<table>
<tr><td>Wage rate</td><td class="right">${formatBDT(worker.wageRate ?? worker.dailyWage)}</td></tr>
<tr><td>Days present</td><td class="right">${daysPresent}</td></tr>
<tr><td>Gross</td><td class="right">${formatBDT(gross)}</td></tr>
<tr><td>Advance deducted</td><td class="right">${formatBDT(advance)}</td></tr>
<tr class="total"><th>Net paid</th><th class="right">${formatBDT(net)}</th></tr>
</table>
<p style="margin-top:24px">Payment date: ${escapeHtml(paymentDate)}</p>
${note ? `<p>Note: ${escapeHtml(note)}</p>` : ""}
</body></html>`;
  const win = window.open("", "_blank");
  if (!win) {
    showToast("Popup blocked ? allow popups for payslip", "error");
    return;
  }
  win.document.write(html);
  win.document.close();
  win.focus();
  win.print();
}

export function mountWorkers(container) {
  setActiveNav();
  setPageChrome({
    title: "HR & Payroll",
    subtitle: "Worker registry, attendance, salary, and site assignments",
    showDateRange: false,
    quickActionLabel: "",
    onQuickAction: null,
  });

  const root = document.createElement("div");
  root.className = "workers-page dashboard-page dashboard-mockup";
  container.appendChild(root);

  const state = {
    workers: [],
    projects: [],
    attendance: [],
    advances: [],
    salaryPayments: [],
    stockOut: [],
    transfers: [],
    documents: [],
    activeTab: "list",
    selectedWorkerId: "",
    profileTab: "overview",
    listQuery: "",
    listDesignation: "all",
    listProject: "all",
    listPage: 1,
    listPageSize: 10,
    attendanceMonth: currentMonthKey(),
    attendanceProject: "all",
    salaryMonth: currentMonthKey(),
    profileMonth: currentMonthKey(),
    reportsMonth: currentMonthKey(),
    reportsProject: "all",
    reportsWorker: "",
    siteInCharges: [],
    salaryCalculations: [],
    profileItemsReturn: "all",
    profileItemsPendingOnly: false,
  };

  let kpiHost = null;
  let tabHost = null;
  let contentHost = null;
  let unsubTransfers = () => {};
  let unsubDocuments = () => {};

  const projectName = (id) => state.projects.find((p) => p.id === id)?.name || "?";
  const getWorker = (id) => state.workers.find((w) => w.id === id);
  const activeWorkers = () => state.workers.filter((w) => (w.status || "active") === "active");
  const workerListStatus = (worker) => resolveWorkerListStatus(worker, state.attendance, todayISO());

  function attendanceRecord(workerId, date) {
    return state.attendance.find((r) => r.workerId === workerId && r.date === date);
  }

  function filteredAttendanceRecords(monthKey, projectId = "all") {
    return state.attendance.filter((r) => {
      if (!r.date?.startsWith(monthKey)) return false;
      if (projectId !== "all" && r.projectId !== projectId) return false;
      return true;
    });
  }

  function salaryStatus(workerId, monthKey) {
    const paid = state.salaryPayments.some((p) => p.workerId === workerId && p.monthKey === monthKey);
    if (paid) return "paid";
    const worker = getWorker(workerId);
    if (!worker) return "pending";
    const days = presentDaysForWorkerMonth(state.attendance, workerId, monthKey);
    const advance = advancesForWorkerMonth(state.advances, workerId, monthKey);
    const due = computeSalaryDue({
      wageRate: worker.wageRate ?? worker.dailyWage,
      employmentType: worker.employmentType,
      daysPresent: days,
      advanceTaken: advance,
    });
    return due > 0 ? "pending" : "clear";
  }

  function salaryRow(worker, monthKey = state.salaryMonth) {
    const daysPresent = presentDaysForWorkerMonth(state.attendance, worker.id, monthKey);
    const summary = summarizeAttendance(
      state.attendance.filter((a) => a.workerId === worker.id),
      monthKey
    );
    const advance = advancesForWorkerMonth(state.advances, worker.id, monthKey);
    const wageRate = Number(worker.wageRate ?? worker.dailyWage) || 0;
    const gross =
      worker.employmentType === "monthly"
        ? wageRate
        : daysPresent * wageRate + summary.overtime * wageRate * 1.5;
    const due = computeSalaryDue({
      wageRate,
      employmentType: worker.employmentType,
      daysPresent,
      advanceTaken: advance,
      overtimeHours: summary.overtime,
    });
    const status = salaryStatus(worker.id, monthKey);
    return { daysPresent, advance, gross, due, status, wageRate, overtime: summary.overtime };
  }

  function totalSalaryPending() {
    return activeWorkers().reduce((sum, w) => {
      if (salaryStatus(w.id, state.salaryMonth) !== "pending") return sum;
      return sum + salaryRow(w).due;
    }, 0);
  }

  function salaryStatusIcon(status) {
    if (status === "paid") {
      return `<span class="wrk-sal-indicator wrk-sal-indicator--paid" title="Paid">${icon("check", { size: 14, className: "icon" })}</span>`;
    }
    if (status === "pending") {
      return `<span class="wrk-sal-indicator wrk-sal-indicator--pending" title="Pending">${icon("banknote", { size: 14, className: "icon" })}</span>`;
    }
    return `<span class="wrk-sal-indicator wrk-sal-indicator--neutral" title="Clear">?</span>`;
  }

  function openProfile(workerId, tab = "overview") {
    state.selectedWorkerId = workerId;
    state.profileTab = tab;
    state.profileMonth = state.salaryMonth;
    bindWorkerSubcollections();
    render();
  }

  function closeProfile() {
    state.selectedWorkerId = "";
    state.profileTab = "overview";
    unsubTransfers();
    unsubDocuments();
    state.transfers = [];
    state.documents = [];
    render();
  }

  function bindWorkerSubcollections() {
    unsubTransfers();
    unsubDocuments();
    state.transfers = [];
    state.documents = [];
    const wid = state.selectedWorkerId;
    if (!wid) return;
    unsubTransfers = listenList(`workerTransfers/${wid}`, (list) => {
      state.transfers = [...list].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      if (state.selectedWorkerId === wid) renderProfileOverlay();
    });
    unsubDocuments = listenList(`workerDocuments/${wid}`, (list) => {
      state.documents = list;
      if (state.selectedWorkerId === wid && state.profileTab === "documents") renderProfileOverlay();
    });
  }

  function openWorkerDialog(worker = null) {
    const isEdit = Boolean(worker?.id);
    openEditDialog(
      isEdit ? "Edit worker" : "Add worker",
      workerFormFields(state.projects),
      isEdit
        ? {
            ...defaultWorkerValues(),
            ...worker,
            wageRate: worker.wageRate ?? worker.dailyWage ?? "",
          }
        : defaultWorkerValues(),
      async (vals) => {
        const payload = { ...vals, wageRate: Number(vals.wageRate) || 0 };
        try {
          if (isEdit) {
            await updateWorker(worker.id, payload);
            showToast("Worker updated");
          } else {
            const id = await createWorker(payload);
            showToast("Worker added");
          }
          render();
        } catch (err) {
          showToast(err.message, "error");
          throw err;
        }
      }
    );
  }

  function openAdvanceModal() {
    openEditDialog(
      "Give advance",
      [
        {
          name: "workerId",
          label: "Worker *",
          type: "select",
          required: true,
          options: [{ value: "", label: "Select worker" }, ...activeWorkers().map((w) => ({ value: w.id, label: w.name }))],
        },
        { name: "amount", label: "Amount (BDT) *", type: "number", step: "0.01", required: true },
        { name: "date", label: "Date", type: "date" },
        { name: "note", label: "Reason", type: "textarea" },
      ],
      { workerId: "", amount: "", date: todayISO(), note: "" },
      async (vals) => {
        const worker = getWorker(vals.workerId);
        const pid = worker?.assignedProjectId || "";
        const sic = pid ? readRef(`projects/${pid}`)?.siteInChargeId : "";
        if (pid && getCurrentRole() !== "owner" && getCurrentRole() !== "accountant") {
          await recordAdvanceWithAuthority({
            workerId: vals.workerId,
            amount: vals.amount,
            date: vals.date || todayISO(),
            reason: vals.note,
            projectId: pid,
            siteInChargeId: sic,
          });
        } else {
          await recordAdvance({
            workerId: vals.workerId,
            amount: vals.amount,
            date: vals.date || todayISO(),
            note: vals.note,
            reason: vals.note,
            projectId: pid,
          });
        }
        showToast("Advance recorded");
      }
    );
  }

  function openPaySalaryModal(worker) {
    const row = salaryRow(worker);
    if (row.due <= 0 && row.status !== "pending") {
      showToast("Nothing due for this worker", "error");
      return;
    }

    const overlay = document.createElement("div");
    overlay.className = "proj-edit-overlay";
    const dialog = document.createElement("div");
    dialog.className = "proj-edit-dialog card wrk-pay-dialog";
    dialog.setAttribute("role", "dialog");
    dialog.innerHTML = `
      <h3 class="proj-edit-title">Pay Salary</h3>
      <p class="wrk-pay-worker">${renderWorkerAvatar(worker, "sm")} ${escapeHtml(worker.name)}</p>
      <dl class="wrk-pay-breakdown">
        <dt>Wage rate</dt><dd>${formatBDT(row.wageRate)}</dd>
        <dt>Days present</dt><dd>${row.daysPresent}</dd>
        <dt>Gross (${row.daysPresent} ? ${formatBDT(row.wageRate)})</dt><dd>${formatBDT(row.gross)}</dd>
        <dt>Advance</dt><dd>? ${formatBDT(row.advance)}</dd>
        <dt class="wrk-pay-total">Final due</dt><dd class="wrk-pay-total">${formatBDT(row.due)}</dd>
      </dl>
      <form class="wrk-pay-form">
        <label>Amount paying now
          <input name="amount" type="number" step="0.01" min="0" value="${row.due}" required />
        </label>
        <label>Payment method
          <select name="method">${PAYMENT_METHODS.map((m) => `<option value="${m.value}">${escapeHtml(m.label)}</option>`).join("")}</select>
        </label>
        <div class="proj-edit-actions">
          <button type="button" class="btn btn-ghost btn-sm" data-cancel>Cancel</button>
          <button type="submit" class="btn btn-primary btn-sm">Confirm Payment</button>
        </div>
      </form>
    `;
    overlay.appendChild(dialog);
    document.body.appendChild(overlay);

    const close = () => overlay.remove();
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) close();
    });
    dialog.querySelector("[data-cancel]").onclick = close;

    dialog.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(e.target);
      const amount = Number(fd.get("amount")) || 0;
      const method = fd.get("method");
      if (amount <= 0) {
        showToast("Enter a valid amount", "error");
        return;
      }
      try {
        const pid = worker.assignedProjectId || "";
        const sic = pid ? readRef(`projects/${pid}`)?.siteInChargeId : "";
        let calcId = "";
        if (pid) {
          calcId = await calculateSalary(worker.id, pid, { cycle: "monthly", siteInChargeId: sic });
        }
        const mode = method === "mobile" ? "bkash" : method;
        await confirmSalaryPayment({
          workerId: worker.id,
          calcId,
          amount,
          paymentMode: mode,
          projectId: pid,
          siteInChargeId: sic,
          postExpense: Boolean(pid),
        });
        printPayslip(worker, {
          monthKey: state.salaryMonth,
          daysPresent: row.daysPresent,
          advance: row.advance,
          gross: row.gross,
          net: amount,
          paymentDate: todayISO(),
          note: String(method),
        });
        showToast("Salary payment recorded");
        close();
        renderContent();
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  }

  async function saveAttendance(workerId, date, status, overtimeHours = 0) {
    const worker = getWorker(workerId);
    if (!worker) return;
    const projectId = state.attendanceProject !== "all" ? state.attendanceProject : worker.assignedProjectId || "";
    try {
      if (!status) {
        await removePath(`workerAttendance/${workerId}_${date}`);
      } else if (projectId && getCurrentRole() !== "owner" && getCurrentRole() !== "accountant") {
        const sic = readRef(`projects/${projectId}`)?.siteInChargeId || "";
        await recordAttendanceWithAuthority({
          workerId,
          projectId,
          date,
          status,
          overtimeHours,
          siteInChargeId: sic,
        });
      } else {
        await recordAttendance({ workerId, projectId, date, status, overtimeHours, markedBy: getCurrentUserId() });
      }
    } catch (err) {
      showToast(err.message, "error");
    }
  }

  function bindAttendanceCells(scope) {
    scope.querySelectorAll(".wrk-att-cell-wrap").forEach((cell) => {
      cell.querySelector(".wrk-att-cell")?.addEventListener("click", async (e) => {
        e.stopPropagation();
        const workerId = cell.dataset.worker;
        const date = cell.dataset.date;
        const rec = attendanceRecord(workerId, date);
        const next = nextAttendanceStatus(rec?.status || "");
        await saveAttendance(workerId, date, next, rec?.overtimeHours || 0);
      });
      cell.addEventListener("dblclick", async (e) => {
        e.stopPropagation();
        const workerId = cell.dataset.worker;
        const date = cell.dataset.date;
        const rec = attendanceRecord(workerId, date);
        if (!rec?.status) return;
        const ot = prompt("Overtime hours", String(rec.overtimeHours || 0));
        if (ot == null) return;
        await saveAttendance(workerId, date, rec.status, Number(ot) || 0);
        renderContent();
      });
    });
  }

  function renderReportsTab() {
    const wrap = document.createElement("div");
    wrap.className = "wrk-tab-panel wrk-reports-panel";
    const month = state.reportsMonth;
    const projectFilter = state.reportsProject;
    const projects = projectFilter === "all" ? state.projects : state.projects.filter((p) => p.id === projectFilter);
    const siteSummary = buildSitePayrollSummary(projects, state.salaryPayments, state.salaryCalculations, month);
    const outstanding = computeOutstandingAdvances(state.advances, state.salaryPayments, state.workers);
    const paymentLog = buildPaymentConfirmationLog(state.salaryPayments, state.workers, state.siteInCharges);
    const workerOpts = [{ value: "", label: "All workers" }, ...state.workers.map((w) => ({ value: w.id, label: w.name }))];
    const history = state.reportsWorker
      ? buildCrossSiteAttendanceHistory(state.reportsWorker, state.attendance, state.projects)
      : [];

    wrap.innerHTML = `
      <div class="toolbar-row projects-toolbar workers-toolbar wrk-reports-toolbar" id="wrk-reports-toolbar">
        <div class="toolbar-filters">
          ${renderMonthPicker("wrk-reports-month", month)}
          <select id="wrk-reports-project" class="toolbar-select">
            <option value="all">All projects</option>
            ${state.projects.map((p) => `<option value="${p.id}" ${projectFilter === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
          </select>
        </div>
        <div class="toolbar-actions">
          ${
            canPerformAction("approve") || canPerformAction("approve_expense")
              ? `<button type="button" class="btn btn-primary btn-sm" id="wrk-reconcile-btn">Reconcile payroll</button>`
              : ""
          }
        </div>
      </div>
      <section class="dash-widget dash-widget--projects card wrk-report-block">
        <div class="dash-widget-head">
          <h3 class="dash-widget-title">Site-wise payroll summary</h3>
        </div>
        <div class="dash-widget-body">
          <div class="table-wrap projects-table-wrap">
            <table class="dash-table projects-table workers-table"><thead><tr><th>Project</th><th>Paid</th><th>Calculated</th></tr></thead>
            <tbody>${siteSummary.map((r) => `<tr><td>${escapeHtml(r.projectName)}</td><td>${formatBDT(r.laborPaid)}</td><td>${formatBDT(r.laborCalculated)}</td></tr>`).join("") || `<tr class="empty-row"><td colspan="3">No data</td></tr>`}</tbody></table>
          </div>
        </div>
      </section>
      <section class="dash-widget dash-widget--projects card wrk-report-block">
        <div class="dash-widget-head">
          <h3 class="dash-widget-title">Outstanding advances</h3>
        </div>
        <div class="dash-widget-body">
          <div class="table-wrap projects-table-wrap">
            <table class="dash-table projects-table workers-table"><thead><tr><th>Worker</th><th>Advanced</th><th>Outstanding</th></tr></thead>
            <tbody>${outstanding.map((r) => `<tr><td>${escapeHtml(r.workerName)}</td><td>${formatBDT(r.totalAdvanced)}</td><td>${formatBDT(r.outstanding)}</td></tr>`).join("") || `<tr class="empty-row"><td colspan="3">None</td></tr>`}</tbody></table>
          </div>
        </div>
      </section>
      <section class="dash-widget dash-widget--projects card wrk-report-block">
        <div class="dash-widget-head">
          <h3 class="dash-widget-title">Payment confirmation log</h3>
        </div>
        <div class="dash-widget-body">
          <div class="table-wrap projects-table-wrap">
            <table class="dash-table projects-table workers-table"><thead><tr><th>Date</th><th>Worker</th><th>Amount</th><th>Mode</th><th>Paid by</th><th>Site In-charge</th></tr></thead>
            <tbody>${paymentLog.slice(0, 20).map((r) => `<tr><td>${escapeHtml(r.date || "")}</td><td>${escapeHtml(r.workerName)}</td><td>${formatBDT(r.amount)}</td><td>${escapeHtml(paymentModeLabel(r.paymentMode))}</td><td>${escapeHtml(r.paidBy)}</td><td>${escapeHtml(r.siteInChargeName)}</td></tr>`).join("") || `<tr class="empty-row"><td colspan="6">No payments</td></tr>`}</tbody></table>
          </div>
        </div>
      </section>
      <section class="dash-widget dash-widget--projects card wrk-report-block">
        <div class="dash-widget-head dash-widget-head--split">
          <div>
            <h3 class="dash-widget-title">Worker attendance history</h3>
            <p class="dash-widget-sub">Cross-site attendance for a selected worker</p>
          </div>
        </div>
        <div class="dash-widget-body">
          <div class="toolbar-row projects-toolbar workers-toolbar">
            <div class="toolbar-filters">
              <select id="wrk-reports-worker" class="toolbar-select wrk-reports-worker-select">${workerOpts.map((o) => `<option value="${o.value}" ${state.reportsWorker === o.value ? "selected" : ""}>${escapeHtml(o.label)}</option>`).join("")}</select>
            </div>
          </div>
          <div class="table-wrap projects-table-wrap">
            <table class="dash-table projects-table workers-table"><thead><tr><th>Date</th><th>Project</th><th>Status</th><th>OT</th><th>Marked by</th></tr></thead>
            <tbody>${history.slice(0, 30).map((r) => `<tr><td>${escapeHtml(r.date)}</td><td>${escapeHtml(r.projectName)}</td><td>${escapeHtml(r.status)}</td><td>${r.overtimeHours}</td><td>${escapeHtml(r.markedBy)}</td></tr>`).join("") || `<tr class="empty-row"><td colspan="5">Select a worker</td></tr>`}</tbody></table>
          </div>
        </div>
      </section>
    `;

    wrap.querySelector("#wrk-reports-month")?.addEventListener("change", (e) => {
      state.reportsMonth = e.target.value;
      renderContent();
    });
    wrap.querySelector("#wrk-reports-project")?.addEventListener("change", (e) => {
      state.reportsProject = e.target.value;
      renderContent();
    });
    wrap.querySelector("#wrk-reports-worker")?.addEventListener("change", (e) => {
      state.reportsWorker = e.target.value;
      renderContent();
    });
    wrap.querySelector("#wrk-reconcile-btn")?.addEventListener("click", async () => {
      const pid = state.reportsProject !== "all" ? state.reportsProject : state.projects[0]?.id;
      if (!pid) {
        showToast("Select a project", "error");
        return;
      }
      try {
        const result = await reconcileSitePayroll(pid, month);
        showToast(`Reconciled: paid ${formatBDT(result.payrollTotal)} vs budget ${formatBDT(result.budgetActual)}`);
      } catch (err) {
        showToast(err.message, "error");
      }
    });
    return wrap;
  }

  function renderKpiStrip() {
    if (!kpiHost) return;
    const today = todayISO();
    const total = countTotalWorkers(state.workers);
    const present = countPresentToday(state.attendance, today);
    const onLeave = countOnLeaveToday(state.attendance, today);
    const salaryDue = totalSalaryPending();

    const cards = [
      {
        label: "Total workers",
        value: String(total),
        iconKey: "projects",
        tone: "blue",
        footLeft: total ? "Registered on payroll" : "No workers yet",
        spark: workerSparklineSvg([2, total || 1, total || 2, total || 3, 2, 2, 2], "blue"),
      },
      {
        label: "Present today",
        value: String(present),
        iconKey: "collection",
        tone: "green",
        footLeft: total ? `${Math.round((present / total) * 100) || 0}% attendance` : "?",
        spark: workerSparklineSvg([1, 2, present || 1, present || 2, present, present, present], "green"),
      },
      {
        label: "On leave",
        value: String(onLeave),
        iconKey: "expense",
        tone: "orange",
        footLeft: onLeave ? "Marked leave today" : "No leave today",
        spark: workerSparklineSvg([onLeave || 1, onLeave, onLeave, onLeave, 1, 1, 1], "orange"),
      },
      {
        label: "Salary due",
        value: formatCompactBDT(salaryDue),
        iconKey: "receivable",
        tone: "teal",
        footLeft: formatBDT(salaryDue),
        spark: workerSparklineSvg([2, salaryDue ? 4 : 2, 3, salaryDue ? 5 : 2, 3, 2, 2], "teal"),
      },
    ];

    kpiHost.className = "dash-kpi-row wrk-kpi-host";
    kpiHost.innerHTML = cards
      .map(
        (c) => `<div class="dash-kpi-card card cust-kpi-card">
      <div class="cust-kpi-spark">${c.spark}</div>
      <div class="dash-kpi-head">
        <div class="dash-kpi-icon dash-kpi-icon--flat">${kpiIcon(c.iconKey).replace('class="dash-color-icon"', 'class="dash-color-icon cust-kpi-flat-icon"')}</div>
        <div class="dash-kpi-main">
          <span class="dash-kpi-label">${escapeHtml(c.label)}</span>
          <div class="dash-kpi-value">${escapeHtml(c.value)}</div>
        </div>
      </div>
      <div class="dash-kpi-foot">
        <div class="dash-kpi-foot-left">${escapeHtml(c.footLeft)}</div>
      </div>
    </div>`
      )
      .join("");
  }

  function renderListTab() {
    const wrap = document.createElement("div");
    wrap.className = "wrk-tab-panel";

    const section = document.createElement("section");
    section.className = "dash-widget dash-widget--projects card";

    const list = filterWorkers(state.workers, {
      query: state.listQuery,
      designation: state.listDesignation,
      projectId: state.listProject,
      status: "all",
    });
    const page = paginateSlice(list, state.listPage, state.listPageSize);
    if (page.page !== state.listPage) state.listPage = page.page;

    section.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Worker directory</h3>
          <p class="dash-widget-sub">Search, filter, and open worker profiles</p>
        </div>
        <span class="cust-toolbar-count">Showing ${page.total} worker${page.total === 1 ? "" : "s"}</span>
      </div>
      <div class="dash-widget-body">
        <div class="toolbar-row projects-toolbar workers-toolbar" id="wrk-list-toolbar">
          <div class="toolbar-filters">
            <select class="toolbar-select" id="wrk-filter-designation">
              <option value="all">All designations</option>
              ${WORKER_DESIGNATIONS.map((d) => `<option value="${d.id}" ${state.listDesignation === d.id ? "selected" : ""}>${escapeHtml(d.label)}</option>`).join("")}
            </select>
            <select class="toolbar-select" id="wrk-filter-project">
              <option value="all">All sites</option>
              ${state.projects.map((p) => `<option value="${p.id}" ${state.listProject === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
            </select>
          </div>
          <div class="toolbar-actions">
            <div class="cust-toolbar-search toolbar-search">
              <span class="search-icon" aria-hidden="true">${icon("search", { size: 18 })}</span>
              <input type="search" class="cust-toolbar-search-input" id="wrk-list-search" placeholder="Search by name..." autocomplete="off" value="${escapeHtml(state.listQuery)}" />
            </div>
            <div class="cust-toolbar-btn-group">
              <button type="button" class="btn btn-ghost btn-sm cust-toolbar-btn cust-toolbar-btn--clear" id="wrk-clear-filters" title="Clear filters">${icon("rotateCcw", { size: 16 })} Clear</button>
              <button type="button" class="btn btn-primary btn-sm" id="wrk-add-btn">+ Add Worker</button>
            </div>
          </div>
        </div>
        <div class="wrk-list-content-host"></div>
      </div>
    `;

    const contentHost = section.querySelector(".wrk-list-content-host");

    if (!state.workers.length) {
      contentHost.appendChild(renderWorkerEmptyState({ onAdd: () => openWorkerDialog() }));
    } else if (!page.items.length) {
      const empty = document.createElement("p");
      empty.className = "proj-empty";
      empty.textContent = "No workers match your filters";
      contentHost.appendChild(empty);
    } else {
      const desktop = document.createElement("div");
      desktop.className = "table-wrap projects-table-wrap wrk-table-desktop";
      desktop.innerHTML = `
        <table class="dash-table projects-table workers-table wrk-responsive-table">
          <thead>
            <tr>
              <th>Worker</th><th>Designation</th><th>Site</th><th class="cust-col-center">Status</th><th class="cust-col-center">Action</th>
            </tr>
          </thead>
          <tbody>
            ${page.items
              .map(
                (w) => `<tr data-worker-id="${escapeHtml(w.id)}" class="wrk-list-row">
              <td>${renderWorkerListNameCell(w)}</td>
              <td>${escapeHtml(designationLabel(w.designation))}</td>
              <td>${escapeHtml(projectName(w.assignedProjectId))}</td>
              <td class="cust-col-center">${renderWorkerStatusBadge(workerListStatus(w))}</td>
              <td class="cust-col-center wrk-list-action-cell">
                ${renderListDetailsBtn(w.id)}
              </td>
            </tr>`
              )
              .join("")}
          </tbody>
        </table>
      `;
      contentHost.appendChild(desktop);

      const mobile = document.createElement("div");
      mobile.className = "wrk-mobile-cards";
      mobile.innerHTML = page.items
        .map(
          (w) => `<div class="wrk-mobile-card" data-worker-id="${escapeHtml(w.id)}">
          <div class="wrk-mobile-card-top">
            <div class="wrk-mobile-card-main">
              ${renderWorkerListNameCell(w)}
              ${renderWorkerStatusBadge(workerListStatus(w))}
            </div>
            ${renderMobileDetailsBadge(w.id)}
          </div>
          <div class="wrk-mobile-card-rows">
            <div class="wrk-mobile-card-row"><span>Designation</span><span>${escapeHtml(designationLabel(w.designation))}</span></div>
            <div class="wrk-mobile-card-row"><span>Site</span><span>${escapeHtml(projectName(w.assignedProjectId))}</span></div>
          </div>
        </div>`
        )
        .join("");
      contentHost.appendChild(mobile);

      contentHost.appendChild(
        renderPagination({
          page: page.page,
          pageSize: state.listPageSize,
          total: page.total,
          showInfo: false,
          onPage: (p) => {
            state.listPage = p;
            renderContent();
          },
        })
      );
    }

    wrap.appendChild(section);

    const toolbar = section.querySelector("#wrk-list-toolbar");
    toolbar.querySelector("#wrk-list-search").oninput = (e) => {
      state.listQuery = e.target.value;
      state.listPage = 1;
      renderContent();
    };
    toolbar.querySelector("#wrk-filter-designation").onchange = (e) => {
      state.listDesignation = e.target.value;
      state.listPage = 1;
      renderContent();
    };
    toolbar.querySelector("#wrk-filter-project").onchange = (e) => {
      state.listProject = e.target.value;
      state.listPage = 1;
      renderContent();
    };
    toolbar.querySelector("#wrk-add-btn").onclick = () => openWorkerDialog();
    toolbar.querySelector("#wrk-clear-filters").onclick = () => {
      state.listQuery = "";
      state.listDesignation = "all";
      state.listProject = "all";
      state.listPage = 1;
      renderContent();
    };

    wrap.querySelectorAll(".wrk-list-row, .wrk-mobile-card").forEach((row) => {
      row.onclick = (e) => {
        if (e.target.closest(".wrk-list-action-cell, .wrk-list-details-btn, .wrk-mobile-details-badge, .wrk-view-btn")) return;
        openProfile(row.dataset.workerId);
      };
    });
    wrap.querySelectorAll(".wrk-view-btn").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        openProfile(btn.dataset.id);
      };
    });

    return wrap;
  }

  function renderAttendanceTab() {
    const wrap = document.createElement("div");
    wrap.className = "wrk-tab-panel";

    let workers = activeWorkers();
    if (state.attendanceProject !== "all") {
      workers = workers.filter((w) => w.assignedProjectId === state.attendanceProject);
    }

    const days = monthDays(state.attendanceMonth);

    const section = document.createElement("section");
    section.className = "dash-widget dash-widget--projects card";
    section.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Attendance</h3>
          <p class="dash-widget-sub">Mark daily status by worker and site</p>
        </div>
        <span class="cust-toolbar-count">Showing ${workers.length} worker${workers.length === 1 ? "" : "s"}</span>
      </div>
      <div class="dash-widget-body">
        <div class="toolbar-row projects-toolbar workers-toolbar" id="wrk-att-toolbar">
          <div class="toolbar-filters">
            ${renderMonthPicker("wrk-att-month", state.attendanceMonth)}
            <select class="toolbar-select" id="wrk-att-project">
              <option value="all">All sites</option>
              ${state.projects.map((p) => `<option value="${p.id}" ${state.attendanceProject === p.id ? "selected" : ""}>${escapeHtml(p.name)}</option>`).join("")}
            </select>
          </div>
        </div>
        <div class="wrk-att-content-host"></div>
      </div>
    `;

    const contentHost = section.querySelector(".wrk-att-content-host");

    if (!workers.length) {
      const empty = document.createElement("p");
      empty.className = "proj-empty";
      empty.textContent = "No active workers for selected site";
      contentHost.appendChild(empty);
    } else {
      const desktop = document.createElement("div");
      desktop.className = "wrk-att-grid-wrap wrk-att-desktop";
      desktop.innerHTML = `
        <table class="dash-table wrk-att-grid">
          <thead>
            <tr>
              <th class="wrk-att-sticky">Worker</th>
              ${days.map((d) => `<th>${Number(d.slice(8))}</th>`).join("")}
            </tr>
          </thead>
          <tbody>
            ${workers
              .map(
                (w) => `<tr>
              <td class="wrk-att-sticky">${renderWorkerNameCell(w)}</td>
              ${days
                .map((d) => {
                  const rec = attendanceRecord(w.id, d);
                  return `<td class="wrk-att-cell-wrap" data-worker="${escapeHtml(w.id)}" data-date="${escapeHtml(d)}">${renderAttendanceCell(rec?.status)}</td>`;
                })
                .join("")}
            </tr>`
              )
              .join("")}
          </tbody>
        </table>
      `;
      contentHost.appendChild(desktop);
      bindAttendanceCells(desktop);

      const mobile = document.createElement("div");
      mobile.className = "wrk-att-mobile";
      mobile.innerHTML = workers
        .map(
          (w) => `<details class="wrk-att-accordion">
          <summary>${renderWorkerAvatar(w, "sm")} ${escapeHtml(w.name)}</summary>
          <div class="wrk-att-mobile-days">
            ${days
              .map((d) => {
                const rec = attendanceRecord(w.id, d);
                return `<div class="wrk-att-mobile-day">
                <span>Day ${Number(d.slice(8))}</span>
                <span class="wrk-att-cell-wrap" data-worker="${escapeHtml(w.id)}" data-date="${escapeHtml(d)}">${renderAttendanceCell(rec?.status)}</span>
              </div>`;
              })
              .join("")}
          </div>
        </details>`
        )
        .join("");
      contentHost.appendChild(mobile);
      bindAttendanceCells(mobile);

      contentHost.insertAdjacentHTML("beforeend", renderAttendanceLegend());
    }

    wrap.appendChild(section);

    const toolbar = section.querySelector("#wrk-att-toolbar");
    toolbar.querySelector("#wrk-att-month").onchange = (e) => {
      state.attendanceMonth = e.target.value;
      renderContent();
    };
    toolbar.querySelector("#wrk-att-project").onchange = (e) => {
      state.attendanceProject = e.target.value;
      renderContent();
    };

    return wrap;
  }

  function renderSalaryTab() {
    const wrap = document.createElement("div");
    wrap.className = "wrk-tab-panel";

    const rows = activeWorkers().map((w) => ({ worker: w, ...salaryRow(w) }));

    const section = document.createElement("section");
    section.className = "dash-widget dash-widget--projects card";
    section.innerHTML = `
      <div class="dash-widget-head dash-widget-head--split">
        <div>
          <h3 class="dash-widget-title">Salary &amp; advances</h3>
          <p class="dash-widget-sub">Monthly pay, advances, and payment actions</p>
        </div>
        <span class="cust-toolbar-count">Showing ${rows.length} worker${rows.length === 1 ? "" : "s"}</span>
      </div>
      <div class="dash-widget-body">
        <div class="toolbar-row projects-toolbar workers-toolbar" id="wrk-sal-toolbar">
          <div class="toolbar-filters">
            ${renderMonthPicker("wrk-sal-month", state.salaryMonth)}
          </div>
          <div class="toolbar-actions">
            <button type="button" class="btn btn-ghost btn-sm cust-toolbar-btn" id="wrk-advance-btn">${icon("userPlus", { size: 14, className: "icon" })} Give Advance</button>
          </div>
        </div>
        <div class="wrk-sal-content-host"></div>
      </div>
    `;

    const contentHost = section.querySelector(".wrk-sal-content-host");
    const desktop = document.createElement("div");
    desktop.className = "table-wrap projects-table-wrap wrk-table-desktop";
    desktop.innerHTML = `
      <table class="dash-table projects-table workers-table wrk-responsive-table">
        <thead>
          <tr>
            <th>Worker</th><th>Rate/day</th><th>Days present</th><th>Advance</th><th>Due</th><th class="cust-col-center">Status</th><th class="cust-col-center">Action</th>
          </tr>
        </thead>
        <tbody>
          ${
            rows.length
              ? rows
                  .map(
                    (r) => `<tr class="wrk-sal-row" data-worker-id="${escapeHtml(r.worker.id)}">
              <td>${renderWorkerNameCell(r.worker)}</td>
              <td>${formatBDT(r.worker.wageRate ?? r.worker.dailyWage)}</td>
              <td>${r.daysPresent}</td>
              <td>${formatBDT(r.advance)}</td>
              <td class="wrk-sal-due">${formatBDT(r.due)}</td>
              <td class="cust-col-center">${salaryStatusIcon(r.status)}</td>
              <td class="cust-col-center proj-row-actions-cell">
                ${
                  r.status === "paid"
                    ? `<span class="text-muted">Paid</span>`
                    : r.due > 0
                      ? `<button type="button" class="btn btn-primary btn-sm wrk-pay-btn" data-id="${escapeHtml(r.worker.id)}">Pay</button>`
                      : `<span class="text-muted">?</span>`
                }
              </td>
            </tr>`
                  )
                  .join("")
              : `<tr class="empty-row"><td colspan="7">No active workers</td></tr>`
          }
        </tbody>
      </table>
    `;
    contentHost.appendChild(desktop);

    const mobile = document.createElement("div");
    mobile.className = "wrk-mobile-cards";
    mobile.innerHTML = rows
      .map(
        (r) => `<div class="wrk-mobile-card wrk-sal-row" data-worker-id="${escapeHtml(r.worker.id)}">
        <div class="wrk-mobile-card-head">${renderWorkerNameCell(r.worker)}${salaryStatusIcon(r.status)}</div>
        <div class="wrk-mobile-card-rows">
          <div class="wrk-mobile-card-row"><span>Rate/day</span><span>${formatBDT(r.worker.wageRate ?? r.worker.dailyWage)}</span></div>
          <div class="wrk-mobile-card-row"><span>Days Present</span><span>${r.daysPresent}</span></div>
          <div class="wrk-mobile-card-row"><span>Advance</span><span>${formatBDT(r.advance)}</span></div>
          <div class="wrk-mobile-card-row"><span>Due</span><span class="wrk-sal-due">${formatBDT(r.due)}</span></div>
        </div>
        ${
          r.due > 0 && r.status !== "paid"
            ? `<div class="wrk-mobile-card-actions"><button type="button" class="btn btn-primary btn-sm wrk-pay-btn" data-id="${escapeHtml(r.worker.id)}">Pay</button></div>`
            : ""
        }
      </div>`
      )
      .join("");
    contentHost.appendChild(mobile);

    wrap.appendChild(section);

    const toolbar = section.querySelector("#wrk-sal-toolbar");
    toolbar.querySelector("#wrk-sal-month").onchange = (e) => {
      state.salaryMonth = e.target.value;
      renderKpiStrip();
      renderContent();
    };
    toolbar.querySelector("#wrk-advance-btn").onclick = () => openAdvanceModal();

    wrap.querySelectorAll(".wrk-sal-row").forEach((row) => {
      row.onclick = (e) => {
        if (e.target.closest(".wrk-icon-btn, .proj-row-actions-cell, .wrk-mobile-card-actions")) return;
        const worker = getWorker(row.dataset.workerId);
        if (worker && salaryRow(worker).due > 0) openPaySalaryModal(worker);
      };
    });
    wrap.querySelectorAll(".wrk-pay-btn").forEach((btn) => {
      btn.onclick = (e) => {
        e.stopPropagation();
        const worker = getWorker(btn.dataset.id);
        if (worker) openPaySalaryModal(worker);
      };
    });

    return wrap;
  }

  function renderProfileOverview(worker) {
    const wrap = document.createElement("div");
    wrap.className = "wrk-profile-panel";

    const detailsBody = document.createElement("dl");
    detailsBody.className = "wrk-info-grid";
    detailsBody.innerHTML = `
      <dt>Worker code</dt><dd>${escapeHtml(worker.workerCode || "?")}</dd>
      <dt>Phone</dt><dd>${worker.phone ? `<a href="tel:${escapeHtml(worker.phone)}">${escapeHtml(worker.phone)}</a>` : "?"}</dd>
      <dt>NID</dt><dd>${escapeHtml(worker.nid || "?")}</dd>
      <dt>Address</dt><dd>${escapeHtml(worker.address || "?")}</dd>
      <dt>Designation</dt><dd>${escapeHtml(designationLabel(worker.designation))}</dd>
      <dt>Employment</dt><dd>${escapeHtml(employmentTypeLabel(worker.employmentType))}</dd>
      <dt>Wage rate</dt><dd>${formatBDT(worker.wageRate ?? worker.dailyWage)}</dd>
      <dt>Site</dt><dd>${escapeHtml(projectName(worker.assignedProjectId))}</dd>
      <dt>Joining date</dt><dd>${escapeHtml(worker.joiningDate || "?")}</dd>
      <dt>Status</dt><dd>${renderWorkerStatusBadge(workerListStatus(worker))}</dd>
    `;

    const detailsCard = renderProfileCard({
      title: "Worker details",
      subtitle: "Personal and employment information",
      actionsHtml: `<button type="button" class="btn btn-ghost btn-sm" id="wrk-edit-worker-btn">Edit worker</button>`,
      bodyEl: detailsBody,
    });
    wrap.appendChild(detailsCard);

    wrap.appendChild(
      renderProfileCard({
        title: "Transfer history",
        subtitle: "Site assignment changes",
        actionsHtml: `<button type="button" class="btn btn-ghost btn-sm" id="wrk-transfer-btn">Transfer site</button>`,
        bodyEl: renderDataTable({
          columns: [
            { key: "date", label: "Date" },
            { key: "from", label: "From", render: (r) => escapeHtml(projectName(r.fromProjectId)) },
            { key: "to", label: "To", render: (r) => escapeHtml(projectName(r.toProjectId)) },
            { key: "note", label: "Note" },
          ],
          rows: state.transfers,
          emptyMessage: "No transfers recorded",
        }),
      })
    );

    wrap.querySelector("#wrk-edit-worker-btn")?.addEventListener("click", () => openWorkerDialog(worker));
    wrap.querySelector("#wrk-transfer-btn")?.addEventListener("click", () => {
      openEditDialog(
        "Site transfer",
        [
          {
            name: "toProjectId",
            label: "New site *",
            type: "select",
            required: true,
            options: state.projects.map((p) => ({ value: p.id, label: p.name })),
          },
          { name: "date", label: "Date", type: "date" },
          { name: "note", label: "Note", type: "textarea" },
        ],
        { toProjectId: worker.assignedProjectId || "", date: todayISO(), note: "" },
        async (vals) => {
          await recordSiteTransfer(worker.id, {
            fromProjectId: worker.assignedProjectId || "",
            toProjectId: vals.toProjectId,
            date: vals.date,
            note: vals.note,
          });
          showToast("Transfer recorded");
        }
      );
    });

    return wrap;
  }

  function attendanceStatusBadge(status) {
    if (!status) return "?";
    const labels = { present: "Present", absent: "Absent", half_day: "Half-day", leave: "Leave" };
    const cls = {
      present: "wrk-badge--success",
      absent: "wrk-badge--danger",
      half_day: "wrk-badge--warning",
      leave: "wrk-badge--inactive",
    };
    const badgeCls = cls[status] || "wrk-badge--neutral";
    return `<span class="wrk-badge ${badgeCls}">${escapeHtml(labels[status] || status)}</span>`;
  }

  function renderProfileAttendance(worker) {
    const wrap = document.createElement("div");
    wrap.className = "wrk-profile-panel";

    const monthCard = renderProfileCard({
      title: "Attendance period",
      subtitle: "Select month to view records",
      actionsHtml: renderMonthPicker("wrk-prof-att-month", state.profileMonth),
    });
    wrap.appendChild(monthCard);

    const summary = summarizeAttendance(
      state.attendance.filter((r) => r.workerId === worker.id && r.date?.startsWith(state.profileMonth)),
      state.profileMonth
    );
    wrap.appendChild(
      renderProfileCard({
        title: "Summary",
        subtitle: "Monthly totals",
        bodyEl: renderWorkerStatCards([
          { label: "Present", value: summary.present, icon: "check", iconCls: "mod-stat-icon--green", valueCls: "mod-stat-value--green" },
          { label: "Absent", value: summary.absent, icon: "x", iconCls: "mod-stat-icon--red", valueCls: summary.absent ? "mod-stat-value--red" : "" },
          { label: "Leave", value: summary.leave, icon: "clock", iconCls: "mod-stat-icon--amber", valueCls: summary.leave ? "mod-stat-value--amber" : "" },
          { label: "OT hours", value: summary.overtime.toFixed(1), icon: "activity", iconCls: "mod-stat-icon--blue" },
        ]),
      })
    );

    const days = monthDays(state.profileMonth);
    const rows = days.map((date) => {
      const rec = attendanceRecord(worker.id, date);
      return { date, status: rec?.status || "", overtimeHours: rec?.overtimeHours || 0, projectId: rec?.projectId };
    });

    wrap.appendChild(
      renderProfileCard({
        title: "Daily log",
        subtitle: "Day-by-day attendance",
        bodyEl: renderDataTable({
          columns: [
            { key: "date", label: "Date" },
            { key: "status", label: "Status", render: (r) => attendanceStatusBadge(r.status) },
            { key: "overtimeHours", label: "OT (hrs)" },
            { key: "projectId", label: "Site", render: (r) => escapeHtml(projectName(r.projectId)) },
          ],
          rows,
          emptyMessage: "No attendance for this month",
        }),
      })
    );

    monthCard.querySelector("#wrk-prof-att-month").onchange = (e) => {
      state.profileMonth = e.target.value;
      renderProfileOverlay();
    };

    return wrap;
  }

  function renderProfileSalary(worker) {
    const wrap = document.createElement("div");
    wrap.className = "wrk-profile-panel";

    const monthKey = state.profileMonth;
    const row = salaryRow(worker, monthKey);
    const status = salaryStatus(worker.id, monthKey);

    const summaryBody = document.createElement("div");
    summaryBody.appendChild(
      renderWorkerStatCards([
        { label: "Days present", value: row.daysPresent, icon: "check", iconCls: "mod-stat-icon--green", valueCls: "mod-stat-value--green" },
        { label: "Gross", value: formatBDT(row.gross), icon: "banknote", iconCls: "mod-stat-icon--blue" },
        { label: "Advance", value: formatBDT(row.advance), icon: "wallet", iconCls: "mod-stat-icon--amber" },
        {
          label: "Due",
          value: formatBDT(row.due),
          icon: "alertTriangle",
          iconCls: "mod-stat-icon--red",
          valueCls: row.due > 0 ? "mod-stat-value--red" : "",
        },
      ])
    );
    const statusRow = document.createElement("div");
    statusRow.className = "wrk-sal-status-row";
    statusRow.innerHTML = `<span>Status</span><span>${salaryStatusIcon(status)}</span>`;
    summaryBody.appendChild(statusRow);

    const monthCard = renderProfileCard({
      title: "This month",
      subtitle: "Salary breakdown",
      actionsHtml: renderMonthPicker("wrk-prof-sal-month", monthKey),
      bodyEl: summaryBody,
    });
    wrap.appendChild(monthCard);

    wrap.appendChild(
      renderProfileCard({
        title: "Payment history",
        subtitle: "Recorded salary payments",
        bodyEl: renderDataTable({
          columns: [
            { key: "monthKey", label: "Month" },
            { key: "date", label: "Paid on" },
            { key: "amount", label: "Amount", render: (r) => formatBDT(r.amount) },
            { key: "status", label: "Status", render: () => `<span class="wrk-badge wrk-badge--success">Paid</span>` },
            { key: "note", label: "Note" },
          ],
          rows: state.salaryPayments.filter((p) => p.workerId === worker.id).sort((a, b) => (b.date || "").localeCompare(a.date || "")),
          emptyMessage: "No salary payments yet",
        }),
      })
    );

    monthCard.querySelector("#wrk-prof-sal-month").onchange = (e) => {
      state.profileMonth = e.target.value;
      renderProfileOverlay();
    };

    return wrap;
  }

  function renderProfileItems(worker) {
    const wrap = document.createElement("div");
    wrap.className = "wrk-profile-panel";

    const filters = document.createElement("div");
    filters.className = "wrk-profile-filters";
    filters.innerHTML = `
      <select class="toolbar-select" id="wrk-prof-items-return">
        <option value="all">Return status: All</option>
        <option value="not_returned" ${state.profileItemsReturn === "not_returned" ? "selected" : ""}>Not Returned</option>
        <option value="returned" ${state.profileItemsReturn === "returned" ? "selected" : ""}>Returned</option>
        <option value="damaged" ${state.profileItemsReturn === "damaged" ? "selected" : ""}>Damaged</option>
      </select>
      <label class="wrk-check-label"><input type="checkbox" id="wrk-prof-items-pending" ${state.profileItemsPendingOnly ? "checked" : ""} /> Pending returns only</label>
    `;

    wrap.appendChild(
      renderProfileCard({
        title: "Filters",
        subtitle: "Narrow issued items",
        bodyEl: filters,
      })
    );

    const items = state.stockOut
      .filter((r) => r.workerId === worker.id)
      .filter((r) => {
        const itemStatus = r.returnExpected ? r.returnStatus || "not_returned" : "returned";
        if (state.profileItemsPendingOnly && itemStatus !== "not_returned") return false;
        if (state.profileItemsReturn !== "all" && itemStatus !== state.profileItemsReturn) return false;
        return true;
      })
      .sort((a, b) => (b.issueDate || "").localeCompare(a.issueDate || ""));

    wrap.appendChild(
      renderProfileCard({
        title: "Issued items",
        subtitle: `${items.length} record(s)`,
        bodyEl: renderDataTable({
          columns: [
            { key: "materialName", label: "Item / Material" },
            { key: "quantity", label: "Quantity" },
            { key: "issueDate", label: "Issued date" },
            { key: "projectId", label: "Site", render: (r) => escapeHtml(projectName(r.projectId)) },
            {
              key: "returnStatus",
              label: "Return status",
              render: (r) => renderReturnStatusBadge(r.returnExpected ? r.returnStatus || "not_returned" : "returned"),
            },
          ],
          rows: items,
          emptyMessage: "No items issued to this worker",
        }),
      })
    );

    filters.querySelector("#wrk-prof-items-return").onchange = (e) => {
      state.profileItemsReturn = e.target.value;
      renderProfileOverlay();
    };
    filters.querySelector("#wrk-prof-items-pending").onchange = (e) => {
      state.profileItemsPendingOnly = e.target.checked;
      if (state.profileItemsPendingOnly) state.profileItemsReturn = "not_returned";
      renderProfileOverlay();
    };

    return wrap;
  }

  function renderProfileDocuments(worker) {
    const wrap = document.createElement("div");
    wrap.className = "wrk-profile-panel";

    const form = document.createElement("form");
    form.className = "form-grid proj-form-inline wrk-doc-form";
    form.innerHTML = `
      <input name="title" placeholder="Document title *" required />
      <select name="docType">
        <option value="nid">NID</option>
        <option value="contract">Contract</option>
        <option value="certificate">Certificate</option>
        <option value="other">Other</option>
      </select>
      <input name="url" placeholder="File URL" />
      <button type="submit" class="btn btn-primary btn-sm">Add document</button>
    `;
    form.onsubmit = async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      try {
        await createWorkerDocument(worker.id, {
          title: fd.get("title"),
          docType: fd.get("docType"),
          url: fd.get("url"),
        });
        form.reset();
        showToast("Document added");
      } catch (err) {
        showToast(err.message, "error");
      }
    };

    wrap.appendChild(
      renderProfileCard({
        title: "Add document",
        subtitle: "Upload link or reference",
        bodyEl: form,
      })
    );

    const list = document.createElement("div");
    list.className = "proj-doc-list";
    if (!state.documents.length) {
      list.innerHTML = `<p class="proj-empty">No documents yet</p>`;
    } else {
      list.innerHTML = state.documents
        .map(
          (d) => `<div class="proj-doc-row">
          <div class="proj-doc-main">
            <strong>${escapeHtml(d.title)}</strong>
            <span class="text-muted">${escapeHtml(d.docType || "other")}</span>
            ${d.url ? `<a href="${escapeHtml(d.url)}" target="_blank" rel="noopener">Open</a>` : ""}
          </div>
        </div>`
        )
        .join("");
    }

    wrap.appendChild(
      renderProfileCard({
        title: "Documents",
        subtitle: `${state.documents.length} on file`,
        bodyEl: list,
      })
    );

    return wrap;
  }

  function renderProfileOverlay() {
    root.querySelector(".wrk-profile-overlay")?.remove();
    const worker = getWorker(state.selectedWorkerId);
    if (!worker) return;

    const overlay = document.createElement("div");
    overlay.className = "wrk-profile-overlay";
    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) closeProfile();
    });

    const drawer = document.createElement("div");
    drawer.className = "wrk-profile-drawer";
    drawer.addEventListener("click", (e) => e.stopPropagation());

    drawer.appendChild(
      renderWorkerDetailHeader(worker, projectName(worker.assignedProjectId), closeProfile, workerListStatus(worker))
    );
    const tabBar = renderWorkerTabBar(WORKER_PROFILE_TABS, state.profileTab, (tab) => {
      state.profileTab = tab;
      renderProfileOverlay();
    });
    tabBar.classList.add("wrk-profile-tabs");
    drawer.appendChild(tabBar);

    const panel = document.createElement("div");
    panel.className = "wrk-profile-wrap";
    if (state.profileTab === "overview") panel.appendChild(renderProfileOverview(worker));
    else if (state.profileTab === "attendance") panel.appendChild(renderProfileAttendance(worker));
    else if (state.profileTab === "salary") panel.appendChild(renderProfileSalary(worker));
    else if (state.profileTab === "items") panel.appendChild(renderProfileItems(worker));
    else if (state.profileTab === "documents") panel.appendChild(renderProfileDocuments(worker));
    panel.scrollTop = 0;
    drawer.appendChild(panel);

    overlay.appendChild(drawer);
    root.appendChild(overlay);
  }

  function renderContent() {
    if (!contentHost) return;
    contentHost.innerHTML = "";

    if (state.activeTab === "list") contentHost.appendChild(renderListTab());
    else if (state.activeTab === "attendance") contentHost.appendChild(renderAttendanceTab());
    else if (state.activeTab === "salary") contentHost.appendChild(renderSalaryTab());
    else if (state.activeTab === "reports") contentHost.appendChild(renderReportsTab());
    else {
      state.activeTab = "list";
      contentHost.appendChild(renderListTab());
    }
  }

  function renderTabs() {
    if (!tabHost) return;
    tabHost.innerHTML = "";
    tabHost.appendChild(
      renderWorkerTabBar(
        WORKER_TABS,
        state.activeTab,
        (tab) => {
          state.activeTab = tab;
          renderKpiStrip();
          renderContent();
        },
        { variant: "hr-main" }
      )
    );
  }

  function render() {
    renderKpiStrip();
    renderTabs();
    renderContent();
    renderProfileOverlay();
  }

  function ensureLayout() {
    root.innerHTML = `
      <div id="wrk-metrics" class="wrk-kpi-host"></div>
      <div class="wrk-tab-host"></div>
      <div class="wrk-content-host"></div>
    `;
    kpiHost = root.querySelector("#wrk-metrics");
    tabHost = root.querySelector(".wrk-tab-host");
    contentHost = root.querySelector(".wrk-content-host");
  }

  ensureLayout();
  render();

  const unsubWorkers = listenList("workers", (list) => {
    state.workers = list;
    render();
  });
  const unsubProjects = listenList("projects", (list) => {
    state.projects = list;
    render();
  });
  const unsubAttendance = listenList("workerAttendance", (list) => {
    state.attendance = list;
    renderKpiStrip();
    if (["attendance", "salary"].includes(state.activeTab) || state.selectedWorkerId) {
      renderContent();
      renderProfileOverlay();
    }
  });
  const unsubAdvances = listenList("workerAdvances", (list) => {
    state.advances = list;
    renderKpiStrip();
    if (state.activeTab === "salary" || (state.selectedWorkerId && state.profileTab === "salary")) {
      renderContent();
      renderProfileOverlay();
    }
  });
  const unsubSalary = listenList("workerSalaryPayments", (list) => {
    state.salaryPayments = list;
    renderKpiStrip();
    if (["salary", "reports"].includes(state.activeTab) || (state.selectedWorkerId && state.profileTab === "salary")) {
      renderContent();
      renderProfileOverlay();
    }
  });
  const unsubCalcs = listenList("workerSalaryCalculations", (list) => {
    state.salaryCalculations = list;
    if (state.activeTab === "reports") renderContent();
  });
  const unsubSic = listenList("siteInCharges", (list) => {
    state.siteInCharges = list;
    if (state.activeTab === "reports") renderContent();
  });
  const unsubStockOut = listenList("inventoryStockOut", (list) => {
    state.stockOut = list;
    if (state.selectedWorkerId && state.profileTab === "items") renderProfileOverlay();
  });

  return {
    unmount: () => {
      unsubWorkers();
      unsubProjects();
      unsubAttendance();
      unsubAdvances();
      unsubSalary();
      unsubCalcs();
      unsubSic();
      unsubStockOut();
      unsubTransfers();
      unsubDocuments();
      root.querySelector(".wrk-profile-overlay")?.remove();
    },
  };
}
