/** Section 3 — project base + linked gov/private detail collections */

import { GOV_CONTRACT_FIELD_NAMES } from "./util_projectForm.js";

export const DETAIL_PATHS = {
  government: "governmentProjectDetails",
  private: "privateProjectDetails",
};

export const PRIVATE_DETAIL_FIELD_NAMES = [
  "contractValue",
  "budgetTotal",
  "contractDate",
  "clientContractRef",
  "paymentTerms",
];

/** Shared fields kept on base `projects` document only */
export const BASE_PROJECT_FIELDS = new Set([
  "id",
  "name",
  "code",
  "location",
  "clientName",
  "clientId",
  "startDate",
  "endDate",
  "status",
  "projectManagerId",
  "description",
  "progressPercent",
  "budgetTotal",
  "type",
  "projectType",
  "tenantId",
  "source",
  "createdAt",
  "updatedAt",
  "createdBy",
]);

const ALL_DETAIL_FIELDS = new Set([
  ...GOV_CONTRACT_FIELD_NAMES,
  ...PRIVATE_DETAIL_FIELD_NAMES,
]);

/**
 * @param {object} [project]
 * @returns {{ type: 'government'|'private', projectType: 'government_civil'|'private_civil' }}
 */
export function normalizeProjectType(project = {}) {
  const rawType = project.type;
  const rawProjectType = project.projectType;

  if (rawType === "government" || rawProjectType === "government_civil") {
    return { type: "government", projectType: "government_civil" };
  }
  return { type: "private", projectType: "private_civil" };
}

/**
 * @param {object} project
 * @returns {object}
 */
export function pickInlineGovFields(project = {}) {
  const out = {};
  for (const key of GOV_CONTRACT_FIELD_NAMES) {
    if (project[key] !== undefined && project[key] !== "") out[key] = project[key];
  }
  return out;
}

/**
 * @param {object} project
 * @returns {object}
 */
export function pickInlinePrivateFields(project = {}) {
  const out = {};
  for (const key of PRIVATE_DETAIL_FIELD_NAMES) {
    if (project[key] !== undefined && project[key] !== "") out[key] = project[key];
  }
  return out;
}

/**
 * @param {object} project
 * @returns {{ gov?: object, private?: object }}
 */
export function pickInlineDetailFields(project = {}) {
  const { type } = normalizeProjectType(project);
  if (type === "government") {
    const gov = pickInlineGovFields(project);
    return Object.keys(gov).length ? { gov } : {};
  }
  const priv = pickInlinePrivateFields(project);
  return Object.keys(priv).length ? { private: priv } : {};
}

/**
 * @param {object} fullPayload
 * @returns {{ base: object, govDetail?: object, privateDetail?: object }}
 */
export function splitProjectPayload(fullPayload = {}) {
  const { type, projectType } = normalizeProjectType(fullPayload);
  const base = {};
  const govDetail = {};
  const privateDetail = {};

  for (const [key, val] of Object.entries(fullPayload)) {
    if (type === "government" && GOV_CONTRACT_FIELD_NAMES.includes(key)) {
      govDetail[key] = val;
    } else if (type === "private" && PRIVATE_DETAIL_FIELD_NAMES.includes(key)) {
      privateDetail[key] = val;
    } else if (BASE_PROJECT_FIELDS.has(key) || !ALL_DETAIL_FIELDS.has(key)) {
      base[key] = val;
    }
  }

  base.type = type;
  base.projectType = projectType;

  for (const key of [...GOV_CONTRACT_FIELD_NAMES, ...PRIVATE_DETAIL_FIELD_NAMES]) {
    delete base[key];
  }

  const result = { base };
  if (type === "government" && Object.keys(govDetail).length) {
    result.govDetail = govDetail;
    if (govDetail.contractValue != null) {
      base.budgetTotal = Number(govDetail.contractValue) || 0;
    }
  } else if (type === "private" && Object.keys(privateDetail).length) {
    result.privateDetail = privateDetail;
    const cv = Number(privateDetail.contractValue) || Number(privateDetail.budgetTotal) || 0;
    if (cv) base.budgetTotal = cv;
  }
  return result;
}

/**
 * @param {object} project
 * @param {object} [govDetail]
 * @param {object} [privateDetail]
 * @returns {object}
 */
export function mergeProjectWithDetails(project = {}, govDetail = null, privateDetail = null) {
  const { type, projectType } = normalizeProjectType(project);
  const base = { ...project, type, projectType };

  for (const key of ALL_DETAIL_FIELDS) {
    delete base[key];
  }

  if (type === "government") {
    const inline = pickInlineGovFields(project);
    return { ...base, ...inline, ...(govDetail || {}) };
  }

  const inline = pickInlinePrivateFields(project);
  return { ...base, ...inline, ...(privateDetail || {}) };
}

export function govDetailPath(projectId) {
  return `${DETAIL_PATHS.government}/${projectId}`;
}

export function privateDetailPath(projectId) {
  return `${DETAIL_PATHS.private}/${projectId}`;
}

export function hasInlineDetailFields(project = {}) {
  const { gov, private: priv } = pickInlineDetailFields(project);
  return !!(gov && Object.keys(gov).length) || !!(priv && Object.keys(priv).length);
}
