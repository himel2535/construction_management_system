/** Lightweight project timeline — phases, milestones, dependencies (§2.1) */

import { statusChip } from "./cmp_ui.js";
import { formatDate } from "./util_format.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return Number.isNaN(d.getTime()) ? null : d;
}

function dateToMs(str) {
  const d = parseDate(str);
  return d ? d.getTime() : null;
}

function resolveRange(project, milestones) {
  let start = dateToMs(project?.startDate);
  let end = dateToMs(project?.endDate);
  for (const m of milestones) {
    const ms = dateToMs(m.plannedDate);
    if (ms == null) continue;
    if (start == null || ms < start) start = ms;
    if (end == null || ms > end) end = ms;
  }
  if (start == null) start = Date.now();
  if (end == null || end <= start) end = start + 86400000 * 30;
  return { start, end, span: Math.max(end - start, 86400000) };
}

function pctInRange(ms, start, span) {
  if (ms == null) return 0;
  return Math.min(100, Math.max(0, ((ms - start) / span) * 100));
}

/**
 * @param {object} project
 * @param {object[]} phases
 * @param {object[]} milestones
 */
export function renderProjectTimeline(project, phases = [], milestones = []) {
  const wrap = document.createElement("div");
  wrap.className = "proj-timeline-wrap";

  if (!milestones.length && !phases.length) {
    wrap.innerHTML = `<p class="proj-empty">Add phases and milestones to see the timeline.</p>`;
    return wrap;
  }

  const { start, end, span } = resolveRange(project, milestones);
  const startLabel = formatDate(new Date(start).toISOString().slice(0, 10));
  const endLabel = formatDate(new Date(end).toISOString().slice(0, 10));

  const sortedPhases = [...phases].sort(
    (a, b) => (a.sortOrder || a.sequence || 0) - (b.sortOrder || b.sequence || 0)
  );
  const phaseMap = new Map(sortedPhases.map((p) => [p.id, p]));
  const msByPhase = new Map();
  const unphased = [];

  for (const m of milestones) {
    if (m.phaseId && phaseMap.has(m.phaseId)) {
      const list = msByPhase.get(m.phaseId) || [];
      list.push(m);
      msByPhase.set(m.phaseId, list);
    } else {
      unphased.push(m);
    }
  }

  const rows = [];
  for (const ph of sortedPhases) {
    rows.push({ type: "phase", phase: ph, milestones: msByPhase.get(ph.id) || [] });
  }
  if (unphased.length) rows.push({ type: "phase", phase: { name: "Unassigned", id: "" }, milestones: unphased });

  const barPositions = new Map();
  let rowIndex = 0;
  const rowHtml = rows
    .map(({ phase, milestones: msList }) => {
      const phaseRow = `<div class="proj-timeline-row proj-timeline-row--phase"><span class="proj-timeline-label">${escapeHtml(phase.name)}</span><div class="proj-timeline-track"></div></div>`;
      const msRows = msList
        .map((m) => {
          const planned = dateToMs(m.plannedDate);
          const left = pctInRange(planned, start, span);
          const done = m.status === "completed";
          const barId = `tl-bar-${m.id}`;
          barPositions.set(m.id, { left, rowIndex, barId });
          rowIndex += 1;
          return `
          <div class="proj-timeline-row" data-ms-id="${escapeHtml(m.id)}">
            <span class="proj-timeline-label" title="${escapeHtml(m.title)}">${escapeHtml(m.title)}</span>
            <div class="proj-timeline-track">
              <div class="proj-timeline-bar${done ? " is-done" : ""}" id="${barId}" style="left:${left}%;width:8%;" title="${escapeHtml(m.plannedDate || "—")}">
                <span class="proj-timeline-bar-tip">${escapeHtml(formatDate(m.plannedDate) || "—")}</span>
              </div>
            </div>
            <span class="proj-timeline-status">${statusChip(m.status || "pending")}</span>
          </div>`;
        })
        .join("");
      return phaseRow + msRows;
    })
    .join("");

  wrap.innerHTML = `
    <div class="proj-timeline-axis">
      <span>${escapeHtml(startLabel)}</span>
      <span>${escapeHtml(endLabel)}</span>
    </div>
    <div class="proj-timeline-body">${rowHtml}</div>
    <svg class="proj-timeline-deps" aria-hidden="true"></svg>
  `;

  const svg = wrap.querySelector(".proj-timeline-deps");
  const body = wrap.querySelector(".proj-timeline-body");
  if (svg && body) {
    requestAnimationFrame(() => {
      const bodyRect = body.getBoundingClientRect();
      svg.setAttribute("width", String(bodyRect.width));
      svg.setAttribute("height", String(bodyRect.height));
      svg.style.width = `${bodyRect.width}px`;
      svg.style.height = `${bodyRect.height}px`;
      const lines = [];
      for (const m of milestones) {
        if (!m.dependsOnId || !barPositions.has(m.dependsOnId) || !barPositions.has(m.id)) continue;
        const from = barPositions.get(m.dependsOnId);
        const to = barPositions.get(m.id);
        const fromEl = wrap.querySelector(`#${from.barId}`);
        const toEl = wrap.querySelector(`#${to.barId}`);
        if (!fromEl || !toEl) continue;
        const fr = fromEl.getBoundingClientRect();
        const tr = toEl.getBoundingClientRect();
        const x1 = fr.right - bodyRect.left;
        const y1 = fr.top + fr.height / 2 - bodyRect.top;
        const x2 = tr.left - bodyRect.left;
        const y2 = tr.top + tr.height / 2 - bodyRect.top;
        lines.push(
          `<line x1="${x1}" y1="${y1}" x2="${x2}" y2="${y2}" class="proj-timeline-dep-line" />`
        );
      }
      svg.innerHTML = lines.join("");
    });
  }

  return wrap;
}
