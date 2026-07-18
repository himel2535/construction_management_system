import { formatBDT } from "./util_format.js";

export function metricCard({
  icon = "",
  iconHtml = "",
  label,
  value,
  trend,
  trendUp = true,
  link = "#",
  subtext = "",
  showLink = true,
  iconTone = "",
} = {}) {
  const el = document.createElement("div");
  el.className = "metric-card card";
  const iconContent = iconHtml || icon;
  const footer =
    subtext !== ""
      ? `<div class="metric-sub">${subtext}</div>`
      : typeof trend === "number"
        ? `<div class="metric-trend ${trendUp ? "up" : "down"}">${trendUp ? "↑" : "↓"} ${trend}% vs last month</div>`
        : "";
  const linkHtml = showLink
    ? `<a href="${link}" class="metric-link">View details</a>`
    : "";
  el.innerHTML = `
    <div class="metric-top">
      <span class="metric-icon ${iconTone}">${iconContent}</span>
      ${linkHtml}
    </div>
    <div class="metric-label">${label}</div>
    <div class="metric-value">${value}</div>
    ${footer}
  `;
  return el;
}

export function statusChip(status) {
  const s = String(status).toLowerCase();
  let cls = "chip";
  if (s === "paid" || s === "completed" || s === "active" || s === "approved" || s === "on_time") cls += " chip-success";
  else if (s === "pending" || s === "inactive" || s === "rejected" || s === "delayed" || s === "on_hold") cls += " chip-warning";
  else if (s === "ongoing" || s === "submitted" || s === "planning") cls += " chip-info";
  else if (s === "overdue" || s === "partial") cls += " chip-warning";
  else if (s === "draft") cls += " chip-muted";
  else if (s === "closed") cls += " chip-muted";
  else cls += " chip-muted";
  return `<span class="${cls}">${status}</span>`;
}

export function healthChip(healthKey) {
  const map = {
    on_track: "chip-success",
    delayed: "chip-warning",
    at_risk: "chip-warning",
  };
  const labels = {
    on_track: "On-track",
    delayed: "Delayed",
    at_risk: "At-risk",
  };
  const key = String(healthKey || "on_track").toLowerCase();
  const cls = `chip health-chip health-chip--${key} ${map[key] || "chip-muted"}`;
  return `<span class="${cls}">${labels[key] || key}</span>`;
}

export function varianceChip(varianceKey, label) {
  const map = {
    on_time: "chip-success",
    delayed: "chip-warning",
    pending: "chip-info",
  };
  const cls = `chip ${map[varianceKey] || "chip-muted"}`;
  return `<span class="${cls}">${label}</span>`;
}

export function progressBar(percent, colorClass = "") {
  return `
    <div class="progress-track">
      <div class="progress-fill ${colorClass}" style="width:${Math.min(100, percent)}%"></div>
    </div>
  `;
}

export function sectionCard(title, subtitle = "") {
  const card = document.createElement("div");
  card.className = "card section-card";
  card.innerHTML = `
    <div class="section-card-head">
      <div>
        <h3 class="section-title">${title}</h3>
        ${subtitle ? `<p class="section-sub">${subtitle}</p>` : ""}
      </div>
    </div>
    <div class="section-card-body"></div>
  `;
  return card;
}

export function renderCashFlowChart(host, cashFlow) {
  if (!cashFlow) return;
  const max = Math.max(...cashFlow.receipts, ...cashFlow.payments, 1);
  const w = 100;
  const h = 120;
  const ptsR = cashFlow.receipts.map((v, i) => {
    const x = (i / (cashFlow.receipts.length - 1)) * w;
    const y = h - (v / max) * (h - 10);
    return `${x},${y}`;
  }).join(" ");
  const ptsP = cashFlow.payments.map((v, i) => {
    const x = (i / (cashFlow.payments.length - 1)) * w;
    const y = h - (v / max) * (h - 10);
    return `${x},${y}`;
  }).join(" ");

  host.innerHTML = `
    <div class="chart-legend">
      <span><i class="dot dot-green"></i> Receipts</span>
      <span><i class="dot dot-red"></i> Payments</span>
    </div>
    <svg class="line-chart" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
      <polyline class="line-receipts" points="${ptsR}" />
      <polyline class="line-payments" points="${ptsP}" />
    </svg>
    <div class="chart-labels">${cashFlow.labels.map((l) => `<span>${l}</span>`).join("")}</div>
  `;
}

export function formatMetricBDT(n) {
  return formatBDT(n);
}
