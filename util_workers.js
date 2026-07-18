/** Workers module helpers */

export const WORKER_DESIGNATIONS = [
  { id: "mason", label: "Mason" },
  { id: "electrician", label: "Electrician" },
  { id: "plumber", label: "Plumber" },
  { id: "carpenter", label: "Carpenter" },
  { id: "helper", label: "Helper" },
  { id: "supervisor", label: "Supervisor" },
  { id: "site_engineer", label: "Site Engineer" },
];

export const EMPLOYMENT_TYPES = [
  { id: "daily", label: "Daily Wage" },
  { id: "monthly", label: "Monthly" },
  { id: "contract", label: "Contract" },
];

export const ATTENDANCE_STATUSES = [
  { id: "present", label: "Present" },
  { id: "absent", label: "Absent" },
  { id: "half_day", label: "Half-day" },
  { id: "leave", label: "Leave" },
];

export function designationLabel(id) {
  return WORKER_DESIGNATIONS.find((d) => d.id === id)?.label || id || "—";
}

export function employmentTypeLabel(id) {
  return EMPLOYMENT_TYPES.find((t) => t.id === id)?.label || id || "—";
}

export function workerInitials(name) {
  const parts = String(name || "")
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (!parts.length) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

const AVATAR_TONES = ["blue", "purple", "pink", "green", "amber"];

/** @returns {"blue"|"purple"|"pink"|"green"|"amber"} */
export function workerAvatarTone(name) {
  const s = String(name || "").trim();
  if (!s) return AVATAR_TONES[0];
  let hash = 0;
  for (let i = 0; i < s.length; i++) hash = (hash + s.charCodeAt(i) * (i + 1)) % AVATAR_TONES.length;
  return AVATAR_TONES[hash];
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

export function paginateSlice(list, page, pageSize = 10) {
  const total = list.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), totalPages);
  const start = (safePage - 1) * pageSize;
  return { items: list.slice(start, start + pageSize), total, totalPages, page: safePage };
}

export function monthDays(monthKey) {
  const [y, m] = monthKey.split("-").map(Number);
  const n = new Date(y, m, 0).getDate();
  const days = [];
  for (let d = 1; d <= n; d++) days.push(`${monthKey}-${String(d).padStart(2, "0")}`);
  return days;
}

export function attendanceDayWeight(status) {
  if (status === "present") return 1;
  if (status === "half_day") return 0.5;
  return 0;
}

export function summarizeAttendance(records, monthKey) {
  let present = 0;
  let absent = 0;
  let leave = 0;
  let overtime = 0;
  for (const r of records || []) {
    if (!r.date?.startsWith(monthKey)) continue;
    if (r.status === "present") present++;
    else if (r.status === "absent") absent++;
    else if (r.status === "leave") leave++;
    else if (r.status === "half_day") present += 0.5;
    overtime += Number(r.overtimeHours) || 0;
  }
  return { present, absent, leave, overtime };
}

export function computeSalaryDue({ wageRate, employmentType, daysPresent, advanceTaken = 0, overtimeHours = 0 }) {
  const rate = Number(wageRate) || 0;
  const days = Number(daysPresent) || 0;
  const advance = Number(advanceTaken) || 0;
  const ot = Number(overtimeHours) || 0;
  const gross =
    employmentType === "monthly" ? rate : days * rate + ot * rate * 1.5;
  return Math.max(0, gross - advance);
}

export function filterWorkers(list, { query = "", designation = "all", projectId = "all", status = "all" } = {}) {
  let out = [...(list || [])];
  if (status !== "all") out = out.filter((w) => (w.status || "active") === status);
  if (designation !== "all") out = out.filter((w) => w.designation === designation);
  if (projectId !== "all") out = out.filter((w) => w.assignedProjectId === projectId);
  const q = query.trim().toLowerCase();
  if (q) {
    out = out.filter(
      (w) =>
        String(w.name || "").toLowerCase().includes(q) ||
        String(w.workerCode || "").toLowerCase().includes(q) ||
        String(w.phone || "").includes(q)
    );
  }
  return out.sort((a, b) => String(a.name).localeCompare(String(b.name)));
}

export function advancesForWorkerMonth(advances, workerId, monthKey) {
  return (advances || [])
    .filter((a) => a.workerId === workerId && (a.date || "").startsWith(monthKey))
    .reduce((s, a) => s + (Number(a.amount) || 0), 0);
}

export function presentDaysForWorkerMonth(attendance, workerId, monthKey, projectId = "all") {
  let total = 0;
  for (const r of attendance || []) {
    if (r.workerId !== workerId || !r.date?.startsWith(monthKey)) continue;
    if (projectId !== "all" && r.projectId !== projectId) continue;
    total += attendanceDayWeight(r.status);
  }
  return total;
}

export function countTotalWorkers(workers) {
  return (workers || []).length;
}

export function countPresentToday(attendance, dateISO) {
  return (attendance || []).filter((r) => r.date === dateISO && r.status === "present").length;
}

export function countOnLeaveToday(attendance, dateISO) {
  return (attendance || []).filter((r) => r.date === dateISO && r.status === "leave").length;
}

export function attendanceForWorkerDay(attendance, workerId, dateISO) {
  return (attendance || []).find((r) => r.workerId === workerId && r.date === dateISO);
}

/** @returns {"active"|"on_leave"|"inactive"} */
export function resolveWorkerListStatus(worker, attendance, dateISO) {
  if ((worker?.status || "active") === "inactive") return "inactive";
  const rec = attendanceForWorkerDay(attendance, worker?.id, dateISO);
  if (rec?.status === "leave") return "on_leave";
  return "active";
}
