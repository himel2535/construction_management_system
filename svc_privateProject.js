import { create, readRef, updatePath, valToList } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { writeAuditLog } from "./svc_workflow.js";
import { createClientInvoice } from "./svc_operations.js";
import { DEFAULT_PRIVATE_PHASES } from "./util_govProject.js";
import { computeProgressFromMilestones } from "./util_projectCore.js";
import {
  PRIVATE_PATHS,
  DEFAULT_PAYMENT_MILESTONES,
  computeMilestoneAmount,
  computeRevisedContractValue,
  addDaysISO,
} from "./util_privateProject.js";

/**
 * Auto-setup default phases and payment milestones for private civil projects.
 */
export async function setupPrivateProjectOnCreate(projectId) {
  const now = Date.now();
  for (const ph of DEFAULT_PRIVATE_PHASES) {
    await create(`projectPhases/${projectId}`, {
      name: ph.name,
      sortOrder: ph.sortOrder,
      status: "pending",
      createdAt: now,
      updatedAt: now,
    });
  }

  const project = readRef(`projects/${projectId}`) || {};
  const contractValue = Number(project.contractValue || project.budgetTotal) || 0;
  if (contractValue > 0) {
    await seedDefaultPaymentMilestones(projectId, project);
  }

  await writeAuditLog({
    entityType: "project",
    entityId: projectId,
    action: "private_setup",
    diffSummary: `Private defaults: ${DEFAULT_PRIVATE_PHASES.length} phases${contractValue > 0 ? ", payment milestones" : ""}`,
  });
}

/**
 * @param {string} projectId
 * @param {object} [project]
 */
export async function seedDefaultPaymentMilestones(projectId, project) {
  const p = project || readRef(`projects/${projectId}`) || {};
  const existing = valToList(readRef(`${PRIVATE_PATHS.paymentMilestones}/${projectId}`) || {});
  if (existing.length) return;

  const { revised } = computeRevisedContractValue(p, []);
  const baseDate = p.startDate || new Date().toISOString().slice(0, 10);
  const now = Date.now();

  for (const tmpl of DEFAULT_PAYMENT_MILESTONES) {
    await create(`${PRIVATE_PATHS.paymentMilestones}/${projectId}`, {
      description: tmpl.description,
      percent: tmpl.percent,
      dueDate: addDaysISO(baseDate, tmpl.dueDateOffsetDays),
      amount: computeMilestoneAmount(revised, tmpl.percent),
      status: "pending",
      invoiceId: "",
      createdAt: now,
      updatedAt: now,
      createdBy: getCurrentUserId(),
    });
  }
}

/**
 * Recompute milestone amounts when contract value or approved change orders change.
 * @param {string} projectId
 */
export async function syncMilestoneAmounts(projectId) {
  if (!projectId) return;
  const project = readRef(`projects/${projectId}`) || {};
  const coRoot = readRef(`changeOrders/${projectId}`) || {};
  const changeOrders = valToList(coRoot);
  const { revised } = computeRevisedContractValue(project, changeOrders);

  const msRoot = readRef(`${PRIVATE_PATHS.paymentMilestones}/${projectId}`) || {};
  const milestones = valToList(msRoot);
  const now = Date.now();

  for (const m of milestones) {
    const amount = computeMilestoneAmount(revised, m.percent);
    if (Number(m.amount) === amount) continue;
    await updatePath(`${PRIVATE_PATHS.paymentMilestones}/${projectId}/${m.id}`, {
      ...m,
      amount,
      updatedAt: now,
    });
  }
}

/**
 * Create a draft client invoice from a payment milestone.
 * @param {string} projectId
 * @param {object} milestone
 * @param {object} [clientOverride]
 */
export async function createInvoiceFromMilestone(projectId, milestone, clientOverride) {
  const project = readRef(`projects/${projectId}`) || {};
  let client = clientOverride;

  if (!client && project.clientId) {
    client = readRef(`clients/${project.clientId}`);
  }
  if (!client && project.clientName) {
    const clientsRoot = readRef("clients") || {};
    client = valToList(clientsRoot).find(
      (c) => String(c.name || "").toLowerCase() === String(project.clientName).toLowerCase()
    );
  }
  if (!client) {
    client = {
      id: project.clientId || "",
      name: project.clientName || "Client",
    };
  }

  const amount = Number(milestone.amount) || computeMilestoneAmount(
    computeRevisedContractValue(project, valToList(readRef(`changeOrders/${projectId}`) || {})).revised,
    milestone.percent
  );

  const invoiceId = await createClientInvoice({
    client,
    project: { id: projectId, name: project.name },
    billType: "milestone",
    amount,
    paidAmount: 0,
    billDate: new Date().toISOString().slice(0, 10),
    description: milestone.description || "Payment milestone",
  });

  await updatePath(`${PRIVATE_PATHS.paymentMilestones}/${projectId}/${milestone.id}`, {
    ...milestone,
    status: "invoiced",
    invoiceId,
    updatedAt: Date.now(),
  });

  await writeAuditLog({
    entityType: "clientInvoice",
    entityId: invoiceId,
    action: "create_from_milestone",
    diffSummary: `Bill from milestone: ${milestone.description}`,
    projectId,
  });

  return invoiceId;
}
