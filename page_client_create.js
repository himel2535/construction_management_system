import { create, listenList, updatePath, propagateClientDenorm } from "./svc_data.js";
import { getCurrentUserId } from "./svc_auth.js";
import { readRef } from "./svc_tenant.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { validateClientForm, fillProjectSelect } from "./page_customers.js";

function getEditIdFromHash() {
  const hash = location.hash.slice(1) || "";
  const q = hash.indexOf("?");
  if (q === -1) return "";
  const params = new URLSearchParams(hash.slice(q + 1));
  return params.get("edit") || "";
}

function populateForm(form, client, projects) {
  form.name.value = client.name || "";
  form.phone.value = client.phone || "";
  form.email.value = client.email || "";
  form.address.value = client.address || "";
  form.nid.value = client.nid || "";
  form.contractRef.value = client.contractRef || "";
  form.status.value = client.status || "active";
  fillProjectSelect(form.projectId, projects, client.projectId || "");
}

export function mountClientCreate(container) {
  setActiveNav();

  const editId = getEditIdFromHash();
  const isEdit = !!editId;
  let editCreatedAt = null;
  let editCreatedBy = getCurrentUserId();
  let editPreviousName = "";
  let allClients = [];
  let allProjects = [];

  if (isEdit) {
    const existing = readRef(`clients/${editId}`);
    if (!existing) {
      showToast("Client not found", "error");
      location.hash = "#/clients";
      return { unmount: () => {} };
    }
    editCreatedAt = existing.createdAt ?? Date.now();
    editCreatedBy = existing.createdBy ?? getCurrentUserId();
    editPreviousName = existing.name ?? "";
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
  root.className = "customers-page dashboard-page dashboard-mockup";

  const topBar = document.createElement("div");
  topBar.className = "cust-create-top";
  topBar.innerHTML = `<a href="#/clients" class="btn btn-ghost btn-sm">Cancel</a>`;
  root.appendChild(topBar);

  const formCard = document.createElement("section");
  formCard.className = "dash-widget dash-widget--client-form card cust-form-card is-focused";
  formCard.innerHTML = `
    <div class="dash-widget-head">
      <h3 class="dash-widget-title">${isEdit ? "Edit Client" : "Add Client"}</h3>
      <p class="dash-widget-sub">${isEdit ? `Updating ${editPreviousName || "client"}` : "Create a new client record"}</p>
    </div>
    <div class="dash-widget-body"></div>
  `;

  const formBody = formCard.querySelector(".dash-widget-body");
  const form = document.createElement("form");
  form.className = "form-grid cust-form cust-form--full";
  form.innerHTML = `
    <input name="name" placeholder="Name *" required />
    <input name="phone" placeholder="Phone *" required />
    <input name="email" type="email" placeholder="Email" />
    <input name="nid" placeholder="NID / National ID" />
    <input name="contractRef" placeholder="Contract / work order ref" />
    <textarea name="address" placeholder="Address" rows="2"></textarea>
    <select name="projectId" id="cust-project" aria-label="Project">
      <option value="">No project</option>
    </select>
    <select name="status" aria-label="Status">
      <option value="active">Active</option>
      <option value="inactive">Inactive</option>
    </select>
    <div class="form-actions">
      <button type="submit" class="btn btn-primary" id="cust-submit">${isEdit ? "Save changes" : "Add client"}</button>
      <a href="#/clients" class="btn btn-dark">Cancel</a>
    </div>
  `;
  formBody.appendChild(form);
  root.appendChild(formCard);
  container.appendChild(root);

  const projectSel = form.querySelector("#cust-project");

  function applyClientData() {
    if (isEdit) {
      const existing = readRef(`clients/${editId}`);
      if (existing) populateForm(form, existing, allProjects);
    } else {
      fillProjectSelect(projectSel, allProjects);
    }
  }

  form.onsubmit = async (e) => {
    e.preventDefault();
    const validation = validateClientForm(form, allClients, isEdit ? editId : null);
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
      if (isEdit) {
        await updatePath(`clients/${editId}`, {
          ...payload,
          createdAt: editCreatedAt,
        });
        if (payload.name !== editPreviousName) {
          await propagateClientDenorm(editId, payload.name);
        }
        showToast("Client updated");
      } else {
        await create("clients", {
          ...payload,
          createdAt: now,
        });
        showToast("Client added");
      }
      location.hash = "#/clients";
    } catch (err) {
      showToast(err.message, "error");
    }
  };

  const unsubClients = listenList("clients", (items) => {
    allClients = items;
  });

  const unsubProjects = listenList("projects", (items) => {
    allProjects = items;
    applyClientData();
  });

  if (isEdit && allProjects.length) applyClientData();

  return {
    unmount: () => {
      unsubClients();
      unsubProjects();
    },
  };
}
