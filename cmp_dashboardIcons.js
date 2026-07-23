const ICON_PATH = "/assets/icons/dashboard";

export const DASH_ICONS = {
  kpi: {
    projects: "kpi-projects",
    contract: "kpi-contract",
    receivable: "kpi-receivable",
    collection: "kpi-collection",
    expense: "kpi-expense",
    taka: "kpi-taka",
  },
  clientKpi: {
    total: "cust-kpi-total-clients",
    active: "cust-kpi-active-clients",
    added: "cust-kpi-added-month",
    email: "cust-kpi-email",
    outstanding: "cust-kpi-outstanding",
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
  supplierKpi: {
    suppliers: "sup-kpi-suppliers",
    outstanding: "kpi-receivable",
    overdue: "attention-warning",
    paidMonth: "kpi-collection",
  },
  supplierAging: {
    current: "sup-aging-current",
    d31_60: "sup-aging-d31",
    d61_90: "sup-aging-d61",
    d90plus: "sup-aging-d90",
  },
};

export function dashboardIcon(name, className = "dash-color-icon") {
  return `<img class="${className}" src="${ICON_PATH}/${name}.svg" width="28" height="28" alt="" loading="lazy" decoding="async" />`;
}

export function kpiIcon(type) {
  return dashboardIcon(DASH_ICONS.kpi[type] || DASH_ICONS.kpi.projects);
}

/** Taka (BDT) icon for money KPIs and report cards. */
export function takaIcon(className = "dash-color-icon") {
  return dashboardIcon(DASH_ICONS.kpi.taka, className);
}

/** Suppliers page KPI strip — distinct icon per card. */
export function supplierKpiIcon(type, className = "dash-color-icon cust-kpi-flat-icon") {
  const file = DASH_ICONS.supplierKpi[type] || DASH_ICONS.supplierKpi.suppliers;
  return `<img class="${className}" src="${ICON_PATH}/${file}.svg" width="38" height="38" alt="" decoding="async" />`;
}

/** Suppliers Reports aging bucket icons. */
export function supplierAgingIcon(bucketKey, className = "sup-aging-card-icon") {
  const file = DASH_ICONS.supplierAging[bucketKey] || DASH_ICONS.supplierAging.current;
  return dashboardIcon(file, className);
}

/** Flat colorful icons for Clients directory KPI cards (no pastel box). */
export function clientKpiIcon(type) {
  const file = DASH_ICONS.clientKpi[type] || DASH_ICONS.clientKpi.total;
  return `<img class="dash-color-icon cust-kpi-flat-icon" src="${ICON_PATH}/${file}.svg" width="38" height="38" alt="" decoding="async" />`;
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

/** Reports hub section widget icons (local Flaticon-style assets). */
export const DASH_ICONS_REPORT_WIDGET = {
  projectCost: "kpi-projects",
  analytics: "milestone-gear",
  workerPayroll: "approval-expense",
  multitenant: "kpi-projects",
  billing: "approval-billing",
  purchases: "kpi-expense",
  financial: "kpi-receivable",
  governance: "milestone-gear",
  hse: "kpi-expense",
  profile: "kpi-projects",
  users: "approval-expense",
  rbac: "milestone-gear",
  audit: "approval-billing",
  backup: "kpi-expense",
};

export function reportWidgetIcon(type, className = "reports-widget-head-icon") {
  const file = DASH_ICONS_REPORT_WIDGET[type] || DASH_ICONS.kpi.projects;
  return `<img class="${className}" src="${ICON_PATH}/${file}.svg" width="32" height="32" alt="" loading="lazy" decoding="async" />`;
}

/** Reports top KPI strip — reuse kpi dashboard icons as flat imgs. */
export function reportKpiIcon(type, className = "dash-color-icon cust-kpi-flat-icon") {
  const map = {
    billed: DASH_ICONS.kpi.collection,
    receivable: DASH_ICONS.kpi.receivable,
    subcontract: DASH_ICONS.kpi.contract,
    expense: DASH_ICONS.kpi.expense,
    contract: DASH_ICONS.kpi.contract,
    budget: DASH_ICONS.kpi.taka,
    progress: DASH_ICONS.kpi.projects,
    health: DASH_ICONS.kpi.receivable,
    ipc: DASH_ICONS.kpi.expense,
    outstanding: DASH_ICONS.kpi.receivable,
  };
  const file = map[type] || DASH_ICONS.kpi.taka;
  return `<img class="${className}" src="${ICON_PATH}/${file}.svg" width="38" height="38" alt="" decoding="async" />`;
}
