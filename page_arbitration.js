/**
 * Release 4 — Disputes, arbitration, and offline sync console
 */
import { listenList } from "./svc_data.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { sectionCard, statusChip } from "./cmp_ui.js";
import { formatBDT } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import {
  createDispute,
  createArbitrationCase,
  createHearing,
  applyArbitrationTransition,
  canArbitrationTransition,
} from "./svc_arbitration.js";
import { canPerformAction } from "./svc_governance.js";
import { getActiveTenantId } from "./svc_tenant.js";
import { processOfflineQueue, resolveConflict, listenSyncHealth, isOnline } from "./svc_sync.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function arbButtons(row, collection) {
  const st = row.status || "draft";
  const btns = [];
  const next = {
    draft: "submitted",
    submitted: "review",
    review: "hearing",
    hearing: "award",
    award: "closed",
  };
  const to = next[st];
  const canAct = to === "submitted" ? canPerformAction("submit_dispute") : canPerformAction("arbitration_decide");
  if (to && canArbitrationTransition(st, to) && canAct) {
    btns.push(
      `<button type="button" class="btn btn-ghost btn-sm arb-btn" data-col="${collection}" data-id="${row.id}" data-to="${to}">${to}</button>`
    );
  }
  if (canArbitrationTransition(st, "closed") && st !== "closed" && canPerformAction("arbitration_decide")) {
    btns.push(
      `<button type="button" class="btn btn-ghost btn-sm arb-btn" data-col="${collection}" data-id="${row.id}" data-to="closed">close</button>`
    );
  }
  if (st === "hearing" && canArbitrationTransition(st, "award") && canPerformAction("arbitration_decide")) {
    btns.push(
      `<button type="button" class="btn btn-primary btn-sm arb-award" data-col="${collection}" data-id="${row.id}">award</button>`
    );
  }
  return btns.join(" ");
}

