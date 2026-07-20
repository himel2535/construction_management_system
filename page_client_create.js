import {
  create,
  listenList,
  updatePath,
  propagateClientDenorm,
  syncClientPrimaryProject,
} from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { readRef } from "./svc_tenant.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import {
  validateClientForm,
  fillProjectSelect,
  isPortalAccessEnabled,
  buildClientAggregates,
} from "./page_customers.js";
import { formatBDT } from "./util_format.js";
import { getRouteQuery, navigateTo } from "./util_route.js";

const MAX_DOC_BYTES = 400 * 1024;

function getEditIdFromRoute() {
  return getRouteQuery().get("edit") || "";
}

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function syncGovContactVisibility(form) {
  const block = form.querySelector("#cust-gov-contact");
  if (!block) return;
  const isGov = form.clientType?.value === "government";
  block.hidden = !isGov;
  if (form.contactPersonName) form.contactPersonName.required = isGov;
}

function populateForm(form, client, projects) {
  form.name.value = client.name || "";
  form.phone.value = client.phone || "";
  form.email.value = client.email || "";
  form.address.value = client.address || "";
  form.nid.value = client.nid || "";
  form.contractRef.value = client.contractRef || "";
  form.status.value = client.status || "active";
  if (form.clientType) form.clientType.value = client.clientType || "private";
  if (form.contactPersonName) form.contactPersonName.value = client.contactPersonName || "";
  if (form.contactPersonDesignation) form.contactPersonDesignation.value = client.contactPersonDesignation || "";
  if (form.portalAccessEnabled) form.portalAccessEnabled.checked = isPortalAccessEnabled(client);
  fillProjectSelect(form.projectId, projects, client.projectId || "");
  syncGovContactVisibility(form);
}

function renderDocumentsList(host, documents, onRemove) {
  if (!documents.length) {
    host.innerHTML = `<p class="proj-empty cust-doc-empty">No documents attached yet.</p>`;
    return;
  }
  host.innerHTML = `<ul class="cust-doc-list">${documents
    .map(
      (d, i) => `
    <li class="cust-doc-item">
      <div>
        <strong>${escapeHtml(d.name || "Document")}</strong>
        <span class="text-muted"> · ${escapeHtml(d.docType || "file")}</span>
        ${d.fileUrl ? `<a href="${escapeHtml(d.fileUrl)}" target="_blank" rel="noopener" class="cust-doc-open">Open</a>` : ""}
      </div>
      <button type="button" class="btn btn-ghost btn-sm cust-doc-remove" data-idx="${i}">Remove</button>
    </li>`
    )
    .join("")}</ul>`;
  host.querySelectorAll(".cust-doc-remove").forEach((btn) => {
    btn.onclick = () => onRemove(Number(btn.dataset.idx));
  });
}

