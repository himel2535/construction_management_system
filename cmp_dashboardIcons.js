const ICON_PATH = "assets/icons/dashboard";

export const DASH_ICONS = {
  kpi: {
    projects: "kpi-projects",
    contract: "kpi-contract",
    receivable: "kpi-receivable",
    collection: "kpi-collection",
    expense: "kpi-expense",
  },
  attention: {
    warning: "attention-warning",
    payment: "attention-payment",
    approval: "attention-approval",
    materials: "attention-materials",
    maintenance: "attention-maintenance",
    delivery: "attention-delivery",
  },
  approval: {
    requisition: "approval-requisition",
    order: "approval-order",
    material: "approval-material",
    expense: "approval-expense",
    billing: "approval-billing",
  },
  proc: {
    cement: "proc-cement",
    rod: "proc-rod",
    sand: "proc-sand",
    material: "proc-material",
    po: "proc-po",
    delivery: "proc-delivery",
    request: "proc-request",
  },
  milestone: {
    home: "milestone-home",
    building: "milestone-building",
    tower: "milestone-tower",
    gear: "milestone-gear",
    bag: "milestone-bag",
  },
};

export function dashboardIcon(name, className = "dash-color-icon") {
  return `<img class="${className}" src="${ICON_PATH}/${name}.svg" width="28" height="28" alt="" loading="lazy" decoding="async" />`;
}

export function kpiIcon(type) {
  return dashboardIcon(DASH_ICONS.kpi[type] || DASH_ICONS.kpi.projects);
}

export function attentionIcon(type) {
  return dashboardIcon(DASH_ICONS.attention[type] || DASH_ICONS.attention.warning);
}

export function approvalIcon(type) {
  return dashboardIcon(DASH_ICONS.approval[type] || DASH_ICONS.approval.requisition);
}

export function procIcon(type) {
  return dashboardIcon(DASH_ICONS.proc[type] || DASH_ICONS.proc.material);
}

export function milestoneIcon(type) {
  return dashboardIcon(DASH_ICONS.milestone[type] || DASH_ICONS.milestone.building);
}
