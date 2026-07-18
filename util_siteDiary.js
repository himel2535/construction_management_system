/** Site diary — paths, weather, labor rollup, progress mapping */

export const SITE_DIARY_PATHS = { diaries: "siteDiaries" };

export const WEATHER_OPTIONS = ["Sunny", "Cloudy", "Overcast", "Rain", "Storm", "Fog"];

export const DIARY_STATUSES = ["draft", "submitted", "approved"];

export function diaryStatusLabel(status) {
  return { draft: "Draft", submitted: "Submitted", approved: "Approved" }[status] || status || "—";
}

/** Count present workers for a project date from attendance records. */
export function laborCountForDate(projectId, date, { roster = [], attendance = [] } = {}) {
  if (!projectId || !date) return 0;
  const rosterIds = new Set(
    roster.filter((r) => r.status === "active" && r.workerId).map((r) => r.workerId)
  );
  let count = 0;
  for (const row of attendance || []) {
    if (row.projectId !== projectId || row.date !== date) continue;
    if (row.status !== "present" && row.status !== "half_day") continue;
    if (rosterIds.size && row.workerId && !rosterIds.has(row.workerId)) continue;
    count += row.status === "half_day" ? 0.5 : 1;
  }
  return Math.round(count);
}

/** Map approved diary to a projectProgress draft row. */
export function diaryToProgressDraft(diary) {
  const summary = String(diary.workSummary || "").trim();
  const snippet = summary.length > 80 ? `${summary.slice(0, 77)}...` : summary;
  const weather = diary.weather || "";
  const labor = diary.laborCount ?? "";
  const remarks = [
    weather && `Weather: ${weather}`,
    labor !== "" && labor != null && `Labor: ${labor}`,
  ]
    .filter(Boolean)
    .join(" · ");
  return {
    activity: snippet || "Site diary report",
    remarks,
    progressDate: diary.logDate || "",
    executedQty: 1,
    plannedQty: 1,
    refType: "siteDiary",
    refId: diary.id || "",
    boqId: "",
  };
}