export function mountClientCreate(container) {
  setActiveNav();

  const editId = getEditIdFromRoute();
  const isEdit = !!editId;
  let editCreatedAt = null;
  let editCreatedBy = getCurrentUserId();
  let editPreviousName = "";
  let editPreviousProjectId = "";
  let allClients = [];
  let allProjects = [];
  let allInvoices = [];
  let documents = [];

  if (isEdit) {
    const existing = readRef(`clients/${editId}`);
    if (!existing) {
      showToast("Client not found", "error");
      navigateTo("/clients");
      return { unmount: () => {} };
    }
    editCreatedAt = existing.createdAt ?? Date.now();
    editCreatedBy = existing.createdBy ?? getCurrentUserId();
    editPreviousName = existing.name ?? "";
    editPreviousProjectId = existing.projectId || "";
    documents = Array.isArray(existing.documents) ? [...existing.documents] : [];
  }

  setPageChrome({
    title: isEdit ? "Edit Client" : "Add Client",
    subtitle: isEdit
      ? `Updating ${editPreviousName || "client record"}`
      : "Create a new client or project owner record.",
    showDateRange: false,
    quickActionLabel: null,
    onQuickAction: null,
  });

  const root = document.createElement("div");
  root.className = "customers-page customers-page--client-form dashboard-page dashboard-mockup";

  const formCard = document.createElement("section");
  formCard.className = "dash-widget dash-widget--client-form card cust-form-card is-focused";
  formCard.innerHTML = `<div class="dash-widget-body"></div>`;

  const formBody = formCard.querySelector(".dash-widget-body");
  const form = document.createElement("form");
  form.className = "cust-form cust-form--full cust-form--compact";
  form.innerHTML = `
    <div class="cust-form-shell">
      <div class="cust-form-row cust-form-row--top">
        <div class="cust-form-section">
          <div class="cust-form-section-head">
            <h4 class="cust-form-section-title">Client details</h4>
          </div>
          <div class="cust-form-section-body">
            <div class="cust-form-grid">
              <label class="cust-form-field">
                <span class="cust-form-label">Client type *</span>
                <select name="clientType" class="cust-form-input" aria-label="Client type" required>
                  <option value="private">Private</option>
                  <option value="government">Government</option>
                </select>
              </label>
              <label class="cust-form-field">
                <span class="cust-form-label">Name *</span>
                <input name="name" class="cust-form-input" placeholder="Client or company name" required />
              </label>
              <label class="cust-form-field">
                <span class="cust-form-label">Phone *</span>
                <input name="phone" class="cust-form-input" placeholder="Phone number" required />
              </label>
              <label class="cust-form-field">
                <span class="cust-form-label">Email</span>
                <input name="email" type="email" class="cust-form-input" placeholder="email@example.com" />
              </label>
              <label class="cust-form-field">
                <span class="cust-form-label">NID / National ID</span>
                <input name="nid" class="cust-form-input" placeholder="National ID" />
              </label>
              <label class="cust-form-field">
                <span class="cust-form-label">Contract / work order ref</span>
                <input name="contractRef" class="cust-form-input" placeholder="e.g. WO-2025-014" />
              </label>
              <label class="cust-form-field cust-form-field--full">
                <span class="cust-form-label">Address</span>
                <textarea name="address" class="cust-form-input cust-form-textarea" placeholder="Street, area, city" rows="2"></textarea>
              </label>
            </div>
            <div id="cust-gov-contact" class="cust-gov-contact" hidden>
              <div class="cust-form-section-head cust-form-section-head--sub">
                <h4 class="cust-form-section-title cust-form-section-title--sub">Government contact</h4>
              </div>
              <div class="cust-form-grid cust-form-grid--2">
                <label class="cust-form-field">
                  <span class="cust-form-label">Primary contact person name</span>
                  <input name="contactPersonName" class="cust-form-input" placeholder="Contact person name" />
                </label>
                <label class="cust-form-field">
                  <span class="cust-form-label">Contact designation</span>
                  <input name="contactPersonDesignation" class="cust-form-input" placeholder="e.g. Executive Engineer" />
                </label>
              </div>
            </div>
          </div>
        </div>
      </div>

      <div class="cust-form-row cust-form-row--bottom">
        <div class="cust-form-col cust-form-col--project">
          <div class="cust-form-section">
            <div class="cust-form-section-head">
              <h4 class="cust-form-section-title">Project &amp; access</h4>
            </div>
            <div class="cust-form-section-body">
              <div class="cust-form-grid cust-form-grid--access">
                <label class="cust-form-field">
                  <span class="cust-form-label">Link primary project</span>
                  <select name="projectId" id="cust-project" class="cust-form-input" aria-label="Link primary project">
                    <option value="">No project</option>
                  </select>
                </label>
                <label class="cust-form-field">
                  <span class="cust-form-label">Status</span>
                  <select name="status" class="cust-form-input" aria-label="Status">
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </label>
                <label class="cust-portal-check cust-form-field">
                  <input type="checkbox" name="portalAccessEnabled" checked />
                  <span>Enable client portal access</span>
                </label>
              </div>
            </div>
          </div>
        </div>

        <div class="cust-form-col cust-form-col--docs">
          <div class="cust-form-section cust-doc-section">
            <div class="cust-form-section-head">
              <h4 class="cust-form-section-title">Documents</h4>
            </div>
            <div class="cust-form-section-body">
              <div class="cust-doc-drop">
                <div class="cust-doc-upload-row">
                  <select id="cust-doc-type" class="cust-form-input" aria-label="Document type">
                    <option value="trade_license">Trade license</option>
                    <option value="authorization">Authorization letter</option>
                    <option value="nid">NID</option>
                    <option value="contract">Contract</option>
                    <option value="other">Other</option>
                  </select>
                  <input type="file" id="cust-doc-file" accept=".pdf,.png,.jpg,.jpeg,.webp,.doc,.docx" />
                  <button type="button" class="btn btn-ghost btn-sm" id="cust-doc-add">Attach file</button>
                </div>
              </div>
              <div id="cust-doc-list-host" class="cust-doc-list-host"></div>
            </div>
          </div>
        </div>
      </div>
    </div>

    <div class="cust-form-footer">
      <div class="cust-form-billing" id="cust-billing-summary"></div>
      <div class="form-actions cust-form-actions">
        <button type="submit" class="btn btn-primary" id="cust-submit">${isEdit ? "Save changes" : "Add client"}</button>
        <a href="/clients" class="btn btn-ghost">Cancel</a>
      </div>
    </div>
  `;
  formBody.appendChild(form);
  root.appendChild(formCard);
  container.appendChild(root);

  const projectSel = form.querySelector("#cust-project");
  const docListHost = form.querySelector("#cust-doc-list-host");
  const docFileInput = form.querySelector("#cust-doc-file");
  const docTypeSel = form.querySelector("#cust-doc-type");
  const billingSummary = form.querySelector("#cust-billing-summary");

  function refreshDocList() {
    renderDocumentsList(docListHost, documents, (idx) => {
      documents = documents.filter((_, i) => i !== idx);
      refreshDocList();
    });
    docListHost.classList.toggle("has-docs", documents.length > 0);
  }

  function refreshBillingSummary() {
    if (!billingSummary) return;
    if (!isEdit) {
      billingSummary.innerHTML = `
        <p class="cust-form-billing-hint">Outstanding balance will appear in the directory from unpaid invoices in Billing.</p>
      `;
      return;
    }
    const agg = buildClientAggregates(allProjects, allInvoices, allClients);
    const row = agg.byClient.get(editId) || { projectCount: 0, outstanding: 0, hasOverdue: false };
    const outLabel = row.outstanding > 0 ? formatBDT(row.outstanding) : "—";
    const outClass = row.outstanding > 0
      ? `cust-outstanding${row.hasOverdue ? " cust-outstanding--overdue" : ""}`
      : "cust-form-chip-value";
    billingSummary.innerHTML = `
      <div class="cust-form-chips">
        <div class="cust-form-chip">
          <span class="cust-form-chip-label">Linked projects</span>
          <span class="cust-form-chip-value">${row.projectCount}</span>
        </div>
        <div class="cust-form-chip">
          <span class="cust-form-chip-label">Outstanding</span>
          <span class="${outClass}" title="From Billing invoices">${escapeHtml(outLabel)}</span>
        </div>
      </div>
    `;
  }

  refreshDocList();
  refreshBillingSummary();

  form.clientType.onchange = () => syncGovContactVisibility(form);

  form.querySelector("#cust-doc-add").onclick = () => {
    const file = docFileInput.files?.[0];
    if (!file) {
      showToast("Choose a file to attach", "error");
      return;
    }
    if (file.size > MAX_DOC_BYTES) {
      showToast("File is too large (max 400KB for demo storage)", "error");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      documents.push({
        id: `doc_${Date.now()}`,
        name: file.name,
        docType: docTypeSel.value,
        fileUrl: reader.result,
        uploadedAt: Date.now(),
      });
      docFileInput.value = "";
      refreshDocList();
      showToast("Document attached");
    };
    reader.onerror = () => showToast("Could not read file", "error");
    reader.readAsDataURL(file);
  };

  function applyClientData() {
    if (isEdit) {
      const existing = readRef(`clients/${editId}`);
      if (existing) {
        documents = Array.isArray(existing.documents) ? [...existing.documents] : [];
        editPreviousProjectId = existing.projectId || editPreviousProjectId;
        populateForm(form, existing, allProjects);
        refreshDocList();
      }
    } else {
      fillProjectSelect(projectSel, allProjects);
      syncGovContactVisibility(form);
    }
    refreshBillingSummary();
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const validation = validateClientForm(form, allClients, isEdit ? editId : null, documents);
    if (!validation.ok) {
      showToast(validation.message, "error");
      return;
    }

    const now = Date.now();
    const payload = {
      ...validation.data,
      updatedAt: now,
      createdBy: isEdit ? editCreatedBy : getCurrentUserId(),
    };

    try {
      let clientId = editId;
      if (isEdit) {
        await updatePath(`clients/${editId}`, {
          ...payload,
          createdAt: editCreatedAt,
        });
        if (payload.name !== editPreviousName) {
          await propagateClientDenorm(editId, payload.name);
        }
        await syncClientPrimaryProject({
          clientId: editId,
          clientName: payload.name,
          projectId: payload.projectId || "",
          previousProjectId: editPreviousProjectId,
        });
        editPreviousProjectId = payload.projectId || "";
        showToast("Client updated");
      } else {
        clientId = await create("clients", {
          ...payload,
          createdAt: now,
        });
        await syncClientPrimaryProject({
          clientId,
          clientName: payload.name,
          projectId: payload.projectId || "",
          previousProjectId: "",
        });
        showToast("Client added");
      }
      navigateTo("/clients");
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const unsubClients = listenList("clients", (items) => {
    allClients = items;
    refreshBillingSummary();
  });

  const unsubProjects = listenList("projects", (items) => {
    allProjects = items;
    applyClientData();
  });

  const unsubInvoices = listenList("clientInvoices", (items) => {
    allInvoices = items;
    refreshBillingSummary();
  });

  if (isEdit && allProjects.length) applyClientData();

  return {
    unmount: () => {
      unsubClients();
      unsubProjects();
      unsubInvoices();
    },
  };
}
