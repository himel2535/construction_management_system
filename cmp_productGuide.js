/** Product Guide — full-screen interactive site map + RBAC matrix in Settings */

import { navigateTo } from "./util_route.js";
import { ROLE_LABELS } from "./util_roles.js";
import {
  approvalGuideRows,
  approvalGuideRowRelevant,
  roleGuideSummary,
} from "./util_approvalResponsibility.js";
import {
  ERP_GUIDE_SECTIONS,
  ERP_ROLE_OPTIONS,
  ERP_HERO,
  ERP_SITE_TREE,
  ERP_JOURNEYS,
  ERP_ROLE_GUIDES,
  ERP_FEATURES,
  ERP_CLIENT_GUIDE,
} from "./util_erpSiteMap.js";

function escapeHtml(s) {
  return String(s ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function roleBadgeHtml(roleId) {
  const label = ROLE_LABELS[roleId] || roleId;
  return `<span class="product-guide-role-badge product-guide-role-badge--${escapeHtml(roleId)}">${escapeHtml(label)}</span>`;
}

function rolesBadgesHtml(roles = []) {
  if (!roles.length) return "";
  return roles.map((r) => roleBadgeHtml(r)).join("");
}

function pgChips(labels, type) {
  if (!labels?.length) {
    if (type === "approve") return `<span class="pg-badge pg-badge--operational">Operational</span>`;
    return `<span class="text-muted">—</span>`;
  }
  return labels.map((l) => `<span class="pg-chip pg-chip--${type}">${escapeHtml(l)}</span>`).join("");
}

function nodeVisibleForRole(node, roleId) {
  if (!roleId || roleId === "all") return true;
  if (!node.roles || !node.roles.length) return true;
  return node.roles.includes(roleId);
}

function actionVisibleForRole(action, roleId) {
  if (!roleId || roleId === "all") return true;
  if (!action.roles || !action.roles.length) return true;
  return action.roles.includes(roleId);
}

function filterTreeNode(node, roleId) {
  if (!nodeVisibleForRole(node, roleId)) return null;
  const copy = { ...node };
  if (copy.actions) {
    copy.actions = copy.actions.filter((a) => actionVisibleForRole(a, roleId));
  }
  if (copy.children) {
    copy.children = copy.children.map((c) => filterTreeNode(c, roleId)).filter(Boolean);
    if (!copy.actions?.length && !copy.children.length && !copy.route) return null;
  }
  return copy;
}

function nodeMatchesSearch(node, query) {
  if (!query) return true;
  const q = query.toLowerCase();
  if (node.label?.toLowerCase().includes(q)) return true;
  if (node.route?.toLowerCase().includes(q)) return true;
  if (node.hint?.toLowerCase().includes(q)) return true;
  if (node.actions?.some((a) => a.label?.toLowerCase().includes(q) || a.route?.toLowerCase().includes(q))) return true;
  if (node.children?.some((c) => nodeMatchesSearch(c, query))) return true;
  return false;
}

function filterTreeBySearch(node, query) {
  if (!query) return node;
  if (!nodeMatchesSearch(node, query)) return null;
  const copy = { ...node };
  if (copy.children) {
    copy.children = copy.children.map((c) => filterTreeBySearch(c, query)).filter(Boolean);
  }
  if (copy.actions && query) {
    copy.actions = copy.actions.filter(
      (a) =>
        a.label?.toLowerCase().includes(query.toLowerCase()) ||
        a.route?.toLowerCase().includes(query.toLowerCase()) ||
        !query
    );
  }
  return copy;
}

function renderActionRow(action) {
  const hint = action.hint ? `<span class="product-guide-action-hint">${escapeHtml(action.hint)}</span>` : "";
  const roles = action.roles?.length ? `<span class="product-guide-action-roles">${rolesBadgesHtml(action.roles)}</span>` : "";
  return `<div class="product-guide-action" data-roles="${escapeHtml((action.roles || []).join(","))}">
    <div class="product-guide-action__main">
      <span class="product-guide-action-label">${escapeHtml(action.label)}</span>
      <code class="product-guide-route" title="Route">${escapeHtml(action.route)}</code>
      ${hint}
      ${roles}
    </div>
    <button type="button" class="btn btn-primary product-guide-go-btn" data-route="${escapeHtml(action.route)}">যান →</button>
  </div>`;
}

function renderTreeNode(node, depth = 0, searchQuery = "") {
  const hasChildren = node.children?.length;
  const hasActions = node.actions?.length;
  const routeCode = node.route ? `<code class="product-guide-route">${escapeHtml(node.route)}</code>` : "";
  const hint = node.hint ? `<p class="product-guide-node-hint">${escapeHtml(node.hint)}</p>` : "";
  const roles = node.roles?.length ? `<div class="product-guide-node-roles">${rolesBadgesHtml(node.roles)}</div>` : "";
  const actionsHtml = hasActions ? `<div class="product-guide-actions">${node.actions.map(renderActionRow).join("")}</div>` : "";
  const childrenHtml = hasChildren
    ? `<div class="product-guide-tree-children">${node.children.map((c) => renderTreeNode(c, depth + 1, searchQuery)).join("")}</div>`
    : "";
  const moduleCount = hasChildren ? `<span class="product-guide-module-count">${node.children.length}</span>` : "";

  if (hasChildren || hasActions) {
    const open = depth < 1 || searchQuery ? " open" : "";
    return `<details class="product-guide-tree-node product-guide-sitemap-node--depth-${depth}" data-roles="${escapeHtml((node.roles || []).join(","))}"${open}>
      <summary class="product-guide-tree-summary">
        <span class="product-guide-tree-label">${escapeHtml(node.label)}</span>
        ${moduleCount}
        ${routeCode}
      </summary>
      ${hint}${roles}${actionsHtml}${childrenHtml}
    </details>`;
  }

  return `<div class="product-guide-tree-node product-guide-tree-node--leaf product-guide-sitemap-node--depth-${depth}" data-roles="${escapeHtml((node.roles || []).join(","))}">
    <div class="product-guide-tree-summary product-guide-tree-summary--leaf">
      <span class="product-guide-tree-label">${escapeHtml(node.label)}</span>
      ${routeCode}
    </div>
    ${hint}${roles}
  </div>`;
}

function renderSiteMapTree(roleId, searchQuery = "") {
  let filtered = ERP_SITE_TREE.map((n) => filterTreeNode(n, roleId)).filter(Boolean);
  if (searchQuery) {
    filtered = filtered.map((n) => filterTreeBySearch(n, searchQuery)).filter(Boolean);
  }
  if (!filtered.length) {
    return `<p class="product-guide-empty">কোনো module পাওয়া যায়নি। Search বা role filter পরিবর্তন করুন।</p>`;
  }
  return `<div class="product-guide-tree">${filtered.map((n) => renderTreeNode(n, 0, searchQuery)).join("")}</div>`;
}

function renderRbacFlowCards() {
  const cards = [
    {
      tone: "orange",
      title: "Procurement flow",
      titleBn: "মাল কেনা",
      steps: ["Site MR submit", "PM approve", "Procurement Build PO", "PM approve PO", "GRN receive"],
      route: "/purchases?tab=orders",
    },
    {
      tone: "purple",
      title: "Finance flow",
      titleBn: "বিল ও খরচ",
      steps: ["PM submit billing", "Accountant approve", "Record payment"],
      route: "/billing",
    },
    {
      tone: "green",
      title: "Site flow",
      titleBn: "Site কাজ",
      steps: ["Engineer submit diary", "PM / Engineer approve", "Material log approve"],
      route: "/site-incharge?tab=diary",
    },
  ];
  return `<div class="product-guide-flow-cards">${cards
    .map(
      (c) => `<article class="product-guide-flow-card product-guide-flow-card--${c.tone}">
        <h4 class="product-guide-flow-card__title">${escapeHtml(c.titleBn)} <span class="product-guide-flow-card__en">${escapeHtml(c.title)}</span></h4>
        <ol class="product-guide-flow-card__steps">${c.steps.map((s) => `<li>${escapeHtml(s)}</li>`).join("")}</ol>
        <button type="button" class="btn btn-secondary product-guide-go-btn product-guide-go-btn--subtle" data-route="${escapeHtml(c.route)}">যান →</button>
      </article>`
    )
    .join("")}</div>`;
}

function renderRbacMatrix(roleId) {
  const rows = approvalGuideRows();
  const body = rows
    .map((row) => {
      const relevant = approvalGuideRowRelevant(row, roleId);
      const rowClass = relevant || roleId === "all" ? "product-guide-rbac-row is-relevant" : "product-guide-rbac-row is-dimmed";
      const flowBadge = row.operational
        ? `<span class="pg-badge pg-badge--operational">Operational</span>`
        : row.flowNote
          ? `<span class="pg-badge pg-badge--staged">${escapeHtml(row.flowNote)}</span>`
          : "";
      const pages = row.approvePages
        .map(
          (p) =>
            `<button type="button" class="product-guide-rbac-page-link product-guide-go-btn" data-route="${escapeHtml(p.path)}">${escapeHtml(p.label)}</button>`
        )
        .join("");
      return `<tr class="${rowClass}" data-entity="${escapeHtml(row.entityType)}">
        <td class="pg-rbac-what"><strong>${escapeHtml(row.label)}</strong>${flowBadge}</td>
        <td class="pg-rbac-submit"><span class="pg-chip-group">${pgChips(row.submitterLabels, "submit")}</span></td>
        <td class="pg-rbac-approve"><span class="pg-chip-group">${row.operational ? `<span class="pg-badge pg-badge--operational">No approval</span>` : pgChips(row.approverLabels, "approve")}</span></td>
        <td class="pg-rbac-where"><div class="pg-rbac-pages">${pages}</div></td>
      </tr>`;
    })
    .join("");

  const mobileCards = rows
    .map((row) => {
      const relevant = approvalGuideRowRelevant(row, roleId);
      const rowClass = relevant || roleId === "all" ? "pg-rbac-card is-relevant" : "pg-rbac-card is-dimmed";
      const pages = row.approvePages
        .map(
          (p) =>
            `<button type="button" class="product-guide-rbac-page-link product-guide-go-btn" data-route="${escapeHtml(p.path)}">${escapeHtml(p.label)}</button>`
        )
        .join("");
      return `<article class="${rowClass}">
        <h4>${escapeHtml(row.label)}</h4>
        ${row.flowNote ? `<p class="pg-rbac-card-note">${escapeHtml(row.flowNote)}</p>` : ""}
        <dl class="pg-rbac-card-dl">
          <dt>Creates / Submits</dt><dd>${pgChips(row.submitterLabels, "submit")}</dd>
          <dt>Approves</dt><dd>${row.operational ? `<span class="pg-badge pg-badge--operational">Operational</span>` : pgChips(row.approverLabels, "approve")}</dd>
          <dt>Where</dt><dd class="pg-rbac-pages">${pages}</dd>
        </dl>
      </article>`;
    })
    .join("");

  return `<div class="product-guide-rbac-intro">
      <p><strong>Production RBAC</strong> — প্রতিটি workflow-এ আলাদা role: কে তৈরি/ submit করে, কে approve করে, কোন page-এ action নিতে হবে। Owner সব approve করতে পারেন।</p>
      <p class="text-muted">Full permission keys → <button type="button" class="btn btn-secondary product-guide-go-btn product-guide-go-btn--subtle" data-route="/settings?tab=rbac">Settings → Permissions</button></p>
    </div>
    ${renderRbacFlowCards()}
    <div class="product-guide-rbac-table-wrap">
      <table class="product-guide-rbac-table dash-table projects-table">
        <thead>
          <tr>
            <th>What</th>
            <th>Who creates/submits</th>
            <th>Who approves</th>
            <th>Where to action</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>
    <div class="product-guide-rbac-cards">${mobileCards}</div>`;
}

function renderJourneyCard(journey, roleId) {
  if (roleId && roleId !== "all" && journey.roles && !journey.roles.includes(roleId)) return "";
  const steps = journey.steps
    .map(
      (step, i) => `<li class="product-guide-journey-step">
        <span class="product-guide-journey-num">${i + 1}</span>
        <div class="product-guide-journey-body">
          <p class="product-guide-journey-text">${escapeHtml(step.text)}</p>
          ${step.action ? `<span class="product-guide-journey-action">${escapeHtml(step.action)}</span>` : ""}
          <button type="button" class="btn btn-primary product-guide-go-btn" data-route="${escapeHtml(step.route)}">যান →</button>
        </div>
      </li>`
    )
    .join("");
  return `<article class="product-guide-journey" data-roles="${escapeHtml((journey.roles || []).join(","))}">
    <h4 class="product-guide-journey-title">${escapeHtml(journey.title)}</h4>
    <ol class="product-guide-journey-steps">${steps}</ol>
  </article>`;
}

function renderRoleGuideCard(guide, roleId) {
  if (roleId && roleId !== "all" && guide.role !== roleId) return "";
  const summary = roleGuideSummary(guide.role);
  const access = guide.canAccess.map((a) => `<li>${escapeHtml(a)}</li>`).join("");
  const canSubmit = summary.canSubmit.slice(0, 6).map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  const canApprove = summary.canApprove.slice(0, 6).map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  const cannotDo = summary.cannotDo.slice(0, 5).map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  const tasks = guide.dailyTasks
    .map(
      (t) => `<li class="product-guide-role-task">
        <span>${escapeHtml(t.text)}</span>
        <button type="button" class="btn btn-secondary product-guide-go-btn product-guide-go-btn--subtle" data-route="${escapeHtml(t.route)}">যান →</button>
      </li>`
    )
    .join("");
  return `<article class="product-guide-role-card" data-role="${escapeHtml(guide.role)}">
    <header class="product-guide-role-card__head">
      ${roleBadgeHtml(guide.role)}
      <h4>${escapeHtml(guide.title)}</h4>
    </header>
    <div class="product-guide-role-card__body">
      <div class="product-guide-role-panel">
        <p class="product-guide-role-panel__label">Module access</p>
        <ul class="product-guide-role-list">${access}</ul>
      </div>
      <div class="product-guide-role-panel product-guide-role-panel--submit">
        <p class="product-guide-role-panel__label">Can submit / create</p>
        <ul class="product-guide-role-list">${canSubmit || "<li class='text-muted'>—</li>"}</ul>
      </div>
      <div class="product-guide-role-panel product-guide-role-panel--approve">
        <p class="product-guide-role-panel__label">Can approve</p>
        <ul class="product-guide-role-list">${canApprove || "<li class='text-muted'>—</li>"}</ul>
      </div>
      ${
        cannotDo
          ? `<div class="product-guide-role-panel product-guide-role-panel--cannot">
        <p class="product-guide-role-panel__label">Cannot do</p>
        <ul class="product-guide-role-list product-guide-role-list--cannot">${cannotDo}</ul>
      </div>`
          : ""
      }
      <div class="product-guide-role-panel">
        <p class="product-guide-role-panel__label">দৈনিক কাজ</p>
        <ul class="product-guide-role-tasks">${tasks}</ul>
      </div>
    </div>
  </article>`;
}

function renderFeatureCard(f) {
  return `<article class="product-guide-feature-card">
    <h4>${escapeHtml(f.title)}</h4>
    <p>${escapeHtml(f.desc)}</p>
    <button type="button" class="btn btn-secondary product-guide-go-btn product-guide-go-btn--subtle" data-route="${escapeHtml(f.route)}">যান →</button>
  </article>`;
}

function renderClientGuideSection() {
  const g = ERP_CLIENT_GUIDE;
  const canSee = g.canSee.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  const cannotDo = g.cannotDo.map((s) => `<li>${escapeHtml(s)}</li>`).join("");
  const steps = g.steps
    .map(
      (step, i) => `<li class="product-guide-journey-step">
        <span class="product-guide-journey-num">${i + 1}</span>
        <div class="product-guide-journey-body">
          <p class="product-guide-journey-text">${escapeHtml(step.text)}</p>
          ${step.action ? `<span class="product-guide-journey-action">${escapeHtml(step.action)}</span>` : ""}
          <button type="button" class="btn btn-primary product-guide-go-btn" data-route="${escapeHtml(step.route)}">যান →</button>
        </div>
      </li>`
    )
    .join("");
  return `<div class="product-guide-client-grid">
    <div class="product-guide-client-intro">
      <h4>${escapeHtml(g.title)}</h4>
      <p>${escapeHtml(g.subtitle)}</p>
      <button type="button" class="btn btn-primary product-guide-go-btn" data-route="/client-portal">Client Portal →</button>
    </div>
    <div class="product-guide-client-panels">
      <div class="product-guide-client-panel product-guide-client-panel--yes">
        <h5>What you can see</h5>
        <ul>${canSee}</ul>
      </div>
      <div class="product-guide-client-panel product-guide-client-panel--no">
        <h5>What you cannot do</h5>
        <ul>${cannotDo}</ul>
      </div>
    </div>
    <ol class="product-guide-journey-steps product-guide-client-steps">${steps}</ol>
  </div>`;
}

export function renderProductGuideHtml() {
  const navLinks = ERP_GUIDE_SECTIONS.map(
    (s) => `<a href="#guide-${s.id}" class="product-guide-topnav__link" data-guide-section="${s.id}">${escapeHtml(s.label)}</a>`
  ).join("");

  const roleChips = ERP_ROLE_OPTIONS.map(
    (r) =>
      `<button type="button" class="product-guide-role-chip${r.id === "all" ? " is-active" : ""}" data-guide-role="${escapeHtml(r.id)}">${escapeHtml(r.label)}</button>`
  ).join("");

  const heroStats = ERP_HERO.stats
    .map(
      (s) => `<div class="product-guide-stat">
        <span class="product-guide-stat__value">${escapeHtml(s.value)}</span>
        <span class="product-guide-stat__label">${escapeHtml(s.label)}</span>
      </div>`
    )
    .join("");

  return `<div class="product-guide" id="product-guide-root">
    <header class="product-guide-hero">
      <span class="product-guide-hero__badge">${escapeHtml(ERP_HERO.badge)}</span>
      <h2 class="product-guide-hero__title">${escapeHtml(ERP_HERO.title)} — <em>${escapeHtml(ERP_HERO.highlight)}</em></h2>
      <p class="product-guide-hero__sub">${escapeHtml(ERP_HERO.subtitle)}</p>
      <div class="product-guide-hero__stats">${heroStats}</div>
    </header>

    <nav class="product-guide-topnav" aria-label="Guide sections">${navLinks}</nav>

    <div class="product-guide-role-bar" role="group" aria-label="Role filter">
      <span class="product-guide-role-bar__label">Role বেছে নিন:</span>
      <div class="product-guide-role-bar__chips">${roleChips}</div>
    </div>

    <div class="product-guide-body" id="product-guide-body">
      <section class="product-guide-section" id="guide-overview">
        <div class="product-guide-section-head">
          <span class="product-guide-section-label">সারসংক্ষেপ</span>
          <h3 class="product-guide-section-title">ERP overview — Seller & Buyer</h3>
          <p class="product-guide-section-sub">Construction company internal team ও Client portal buyer — দুই audience-এর জন্য guide।</p>
        </div>
        <div class="product-guide-audience-grid">
          <article class="product-guide-audience-card product-guide-audience-card--seller">
            <span class="product-guide-audience-badge">Internal team · Seller</span>
            <h4>Construction company roles</h4>
            <p>PM, Site Engineer, Procurement, Accountant — project plan থেকে material, billing, approval পর্যন্ত।</p>
            <ul>
              <li>PM approves PO, MR, quality, milestones</li>
              <li>Procurement creates PO & receives GRN (approve নয়)</li>
              <li>Accountant approves billing & supplier bills</li>
            </ul>
            <div class="product-guide-audience-actions">
              <button type="button" class="btn btn-primary product-guide-go-btn" data-route="#guide-rbac">RBAC matrix ↓</button>
              <button type="button" class="btn btn-secondary product-guide-go-btn product-guide-go-btn--subtle" data-route="/approvals">Approvals →</button>
            </div>
          </article>
          <article class="product-guide-audience-card product-guide-audience-card--buyer">
            <span class="product-guide-audience-badge">Client · Buyer</span>
            <h4>Client portal (read-only)</h4>
            <p>Project owner / client শুধু progress, billing status ও milestone দেখেন — কোনো edit বা approval নেই।</p>
            <ul>
              <li>Project progress cards</li>
              <li>Invoice & payment status</li>
              <li>Upcoming milestones</li>
            </ul>
            <button type="button" class="btn btn-primary product-guide-go-btn" data-route="#guide-client">Client Guide ↓</button>
          </article>
        </div>
        <div class="product-guide-overview-grid">
          <div class="product-guide-overview-card product-guide-overview-card--blue">
            <h4>Projects</h4>
            <p>BOQ, milestones, progress, commercial (gov/private)</p>
            <button type="button" class="btn btn-secondary product-guide-go-btn product-guide-go-btn--subtle" data-route="/projects">যান →</button>
          </div>
          <div class="product-guide-overview-card product-guide-overview-card--green">
            <h4>Site Management</h4>
            <p>Diary, material, roster, payroll, settlement</p>
            <button type="button" class="btn btn-secondary product-guide-go-btn product-guide-go-btn--subtle" data-route="/site-incharge">যান →</button>
          </div>
          <div class="product-guide-overview-card product-guide-overview-card--orange">
            <h4>Procurement</h4>
            <p>MR → PM approve → PO → GRN</p>
            <button type="button" class="btn btn-secondary product-guide-go-btn product-guide-go-btn--subtle" data-route="/purchases">যান →</button>
          </div>
          <div class="product-guide-overview-card product-guide-overview-card--purple">
            <h4>Finance</h4>
            <p>Billing, accounting, supplier payments</p>
            <button type="button" class="btn btn-secondary product-guide-go-btn product-guide-go-btn--subtle" data-route="/billing">যান →</button>
          </div>
        </div>
      </section>

      <section class="product-guide-section" id="guide-rbac">
        <div class="product-guide-section-head">
          <span class="product-guide-section-label">RBAC & Approvals</span>
          <h3 class="product-guide-section-title">Who submits · Who approves · Where</h3>
          <p class="product-guide-section-sub">Production segregation of duties — role filter দিয়ে আপনার relevant row highlight হবে।</p>
        </div>
        <div id="product-guide-rbac-host">${renderRbacMatrix("all")}</div>
      </section>

      <section class="product-guide-section" id="guide-sitemap">
        <div class="product-guide-section-head">
          <span class="product-guide-section-label">Site Map</span>
          <h3 class="product-guide-section-title">Module → Tab → Action</h3>
          <p class="product-guide-section-sub">Search দিয়ে filter করুন। প্রতিটি leaf-এ route + role badge।</p>
        </div>
        <div class="product-guide-sitemap-toolbar">
          <input type="search" class="product-guide-sitemap-search" id="product-guide-sitemap-search" placeholder="Search module, route, action…" aria-label="Search site map" />
        </div>
        <div id="product-guide-sitemap-host">${renderSiteMapTree("all")}</div>
      </section>

      <section class="product-guide-section" id="guide-roles">
        <div class="product-guide-section-head">
          <span class="product-guide-section-label">Role Guide</span>
          <h3 class="product-guide-section-title">Role অনুযায়ী access, submit, approve</h3>
        </div>
        <div class="product-guide-roles-grid" id="product-guide-roles-host">
          ${ERP_ROLE_GUIDES.map((g) => renderRoleGuideCard(g, "all")).join("")}
        </div>
      </section>

      <section class="product-guide-section" id="guide-journeys">
        <div class="product-guide-section-head">
          <span class="product-guide-section-label">কাজের ধাপ</span>
          <h3 class="product-guide-section-title">Scenario journeys</h3>
          <p class="product-guide-section-sub">বাস্তব কাজের flow — step-by-step + deep link button।</p>
        </div>
        <div class="product-guide-journeys-grid" id="product-guide-journeys-host">
          ${ERP_JOURNEYS.map((j) => renderJourneyCard(j, "all")).join("")}
        </div>
      </section>

      <section class="product-guide-section" id="guide-client">
        <div class="product-guide-section-head">
          <span class="product-guide-section-label">Client Guide</span>
          <h3 class="product-guide-section-title">Buyer — Client Portal</h3>
          <p class="product-guide-section-sub">Client / project owner-এর জন্য read-only guide।</p>
        </div>
        ${renderClientGuideSection()}
      </section>

      <section class="product-guide-section" id="guide-features">
        <div class="product-guide-section-head">
          <span class="product-guide-section-label">Features</span>
          <h3 class="product-guide-section-title">Key capabilities</h3>
        </div>
        <div class="product-guide-features-grid">
          ${ERP_FEATURES.map(renderFeatureCard).join("")}
        </div>
        <footer class="product-guide-footer">
          <a href="presentation_documentation.html" target="_blank" rel="noopener" class="btn btn-secondary product-guide-doc-link">সম্পূর্ণ documentation (print)</a>
          <button type="button" class="btn btn-secondary product-guide-go-btn product-guide-go-btn--subtle" data-route="/settings?tab=rbac">Permissions matrix →</button>
        </footer>
      </section>
    </div>
  </div>`;
}

function bindGoButtons(root) {
  root.querySelectorAll(".product-guide-go-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const route = btn.dataset.route;
      if (!route) return;
      if (route.startsWith("#")) {
        const target = root.querySelector(route) || document.querySelector(route);
        target?.scrollIntoView({ behavior: "smooth", block: "start" });
        return;
      }
      navigateTo(route);
    });
  });
}

