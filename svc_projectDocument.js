import { create, updatePath } from "./svc_data.js";
import { readRef } from "./svc_tenant.js";
import { getCurrentUserId } from "./svc_auth.js";
import { writeAuditLog } from "./svc_workflow.js";
import { applyEntityWorkflowTransition, guardAction } from "./svc_governance.js";
import {
  normalizeDocumentType,
  requiresExpiry,
  documentVersion,
  expiryAlertLevel,
} from "./util_projectDocument.js";

export const DOCUMENT_PATH = "projectDocuments";

export function documentStoragePath(projectId, documentId) {
  return `${DOCUMENT_PATH}/${projectId}/${documentId}`;
}

export async function createProjectDocument({
  projectId,
  title,
  type,
  fileUrl = "",
  expiryDate = "",
  revisionLabel = "Rev 1",
}) {
  if (!projectId) throw new Error("Project required");
  const docType = normalizeDocumentType(type);
  if (requiresExpiry(docType) && !expiryDate) {
    throw new Error("Expiry date required for Permit/License documents");
  }
  const now = Date.now();
  const id = await create(`${DOCUMENT_PATH}/${projectId}`, {
    projectId,
    title: String(title).trim(),
    type: docType,
    docType: docType.toLowerCase(),
    version: 1,
    revision: revisionLabel || "Rev 1",
    fileUrl: fileUrl || "",
    expiryDate: expiryDate || "",
    revisionHistory: [],
    status: "draft",
    submittedBy: "",
    submittedAt: null,
    approvedBy: "",
    approvedAt: null,
    createdAt: now,
    updatedAt: now,
    createdBy: getCurrentUserId(),
  });
  await writeAuditLog({
    entityType: "document",
    entityId: id,
    action: "create",
    diffSummary: `Document ${title} (${docType} v1)`,
    projectId,
  });
  return id;
}

export async function uploadDocumentRevision(projectId, documentId, { fileUrl, revisionLabel = "" }) {
  const path = documentStoragePath(projectId, documentId);
  const cur = readRef(path) || {};
  const ver = documentVersion(cur);
  const history = Array.isArray(cur.revisionHistory) ? [...cur.revisionHistory] : [];
  if (cur.fileUrl || ver > 0) {
    history.push({
      version: ver,
      fileUrl: cur.fileUrl || "",
      revisionLabel: cur.revision || `Rev ${ver}`,
      uploadedAt: cur.updatedAt || Date.now(),
      uploadedBy: cur.updatedBy || cur.createdBy || getCurrentUserId(),
    });
  }
  const nextVer = ver + 1;
  const label = revisionLabel || `Rev ${nextVer}`;
  const now = Date.now();
  await updatePath(path, {
    ...cur,
    version: nextVer,
    revision: label,
    fileUrl: fileUrl || cur.fileUrl || "",
    revisionHistory: history,
    status: "draft",
    submittedBy: "",
    submittedAt: null,
    approvedBy: "",
    approvedAt: null,
    updatedAt: now,
    updatedBy: getCurrentUserId(),
  });
  await writeAuditLog({
    entityType: "document",
    entityId: documentId,
    action: "revision",
    diffSummary: `${cur.title || documentId}: uploaded ${label}`,
    projectId,
  });
  return nextVer;
}

export async function submitDocumentForApproval(projectId, documentId) {
  guardAction("submit_document");
  const path = documentStoragePath(projectId, documentId);
  const cur = readRef(path) || {};
  await applyEntityWorkflowTransition({
    path,
    entityType: "document",
    entityId: documentId,
    projectId,
    title: cur.title || documentId,
    to: "submitted",
  });
}

export async function applyDocumentWorkflowTransition(projectId, documentId, to) {
  if (to === "submitted") {
    return submitDocumentForApproval(projectId, documentId);
  }
  const path = documentStoragePath(projectId, documentId);
  const cur = readRef(path) || {};
  if (to === "approved" || to === "rejected") guardAction("approve_document");
  await applyEntityWorkflowTransition({
    path,
    entityType: "document",
    entityId: documentId,
    projectId,
    title: cur.title || documentId,
    to,
  });
}

/**
 * Documents with permit/license expiry alerts for a project.
 * @param {object[]} documents
 */
export function listDocumentExpiryAlerts(documents) {
  return (documents || [])
    .filter((d) => requiresExpiry(normalizeDocumentType(d.type || d.docType)))
    .map((d) => ({
      doc: d,
      level: expiryAlertLevel(d.expiryDate),
    }))
    .filter((x) => x.level === "warn" || x.level === "critical");
}
