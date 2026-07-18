import { readRef, updatePath, valToList } from "./svc_data.js";
import { computeProgressFromMilestones } from "./util_projectCore.js";

export { setupPrivateProjectOnCreate } from "./svc_privateProject.js";

/**
 * Recompute and persist project progressPercent from milestones.
 * @param {string} projectId
 */
export async function syncProjectProgress(projectId) {
  if (!projectId) return;
  const msRoot = readRef(`projectMilestones/${projectId}`) || {};
  const milestones = valToList(msRoot);
  const percent = computeProgressFromMilestones(milestones);
  const project = readRef(`projects/${projectId}`) || {};
  if (Number(project.progressPercent) === percent) return;
  await updatePath(`projects/${projectId}`, {
    ...project,
    progressPercent: percent,
    updatedAt: Date.now(),
  });
}
