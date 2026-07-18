import { readRef, updatePath } from "./svc_data.js";
import { writeAuditLog } from "./svc_workflow.js";
import {
  DETAIL_PATHS,
  splitProjectPayload,
  mergeProjectWithDetails,
  pickInlineDetailFields,
  normalizeProjectType,
  govDetailPath,
  privateDetailPath,
  hasInlineDetailFields,
} from "./util_projectDetails.js";

export function readGovDetail(projectId) {
  if (!projectId) return null;
  return readRef(govDetailPath(projectId)) || null;
}

export function readPrivateDetail(projectId) {
  if (!projectId) return null;
  return readRef(privateDetailPath(projectId)) || null;
}

export async function saveGovDetail(projectId, data, { audit = true } = {}) {
  if (!projectId) throw new Error("Project id required");
  const now = Date.now();
  const existing = readGovDetail(projectId) || {};
  await updatePath(govDetailPath(projectId), {
    ...existing,
    ...data,
    projectId,
    updatedAt: now,
  });
  if (audit) {
    await writeAuditLog({
      entityType: "governmentProjectDetail",
      entityId: projectId,
      action: "update",
      diffSummary: "Updated government project details",
    });
  }
}

export async function savePrivateDetail(projectId, data, { audit = true } = {}) {
  if (!projectId) throw new Error("Project id required");
  const now = Date.now();
  const existing = readPrivateDetail(projectId) || {};
  await updatePath(privateDetailPath(projectId), {
    ...existing,
    ...data,
    projectId,
    updatedAt: now,
  });
  if (audit) {
    await writeAuditLog({
      entityType: "privateProjectDetail",
      entityId: projectId,
      action: "update",
      diffSummary: "Updated private project details",
    });
  }
}

/**
 * Merge base project with linked detail doc(s). Detail doc wins over inline legacy fields.
 * @param {object} project
 * @returns {object}
 */
export function enrichProject(project) {
  if (!project?.id) return project;
  const { type } = normalizeProjectType(project);
  const govDetail = type === "government" ? readGovDetail(project.id) : null;
  const privateDetail = type === "private" ? readPrivateDetail(project.id) : null;
  return mergeProjectWithDetails(project, govDetail, privateDetail);
}

/**
 * @param {object[]} list
 * @returns {object[]}
 */
export function enrichProjectList(list = []) {
  return (list || []).map((p) => enrichProject(p));
}

/**
 * Copy legacy inline fields into detail collection if detail doc is missing.
 * @param {string} projectId
 * @returns {Promise<boolean>} true if migration ran
 */
export async function migrateInlineDetailsIfNeeded(projectId) {
  const project = readRef(`projects/${projectId}`);
  if (!project) return false;

  const { type } = normalizeProjectType(project);
  const inline = pickInlineDetailFields(project);

  if (type === "government") {
    const existing = readGovDetail(projectId);
    if (existing && Object.keys(existing).length > 1) return false;
    if (!inline.gov || !Object.keys(inline.gov).length) return false;
    await saveGovDetail(projectId, inline.gov, { audit: false });
    return true;
  }

  const existing = readPrivateDetail(projectId);
  if (existing && Object.keys(existing).length > 1) return false;
  if (!inline.private || !Object.keys(inline.private).length) return false;
  await savePrivateDetail(projectId, inline.private, { audit: false });
  return true;
}

/**
 * Split payload, write base project + type-specific detail collection.
 * @param {string} projectId
 * @param {object} fullPayload
 * @param {{ existing?: object, stripInline?: boolean }} [opts]
 */
export async function saveProjectWithDetails(projectId, fullPayload, opts = {}) {
  const { existing = {}, stripInline = true } = opts;
  const { base, govDetail, privateDetail } = splitProjectPayload({
    ...existing,
    ...fullPayload,
    id: projectId,
  });
  const now = Date.now();

  const projectWrite = {
    ...existing,
    ...base,
    id: projectId,
    updatedAt: now,
  };

  if (stripInline) {
    const { gov, private: priv } = pickInlineDetailFields(projectWrite);
    const detailKeys = new Set([
      ...Object.keys(gov || {}),
      ...Object.keys(priv || {}),
    ]);
    for (const key of detailKeys) {
      delete projectWrite[key];
    }
  }

  await updatePath(`projects/${projectId}`, projectWrite);

  const { type } = normalizeProjectType(projectWrite);
  if (type === "government" && govDetail) {
    await saveGovDetail(projectId, govDetail, { audit: false });
  } else if (type === "private" && privateDetail) {
    await savePrivateDetail(projectId, privateDetail, { audit: false });
  }

  return enrichProject({ ...projectWrite, id: projectId });
}

export { DETAIL_PATHS, hasInlineDetailFields, splitProjectPayload, mergeProjectWithDetails };
