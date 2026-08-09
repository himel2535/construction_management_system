/** Site diary CRUD and progress feed on approval */

import { create, updatePath, readRef } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { todayISO } from "./util_format.js";
import { diaryToProgressDraft, SITE_DIARY_PATHS } from "./util_siteDiary.js";
import { upsertApprovalQueue, clearApprovalQueue } from "./svc_governance.js";

export async function createSiteDiary(projectId, data) {
  return create(`${SITE_DIARY_PATHS.diaries}/${projectId}`, {
    logDate: data.logDate || todayISO(),
    workSummary: data.workSummary || "",
    photos: data.photos || [],
    laborCount: Number(data.laborCount) || 0,
    weather: data.weather || "",
    siteInChargeId: data.siteInChargeId || "",
    status: data.status || "draft",
    createdBy: getCurrentUserId(),
  });
}

export async function updateSiteDiary(projectId, diaryId, patch) {
  const cur = readRef(`${SITE_DIARY_PATHS.diaries}/${projectId}/${diaryId}`) || {};
  await updatePath(`${SITE_DIARY_PATHS.diaries}/${projectId}/${diaryId}`, {
    ...cur,
    ...patch,
    updatedAt: Date.now(),
  });
}

export async function submitSiteDiary(projectId, diaryId) {
  const cur = readRef(`${SITE_DIARY_PATHS.diaries}/${projectId}/${diaryId}`) || {};
  const now = Date.now();
  await updatePath(`${SITE_DIARY_PATHS.diaries}/${projectId}/${diaryId}`, {
    ...cur,
    status: "submitted",
    submittedAt: new Date(now).toISOString(),
  });
  await upsertApprovalQueue({
    entityType: "site_diary",
    entityId: diaryId,
    projectId,
    title: `Site Diary - ${cur.logDate || todayISO()}`,
    path: `${SITE_DIARY_PATHS.diaries}/${projectId}/${diaryId}`,
    submittedAt: now,
  });
}

export async function approveSiteDiary(projectId, diaryId) {
  const cur = readRef(`${SITE_DIARY_PATHS.diaries}/${projectId}/${diaryId}`) || {};
  const progressEntryId = await create(`projectProgress/${projectId}`, {
    ...diaryToProgressDraft({ ...cur, id: diaryId }),
    createdBy: getCurrentUserId(),
  });
  await updatePath(`${SITE_DIARY_PATHS.diaries}/${projectId}/${diaryId}`, {
    ...cur,
    status: "approved",
    progressEntryId,
    approvedAt: new Date().toISOString(),
    approvedBy: getCurrentUserId(),
  });
  await clearApprovalQueue("site_diary", diaryId);
  await syncFieldProgressHint(projectId, cur.logDate);
  return progressEntryId;
}

export async function syncFieldProgressHint(projectId, logDate) {
  const proj = readRef(`projects/${projectId}`) || {};
  await updatePath(`projects/${projectId}`, {
    ...proj,
    lastFieldReportDate: logDate || todayISO(),
  });
}