export function mountArbitration(container) {
  setActiveNav();
  setPageChrome({
    title: "Arbitration",
    subtitle: "Disputes, hearings, awards, and offline sync (Release 4).",
  });

  const root = document.createElement("div");
  root.className = "page-arbitration";
  container.appendChild(root);

  let disputes = [];
  let cases = [];
  let projects = [];
  let syncState = { ops: [], conflicts: [] };

  function render() {
    const tenant = getActiveTenantId();
    const online = isOnline();
    root.innerHTML = `
      <div class="r4-banner card card-pad">
        <span>Tenant: <strong>${escapeHtml(tenant)}</strong></span>
        <span>Network: ${online ? statusChip("on_time", "online") : statusChip("delayed", "offline")}</span>
        <span>Pending sync ops: <strong>${syncState.ops.filter((o) => o.status === "pending").length}</strong></span>
        <span>Open conflicts: <strong>${syncState.conflicts.filter((c) => c.status === "open").length}</strong></span>
      </div>
    `;

    const dispCard = sectionCard("Disputes", "Claim-linked dispute lifecycle");
    const dispBody = dispCard.querySelector(".section-card-body");
    const form = document.createElement("form");
    form.className = "form-grid proj-form";
    const projOpts = projects.map((p) => `<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
    form.innerHTML = `
      <select name="projectId"><option value="">Project</option>${projOpts}</select>
      <input name="title" placeholder="Dispute title *" required />
      <input name="claimRef" placeholder="Claim ref (e.g. cl_1)" />
      <input name="amount" type="number" placeholder="Amount (BDT)" />
      <input name="basis" placeholder="Legal basis" />
      <button type="submit" class="btn btn-primary btn-sm">Open dispute</button>
    `;
    form.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const fd = new FormData(form);
        await createDispute({
          title: fd.get("title"),
          claimRef: fd.get("claimRef") || "",
          amount: Number(fd.get("amount")) || 0,
          basis: fd.get("basis") || "",
          projectId: fd.get("projectId") || projects[0]?.id || "",
        });
        form.reset();
        showToast("Dispute created");
      } catch (err) {
        showToast(err.message, "error");
      }
    };

    dispBody.append(
      form,
      tableHtml(
        "disputes",
        disputes,
        ["Title", "Claim", "Amount", "Status", "Actions"],
        (d) => [
          escapeHtml(d.title),
          escapeHtml(d.claimRef || "—"),
          formatBDT(d.amount || 0),
          statusChip(d.status),
          arbButtons(d, "disputes"),
        ]
      )
    );

    const caseCard = sectionCard("Arbitration cases", "Cases opened from disputes");
    const caseBody = caseCard.querySelector(".section-card-body");
    const caseForm = document.createElement("form");
    caseForm.className = "form-grid proj-form";
    const dispOpts = disputes.map((d) => `<option value="${d.id}">${escapeHtml(d.title)}</option>`).join("");
    caseForm.innerHTML = `
      <select name="disputeId"><option value="">Dispute</option>${dispOpts}</select>
      <input name="title" placeholder="Case title *" required />
      <input name="arbitrator" placeholder="Arbitrator name" />
      <button type="submit" class="btn btn-secondary btn-sm">Open case</button>
    `;
    caseForm.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const fd = new FormData(caseForm);
        if (!fd.get("disputeId")) throw new Error("Select a dispute");
        await createArbitrationCase(fd.get("disputeId"), {
          title: fd.get("title"),
          arbitrator: fd.get("arbitrator") || "",
        });
        caseForm.reset();
        showToast("Case created");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
    const hearForm = document.createElement("form");
    hearForm.className = "form-grid proj-form";
    const caseOpts = cases.map((c) => `<option value="${c.id}">${escapeHtml(c.title)}</option>`).join("");
    hearForm.innerHTML = `
      <select name="caseId"><option value="">Case</option>${caseOpts}</select>
      <input name="hearingDate" type="date" />
      <input name="venue" placeholder="Venue" />
      <input name="notes" placeholder="Notes" />
      <button type="submit" class="btn btn-ghost btn-sm">Schedule hearing</button>
    `;
    hearForm.onsubmit = async (e) => {
      e.preventDefault();
      try {
        const fd = new FormData(hearForm);
        if (!fd.get("caseId")) throw new Error("Select a case");
        await createHearing(fd.get("caseId"), {
          hearingDate: fd.get("hearingDate") || null,
          venue: fd.get("venue") || "",
          notes: fd.get("notes") || "",
        });
        hearForm.reset();
        showToast("Hearing scheduled");
      } catch (err) {
        showToast(err.message, "error");
      }
    };

    caseBody.append(
      caseForm,
      hearForm,
      tableHtml(
        "arbitrationCases",
        cases,
        ["Title", "Dispute", "Arbitrator", "Status", "Actions"],
        (c) => [
          escapeHtml(c.title),
          escapeHtml(c.disputeId || "—"),
          escapeHtml(c.arbitrator || "—"),
          statusChip(c.status),
          arbButtons(c, "arbitrationCases"),
        ]
      )
    );

    const syncCard = sectionCard("Offline sync", "Queue replay and conflict resolution");
    const syncBody = syncCard.querySelector(".section-card-body");
    syncBody.innerHTML = `
      <div class="r4-sync-actions">
        <button type="button" class="btn btn-primary btn-sm" id="btn-sync-now">Process queue</button>
      </div>
      <h4 class="r3-subhead">Conflicts</h4>
      <div id="conflict-list"></div>
    `;
    const conflictHost = syncBody.querySelector("#conflict-list");
    const openConflicts = syncState.conflicts.filter((c) => c.status === "open");
    if (!openConflicts.length) {
      conflictHost.innerHTML = `<p class="proj-empty">No open conflicts</p>`;
    } else {
      conflictHost.innerHTML = openConflicts
        .map(
          (c) => `
        <div class="r4-conflict card card-pad">
          <p><strong>${escapeHtml(c.path)}</strong></p>
          <button type="button" class="btn btn-ghost btn-sm conf-resolve" data-id="${c.id}" data-res="keep_server">Keep server</button>
          <button type="button" class="btn btn-primary btn-sm conf-resolve" data-id="${c.id}" data-res="keep_client">Keep client</button>
        </div>`
        )
        .join("");
    }

    root.append(dispCard, caseCard, syncCard);
    wireArbButtons(root);
    root.querySelectorAll(".arb-award").forEach((btn) => {
      btn.onclick = async () => {
        const amount = prompt("Award amount (BDT):", "0");
        if (amount === null) return;
        const notes = prompt("Award notes:", "") || "";
        try {
          const col = btn.dataset.col;
          const row = (col === "disputes" ? disputes : cases).find((x) => x.id === btn.dataset.id);
          await applyArbitrationTransition({
            collection: col,
            entityId: btn.dataset.id,
            title: row?.title,
            to: "award",
            patchExtra: { awardAmount: Number(amount) || 0, awardNotes: notes, awardDate: new Date().toISOString().slice(0, 10) },
          });
          showToast("Award recorded");
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });
    syncBody.querySelector("#btn-sync-now").onclick = async () => {
      try {
        if (!canPerformAction("replay_offline")) throw new Error("Permission denied");
        const r = await processOfflineQueue();
        showToast(`Sync: ${r.applied} applied, ${r.conflicts} conflicts`);
      } catch (err) {
        showToast(err.message, "error");
      }
    };
    conflictHost.querySelectorAll(".conf-resolve").forEach((btn) => {
      btn.onclick = async () => {
        try {
          if (!canPerformAction("resolve_sync_conflict")) throw new Error("Permission denied");
          await resolveConflict(btn.dataset.id, btn.dataset.res);
          showToast("Conflict resolved");
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });
  }

  function tableHtml(col, rows, headers, mapRow) {
    const wrap = document.createElement("div");
    wrap.className = "table-wrap";
    wrap.innerHTML = `
      <table class="dash-table">
        <thead><tr>${headers.map((h) => `<th>${h}</th>`).join("")}</tr></thead>
        <tbody>
          ${rows.length
            ? rows
                .map((r) => `<tr>${mapRow(r).map((c) => `<td>${c}</td>`).join("")}</tr>`)
                .join("")
            : `<tr><td colspan="${headers.length}" class="proj-empty">No records</td></tr>`}
        </tbody>
      </table>
    `;
    return wrap;
  }

  function wireArbButtons(host) {
    if (!host) return;
    host.querySelectorAll(".arb-btn").forEach((btn) => {
      btn.onclick = async () => {
        try {
          const col = btn.dataset.col;
          const row = (col === "disputes" ? disputes : cases).find((x) => x.id === btn.dataset.id);
          await applyArbitrationTransition({
            collection: col,
            entityId: btn.dataset.id,
            title: row?.title,
            to: btn.dataset.to,
          });
          showToast(`Status: ${btn.dataset.to}`);
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });
  }

  const unsubP = listenList("projects", (list) => {
    projects = list;
    render();
  });
  const unsubD = listenList("disputes", (list) => {
    disputes = list;
    render();
  });
  const unsubC = listenList("arbitrationCases", (list) => {
    cases = list;
    render();
  });
  const unsubS = listenSyncHealth(({ ops, conflicts }) => {
    syncState = { ops: ops || [], conflicts: conflicts || [] };
    render();
  });

  render();

  return {
    unmount: () => {
      unsubP();
      unsubD();
      unsubC();
      unsubS();
    },
  };
}