function applyRoleFilter(root, roleId) {
  const sitemapHost = root.querySelector("#product-guide-sitemap-host");
  const rolesHost = root.querySelector("#product-guide-roles-host");
  const journeysHost = root.querySelector("#product-guide-journeys-host");
  const rbacHost = root.querySelector("#product-guide-rbac-host");
  const searchInput = root.querySelector("#product-guide-sitemap-search");
  const searchQuery = searchInput?.value?.trim() || "";

  if (rbacHost) rbacHost.innerHTML = renderRbacMatrix(roleId);
  if (sitemapHost) sitemapHost.innerHTML = renderSiteMapTree(roleId, searchQuery);
  if (rolesHost) rolesHost.innerHTML = ERP_ROLE_GUIDES.map((g) => renderRoleGuideCard(g, roleId)).join("");
  if (journeysHost) journeysHost.innerHTML = ERP_JOURNEYS.map((j) => renderJourneyCard(j, roleId)).join("");

  bindGoButtons(root);
}

export function mountProductGuide(rootWidget) {
  const root = rootWidget.querySelector(".product-guide");
  if (!root) return () => {};

  let currentRole = "all";
  bindGoButtons(root);

  root.querySelectorAll(".product-guide-role-chip").forEach((chip) => {
    chip.addEventListener("click", () => {
      currentRole = chip.dataset.guideRole || "all";
      root.querySelectorAll(".product-guide-role-chip").forEach((c) => {
        c.classList.toggle("is-active", c.dataset.guideRole === currentRole);
      });
      applyRoleFilter(root, currentRole);
    });
  });

  const searchInput = root.querySelector("#product-guide-sitemap-search");
  if (searchInput) {
    let searchTimer = null;
    searchInput.addEventListener("input", () => {
      clearTimeout(searchTimer);
      searchTimer = setTimeout(() => applyRoleFilter(root, currentRole), 180);
    });
  }

  const navLinks = [...root.querySelectorAll(".product-guide-topnav__link")];
  const sections = ERP_GUIDE_SECTIONS.map((s) => root.querySelector(`#guide-${s.id}`)).filter(Boolean);
  const scrollRoot = root.closest(".rep-tab-panel") || root.closest(".reports-widget-body") || root;

  navLinks.forEach((link) => {
    link.addEventListener("click", (e) => {
      e.preventDefault();
      const id = link.dataset.guideSection;
      const target = root.querySelector(`#guide-${id}`);
      if (target) target.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  });

  let observer = null;
  if (sections.length && "IntersectionObserver" in window) {
    observer = new IntersectionObserver(
      (entries) => {
        const visible = entries.filter((e) => e.isIntersecting).sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (!visible) return;
        const id = visible.target.id.replace("guide-", "");
        navLinks.forEach((l) => l.classList.toggle("is-active", l.dataset.guideSection === id));
      },
      { root: scrollRoot === root ? null : scrollRoot, rootMargin: "-20% 0px -60% 0px", threshold: [0, 0.25, 0.5] }
    );
    sections.forEach((s) => observer.observe(s));
  }

  return () => {
    observer?.disconnect();
  };
}
