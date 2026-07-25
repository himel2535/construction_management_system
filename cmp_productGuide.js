/** Product Guide — full-screen interactive site map in Settings */

import { navigateTo } from "./util_route.js";
import { ROLE_LABELS } from "./util_roles.js";
import {
  ERP_GUIDE_SECTIONS,
  ERP_ROLE_OPTIONS,
  ERP_HERO,
  ERP_SITE_TREE,
  ERP_JOURNEYS,
  ERP_ROLE_GUIDES,
  ERP_FEATURES,
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

function renderTreeNode(node, depth = 0) {
  const hasChildren = node.children?.length;
  const hasActions = node.actions?.length;
  const routeCode = node.route ? `<code class="product-guide-route">${escapeHtml(node.route)}</code>` : "";
  const hint = node.hint ? `<p class="product-guide-node-hint">${escapeHtml(node.hint)}</p>` : "";
  const roles = node.roles?.length ? `<div class="product-guide-node-roles">${rolesBadgesHtml(node.roles)}</div>` : "";
  const actionsHtml = hasActions ? `<div class="product-guide-actions">${node.actions.map(renderActionRow).join("")}</div>` : "";
  const childrenHtml = hasChildren
    ? `<div class="product-guide-tree-children">${node.children.map((c) => renderTreeNode(c, depth + 1)).join("")}</div>`
    : "";

  if (hasChildren || hasActions) {
    const open = depth < 1 ? " open" : "";
    return `<details class="product-guide-tree-node product-guide-sitemap-node--depth-${depth}" data-roles="${escapeHtml((node.roles || []).join(","))}"${open}>
      <summary class="product-guide-tree-summary">
        <span class="product-guide-tree-label">${escapeHtml(node.label)}</span>
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

function renderSiteMapTree(roleId) {
  const filtered = ERP_SITE_TREE.map((n) => filterTreeNode(n, roleId)).filter(Boolean);
  if (!filtered.length) {
    return `<p class="product-guide-empty">এই role-এর জন্য কোনো module নেই।</p>`;
  }
  return `<div class="product-guide-tree">${filtered.map((n) => renderTreeNode(n, 0)).join("")}</div>`;
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
  const access = guide.canAccess.map((a) => `<li>${escapeHtml(a)}</li>`).join("");
  const tasks = guide.dailyTasks
    .map(
      (t) => `<li class="product-guide-role-task">
        <span>${escapeHtml(t.text)}</span>
        <button type="button" class="btn btn-ghost product-guide-go-btn product-guide-go-btn--subtle" data-route="${escapeHtml(t.route)}">যান →</button>
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
        <p class="product-guide-role-panel__label">Access</p>
        <ul class="product-guide-role-list">${access}</ul>
      </div>
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
    <button type="button" class="btn btn-ghost product-guide-go-btn product-guide-go-btn--subtle" data-route="${escapeHtml(f.route)}">যান →</button>
  </article>`;
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
          <h3 class="product-guide-section-title">ERP overview</h3>
          <p class="product-guide-section-sub">Construction project management — planning থেকে billing পর্যন্ত এক জায়গায়।</p>
        </div>
        <div class="product-guide-overview-grid">
          <div class="product-guide-overview-card product-guide-overview-card--blue">
            <h4>Projects</h4>
            <p>BOQ, milestones, progress, commercial (gov/private)</p>
            <button type="button" class="btn btn-ghost product-guide-go-btn product-guide-go-btn--subtle" data-route="/projects">যান →</button>
          </div>
          <div class="product-guide-overview-card product-guide-overview-card--green">
            <h4>Site Management</h4>
            <p>Diary, material, roster, payroll, settlement</p>
            <button type="button" class="btn btn-ghost product-guide-go-btn product-guide-go-btn--subtle" data-route="/site-incharge">যান →</button>
          </div>
          <div class="product-guide-overview-card product-guide-overview-card--orange">
            <h4>Procurement</h4>
            <p>MR → PO → GRN → inventory flow</p>
            <button type="button" class="btn btn-ghost product-guide-go-btn product-guide-go-btn--subtle" data-route="/purchases">যান →</button>
          </div>
          <div class="product-guide-overview-card product-guide-overview-card--purple">
            <h4>Finance</h4>
            <p>Billing, accounting, supplier payments</p>
            <button type="button" class="btn btn-ghost product-guide-go-btn product-guide-go-btn--subtle" data-route="/billing">যান →</button>
          </div>
        </div>
      </section>

      <section class="product-guide-section" id="guide-sitemap">
        <div class="product-guide-section-head">
          <span class="product-guide-section-label">Site Map</span>
          <h3 class="product-guide-section-title">Module → Tab → Action</h3>
          <p class="product-guide-section-sub">প্রতিটি leaf-এ route + button name + role badge। <code>PROJECT_ID</code> placeholder hub link-এ replace করুন।</p>
        </div>
        <div id="product-guide-sitemap-host">${renderSiteMapTree("all")}</div>
      </section>

      <section class="product-guide-section" id="guide-roles">
        <div class="product-guide-section-head">
          <span class="product-guide-section-label">Role Guide</span>
          <h3 class="product-guide-section-title">Role অনুযায়ী access ও daily tasks</h3>
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

      <section class="product-guide-section" id="guide-features">
        <div class="product-guide-section-head">
          <span class="product-guide-section-label">Features</span>
          <h3 class="product-guide-section-title">Key capabilities</h3>
        </div>
        <div class="product-guide-features-grid">
          ${ERP_FEATURES.map(renderFeatureCard).join("")}
        </div>
        <footer class="product-guide-footer">
          <a href="presentation_documentation.html" target="_blank" rel="noopener" class="btn btn-ghost product-guide-doc-link">সম্পূর্ণ documentation (print)</a>
        </footer>
      </section>
    </div>
  </div>`;
}

function bindGoButtons(root) {
  root.querySelectorAll(".product-guide-go-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const route = btn.dataset.route;
      if (route) navigateTo(route);
    });
  });
}

function applyRoleFilter(root, roleId) {
  const sitemapHost = root.querySelector("#product-guide-sitemap-host");
  const rolesHost = root.querySelector("#product-guide-roles-host");
  const journeysHost = root.querySelector("#product-guide-journeys-host");

  if (sitemapHost) sitemapHost.innerHTML = renderSiteMapTree(roleId);
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
