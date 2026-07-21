/** Procurement hub — KPI, tabs, dashboard widgets */

import { escapeHtml } from "./cmp_projectTab.js";
import { kpiIcon } from "./cmp_dashboardIcons.js";
import { formatBDT } from "./util_format.js";

export const PROCUREMENT_TABS = [
  { id: "requests", label: "Material requests" },
  { id: "orders", label: "Purchase orders" },
  { id: "grn", label: "Goods receipt" },
];

function purSparklineSvg(values = [], tone = "green") {
  const pts = values.length ? values : [3, 4, 4, 5, 5, 6, 6];
  const max = Math.max(...pts, 1);
  const w = 56;
  const h = 22;
  const coords = pts
    .map((v, i) => {
      const x = (i / (pts.length - 1 || 1)) * w;
      const y = h - (v / max) * (h - 4) - 2;
      return `${x},${y}`;
    })
    .join(" ");
  const strokes = {
    blue: "#2563eb",
    green: "#047857",
    orange: "#d97706",
    teal: "#0d9488",
    red: "#B91C1C",
    yellow: "#CA8A04",
  };
  const stroke = strokes[tone] || strokes.green;
  return `<svg class="dash-sparkline dash-sparkline--${tone}" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none"><polyline points="${coords}" fill="none" stroke="${stroke}" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
}

export function computeProcurementStats(mrs = [], pos = [], grns = [], { hasProject = true } = {}) {
  const mrDraft = mrs.filter((m) => m.status === "draft").length;
  const mrSubmitted = mrs.filter((m) => m.status === "submitted").length;
  const poDraft = pos.filter((p) => p.status === "draft").length;
  const poApproved = pos.filter((p) => p.status === "approved").length;
  const grnPosted = grns.filter((g) => g.centralStockPosted).length;
  const grnPending = grns.length - grnPosted;
  const openPoValue = pos
    .filter((p) => p.status === "draft" || p.status === "approved")
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  return {
    hasProject,
    mrCount: mrs.length,
    mrDraft,
    mrSubmitted,
    poCount: pos.length,
    poDraft,
    poApproved,
    grnCount: grns.length,
    grnPosted,
    grnPending,
    openPoValue,
    openPoValueLabel: hasProject ? formatBDT(openPoValue) : "—",
  };
}

export function renderProcurementKpiStripHtml(stats) {
  const foot = stats.hasProject
    ? {
        mr: `${stats.mrDraft} draft · ${stats.mrSubmitted} submitted`,
        po: `${stats.poDraft} draft · ${stats.poApproved} approved`,
        grn: `${stats.grnPosted} posted · ${stats.grnPending} pending stock`,
        open: "Draft + approved POs",
      }
    : {
        mr: "Select a project",
        po: "Select a project",
        grn: "Select a project",
        open: "Select a project",
      };

  const cards = [
    {
      label: "Material requests",
      value: stats.hasProject ? String(stats.mrCount) : "—",
      iconKey: "projects",
      tone: "blue",
      footLeft: foot.mr,
      spark: purSparklineSvg([stats.mrCount || 1, 2, 2, 1, 1, 1, 1], "blue"),
    },
    {
      label: "Purchase orders",
      value: stats.hasProject ? String(stats.poCount) : "—",
      iconKey: "collection",
      tone: "green",
      footLeft: foot.po,
      spark: purSparklineSvg([stats.poCount || 1, 2, 2, 1, 1, 1, 1], "green"),
    },
    {
      label: "Goods receipts",
      value: stats.hasProject ? String(stats.grnCount) : "—",
      iconKey: "expense",
      tone: "orange",
      footLeft: foot.grn,
      spark: purSparklineSvg([stats.grnCount || 1, 2, 2, 1, 1, 1, 1], "orange"),
    },
    {
      label: "Open PO value",
      value: stats.hasProject ? stats.openPoValueLabel : "—",
      iconKey: "receivable",
      tone: "teal",
      footLeft: foot.open,
      spark: purSparklineSvg([3, 4, 4, 5, 5, 6, 6], "teal"),
    },
  ];

  return cards
    .map(
      (c) => `<div class="dash-kpi-card card cust-kpi-card">
      <div class="cust-kpi-spark">${c.spark}</div>
      <div class="dash-kpi-head">
        <div class="dash-kpi-icon dash-kpi-icon--flat">${kpiIcon(c.iconKey).replace('class="dash-color-icon"', 'class="dash-color-icon cust-kpi-flat-icon"')}</div>
        <div class="dash-kpi-main">
          <span class="dash-kpi-label">${escapeHtml(c.label)}</span>
          <div class="dash-kpi-value">${escapeHtml(c.value)}</div>
        </div>
      </div>
      <div class="dash-kpi-foot">
        <div class="dash-kpi-foot-left">${escapeHtml(c.footLeft)}</div>
      </div>
    </div>`
    )
    .join("");
}

export function renderProcurementTabBar(activeTab, onSelect) {
  const bar = document.createElement("div");
  bar.className = "proj-tab-subnav pur-pill-tabs pur-pill-tabs--proc-main";
  for (const t of PROCUREMENT_TABS) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = `proj-tab pur-tab-pill pur-tab-pill--${t.id}${activeTab === t.id ? " is-active" : ""}`;
    btn.textContent = t.label;
    btn.onclick = () => onSelect(t.id);
    bar.appendChild(btn);
  }
  return bar;
}

export function purSection(title, subtitle = "", toolbarHtml = "", bodyEl) {
  const section = document.createElement("section");
  section.className = "dash-widget dash-widget--projects card pur-report-block";
  section.innerHTML = `
    <div class="dash-widget-head dash-widget-head--split">
      <div>
        <h3 class="dash-widget-title">${escapeHtml(title)}</h3>
        ${subtitle ? `<p class="dash-widget-sub">${escapeHtml(subtitle)}</p>` : ""}
      </div>
      ${toolbarHtml ? `<div class="cust-toolbar-btn-group">${toolbarHtml}</div>` : ""}
    </div>
    <div class="dash-widget-body pur-section-body"></div>
  `;
  const body = section.querySelector(".pur-section-body");
  if (typeof bodyEl === "string") body.innerHTML = bodyEl;
  else if (bodyEl) body.appendChild(bodyEl);
  return section;
}
