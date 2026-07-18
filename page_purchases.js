import { renderTable } from "./cmp_table.js";
import { create, listenList, listenProjectSub, updatePath } from "./svc_data.js";
import { readRef } from "./svc_tenant.js";

import { getCurrentUserId } from "./svc_auth.js";
import { checkBudgetForApproval } from "./svc_projectCost.js";
import { writeAuditLog } from "./svc_workflow.js";
import { createSupplierBill, mergeSupplierLists, createSupplier } from "./svc_supplier.js";
import { formatBDT, todayISO } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { sectionCard, statusChip } from "./cmp_ui.js";
import { buildProductCatalog, summarizePoItems } from "./util_procurement.js";
import { renderPurchaseOrderComposer, renderGrnReceiveForm } from "./cmp_procurement.js";
import { deliveryStatusLabel, deliveryChipClass } from "./util_materialRequest.js";
import {
  submitMaterialRequest,
  approveMaterialRequest,
  syncMrOnPoApprove,
  syncMrDeliveryFromGrn,
} from "./svc_materialRequest.js";
import { postGrnToCentralStock } from "./svc_centralStock.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function mountPurchases(container) {
  setActiveNav();
  setPageChrome({
    title: "Purchase",
    subtitle: "Material requests, purchase orders, and goods receipt (Release 2).",
    showDateRange: false,
    quickActionLabel: "",
    onQuickAction: null,
  });

  const root = document.createElement("div");
  root.className = "page-content purchases-page";

  const toolbar = document.createElement("div");
  toolbar.className = "card card-pad";
  toolbar.innerHTML = `
    <label>Project <select id="pur-project" class="toolbar-select"><option value="">Select project</option></select></label>
  `;

  const grid = document.createElement("div");
  grid.className = "grid-2";
  grid.id = "pur-grid";
  root.append(toolbar, grid);
  container.appendChild(root);

  let projects = [];
  let vendors = [];
  let suppliers = [];
  let supplierBillCount = 0;
  let selectedProject = "";
  let mrs = [];
  let pos = [];
  let grns = [];
  let boqItems = [];
  let productsBySupplierId = {};
  let productCatalog = [];
  const poDraftLines = [];
  let productUnsubs = [];

  const projectSel = toolbar.querySelector("#pur-project");

  function rebuildCatalog() {
    productCatalog = buildProductCatalog(suppliers, productsBySupplierId);
  }

  function bindSupplierProducts() {
    productUnsubs.forEach((u) => u());
    productUnsubs = [];
    productsBySupplierId = {};
    for (const s of suppliers) {
      if (s.status === "inactive") continue;
      const sid = s.id;
      const unsub = listenList(`supplierProducts/${sid}`, (list) => {
        productsBySupplierId[sid] = list;
        rebuildCatalog();
        if (selectedProject) render();
      });
      productUnsubs.push(unsub);
    }
    rebuildCatalog();
  }

  function render() {
    if (!selectedProject) {
      grid.innerHTML = `<p class="proj-empty card card-pad">Select a project to manage procurement</p>`;
      return;
    }

    const mrCard = sectionCard("Material Requests", "Site requisition");
    const mrBody = mrCard.querySelector(".section-card-body");
    const mrForm = document.createElement("form");
    mrForm.className = "form-grid proj-form-inline";
    const boqOpts = boqItems.map((b) => `<option value="${b.id}">${escapeHtml(b.item)}</option>`).join("");
    mrForm.innerHTML = `
      <input name="title" placeholder="MR title *" required />
      <select name="boqId"><option value="">BOQ line</option>${boqOpts}</select>
      <input name="qty" type="number" placeholder="Qty" />
      <input name="amount" type="number" placeholder="Est. amount *" required />
      <button type="submit" class="btn btn-primary btn-sm">Create MR</button>
    `;
    mrBody.append(mrForm);
    const mrTableWrap = document.createElement("div");
    mrTableWrap.className = "table-wrap";
    mrTableWrap.innerHTML = `
      <table class="dash-table" id="mr">
        <thead><tr><th>Title</th><th class="text-right">Amount</th><th>Status</th><th>Delivery</th><th>Actions</th></tr></thead>
        <tbody>
          ${mrs.length
            ? mrs
                .map((m) => {
                  const dClass = deliveryChipClass(m.deliveryStatus || "requested");
                  let actions = "";
                  if (m.status === "draft") {
                    actions += `<button type="button" class="btn btn-ghost btn-sm mr-submit" data-id="${m.id}">Submit</button>`;
                  }
                  if (m.status === "submitted") {
                    actions += `<button type="button" class="btn btn-primary btn-sm mr-approve" data-id="${m.id}">Approve</button>`;
                  }
                  const typeLabel =
                    m.requestType === "central"
                      ? '<span class="chip">Central issue</span>'
                      : "";
                  return `<tr>
                    <td>${escapeHtml(m.title)} ${typeLabel}</td>
                    <td class="text-right">${formatBDT(m.amount)}</td>
                    <td>${statusChip(m.status)}</td>
                    <td><span class="mr-delivery-chip mr-delivery-chip--${dClass}">${escapeHtml(deliveryStatusLabel(m.deliveryStatus || "requested"))}</span></td>
                    <td>${actions || "?"}</td>
                  </tr>`;
                })
                .join("")
            : '<tr class="empty-row"><td colspan="5">No material requests</td></tr>'}
        </tbody>
      </table>
    `;
    mrBody.appendChild(mrTableWrap);
    mrBody.querySelectorAll(".mr-submit").forEach((btn) => {
      btn.onclick = async () => {
        try {
          await submitMaterialRequest(selectedProject, btn.dataset.id);
          showToast("MR submitted");
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });
    mrBody.querySelectorAll(".mr-approve").forEach((btn) => {
      btn.onclick = async () => {
        const { canPerformAction } = await import("./svc_governance.js");
        if (!canPerformAction("approve")) {
          showToast("Permission denied", "error");
          return;
        }
        try {
          await approveMaterialRequest(selectedProject, btn.dataset.id);
          showToast("MR approved");
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });

    const poCard = sectionCard("Purchase Orders", "Product ? supplier ? qty; one supplier per PO");
    const poBody = poCard.querySelector(".section-card-body");

    const poComposer = renderPurchaseOrderComposer({
      catalog: productCatalog,
      mrs,
      draftLines: poDraftLines,
      onCreatePo: async ({ lines, mrId, vendorId, vendorName, amount }) => {
        try {
          await create(`purchaseOrders/${selectedProject}`, {
            mrId: mrId || "",
            vendorId,
            vendorName,
            amount,
            lines,
            itemSummary: summarizePoItems({ lines }),
            status: "draft",
            costCategory: "material",
            projectId: selectedProject,
            orderDate: todayISO(),
            createdAt: Date.now(),
            updatedAt: Date.now(),
            createdBy: getCurrentUserId(),
          });
          showToast("PO created (draft)");
        } catch (err) {
          showToast(err.message, "error");
        }
      },
    });
    poBody.appendChild(poComposer);

    const poTableWrap = document.createElement("div");
    poTableWrap.id = "po-table-wrap";
    poTableWrap.className = "table-wrap";
    poTableWrap.innerHTML = `
      <table class="dash-table">
        <thead><tr><th>Vendor</th><th>Items</th><th class="text-right">Amount</th><th>Status</th><th>Actions</th></tr></thead>
        <tbody>
          ${pos.length
            ? pos
                .map(
                  (p) => `
            <tr>
              <td>${escapeHtml(p.vendorName || "?")}</td>
              <td class="pur-po-items-cell">${escapeHtml(summarizePoItems(p))}</td>
              <td class="text-right">${formatBDT(p.amount)}</td>
              <td>${statusChip(p.status)}</td>
              <td>${p.status === "draft" ? `<button type="button" class="btn btn-ghost btn-sm po-approve" data-id="${p.id}">Approve</button>` : "?"}</td>
            </tr>`
                )
                .join("")
            : '<tr class="empty-row"><td colspan="5">No POs</td></tr>'}
        </tbody>
      </table>
    `;
    poBody.appendChild(poTableWrap);
    poTableWrap.querySelectorAll(".po-approve").forEach((btn) => {
      btn.onclick = async () => {
        const { canPerformAction } = await import("./svc_governance.js");
        if (!canPerformAction("approve")) {
          showToast("Permission denied: cannot approve PO", "error");
          return;
        }
        const po = pos.find((x) => x.id === btn.dataset.id);
        if (!po) return;
        const check = checkBudgetForApproval(selectedProject, po.amount);
        if (!check.ok) {
          showToast(check.message, "error");
          return;
        }
        const cur = readRef(`purchaseOrders/${selectedProject}/${po.id}`);
        await updatePath(`purchaseOrders/${selectedProject}/${po.id}`, {
          ...cur,
          status: "approved",
          updatedAt: Date.now(),
        });
        if (po.mrId) {
          await syncMrOnPoApprove(selectedProject, po.id, po.mrId);
        }
        await writeAuditLog({
          entityType: "purchaseOrder",
          entityId: po.id,
          action: "approve",
          diffSummary: `PO approved ${formatBDT(po.amount)}`,
        });
        showToast("PO approved");
      };
    });

    const grnCard = sectionCard("Goods Receipt (GRN)", "Receive and post to accounts");
    const grnBody = grnCard.querySelector(".section-card-body");
    const approvedPos = pos.filter((p) => p.status === "approved");
    const grnPoWrap = document.createElement("div");
    grnPoWrap.className = "pur-grn-po-select";
    grnPoWrap.innerHTML = `
      <label>Approved PO
        <select id="pur-grn-po" class="toolbar-select">
          <option value="">Select PO</option>
          ${approvedPos.map((p) => `<option value="${p.id}">${escapeHtml(p.vendorName || "?")} ? ${escapeHtml(summarizePoItems(p))} ? ${formatBDT(p.amount)}</option>`).join("")}
        </select>
      </label>
    `;
    const grnFormHost = document.createElement("div");
    grnFormHost.className = "pur-grn-form-host";
    grnBody.append(grnPoWrap, grnFormHost);
    const grnTableWrap = document.createElement("div");
    grnTableWrap.className = "table-wrap";
    grnTableWrap.innerHTML = `
          <table class="dash-table" id="grn">
            <thead><tr><th>PO</th><th>Items</th><th class="text-right">Amount</th><th>Date</th><th>Status</th><th>Central stock</th></tr></thead>
            <tbody>
              ${grns.length
                ? grns
                    .map((g) => {
                      const po = pos.find((p) => p.id === g.poId);
                      const centralBadge = g.centralStockPosted
                        ? '<span class="central-grn-badge">Posted</span>'
                        : "?";
                      return `<tr>
                        <td>${escapeHtml(po?.vendorName || g.poId)}</td>
                        <td>${g.receiveLines?.length ? g.receiveLines.map((l) => `${escapeHtml(l.productName)} ?${l.qty}`).join(", ") : "?"}</td>
                        <td class="text-right">${formatBDT(g.amount)}</td>
                        <td>${escapeHtml(g.receiptDate || "")}</td>
                        <td>${statusChip(g.status)}</td>
                        <td>${centralBadge}</td>
                      </tr>`;
                    })
                    .join("")
                : '<tr class="empty-row"><td colspan="6">No GRNs</td></tr>'}
            </tbody>
          </table>`;
    grnBody.appendChild(grnTableWrap);

    function mountGrnFormForPo(poId) {
      grnFormHost.innerHTML = "";
      if (!poId) return;
      const po = pos.find((p) => p.id === poId);
      if (!po) return;
      const priorGrns = grns.filter((g) => g.poId === poId);
      const grnForm = renderGrnReceiveForm(po, priorGrns, todayISO());
      grnForm.onsubmit = async (e) => {
        e.preventDefault();
        const payload = grnForm.getReceivePayload?.();
        if (!payload || payload.amount <= 0) {
          showToast("Enter receive quantity or amount", "error");
          return;
        }
        if (!po.vendorId) {
          showToast("PO has no supplier", "error");
          return;
        }
        try {
          const id = await create(`goodsReceipts/${selectedProject}`, {
            poId,
            amount: payload.amount,
            receiveLines: payload.receiveLines?.length ? payload.receiveLines : undefined,
            status: "received",
            costCategory: "material",
            projectId: selectedProject,
            receiptDate: payload.receiptDate || todayISO(),
            vendorId: po.vendorId,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          });
          const sup = suppliers.find((s) => s.id === po.vendorId);
          await createSupplierBill(
            {
              supplierId: po.vendorId,
              supplierName: po.vendorName || sup?.name || "",
              projectId: selectedProject,
              billDate: payload.receiptDate || todayISO(),
              amount: payload.amount,
              paymentTermsDays: sup?.paymentTermsDays ?? 30,
              costCategory: "material",
              narration: `GRN for PO ${po.billNo || poId}`,
              sourceType: "grn",
              sourceRef: { collection: "goodsReceipts", projectId: selectedProject, id },
            },
            { autoApprove: true, billCount: supplierBillCount }
          );
          const { refreshProjectCostCache } = await import("./svc_operations.js");
          await refreshProjectCostCache();
          await syncMrDeliveryFromGrn(selectedProject, poId);
          try {
            const posted = await postGrnToCentralStock(selectedProject, id, {
              receivedBy: getCurrentUserId(),
              lines: (payload.receiveLines || []).map((l) => ({
                ...l,
                date: payload.receiptDate || todayISO(),
                supplierId: po.vendorId,
                supplierName: po.vendorName || sup?.name || "",
              })),
              invoiceNo: po.billNo || poId,
            });
            showToast(
              posted.length
                ? `GRN received ? AP posted; ${posted.length} line(s) added to central stock`
                : "GRN received ? supplier bill posted to AP"
            );
          } catch (stockErr) {
            showToast(`GRN saved but central stock failed: ${stockErr.message}`, "error");
          }
          grnPoWrap.querySelector("#pur-grn-po").value = "";
          mountGrnFormForPo("");
        } catch (err) {
          showToast(err.message, "error");
        }
      };
      grnFormHost.appendChild(grnForm);
    }

    const grnPoSel = grnPoWrap.querySelector("#pur-grn-po");
    grnPoSel.onchange = () => mountGrnFormForPo(grnPoSel.value);
    if (grnPoSel.value) mountGrnFormForPo(grnPoSel.value);

    grid.innerHTML = "";
    grid.append(mrCard, poCard, grnCard);

    mrForm.onsubmit = async (e) => {
      e.preventDefault();
      try {
        await create(`materialRequests/${selectedProject}`, {
          title: mrForm.title.value.trim(),
          boqId: mrForm.boqId.value,
          qty: Number(mrForm.qty.value) || 0,
          amount: Number(mrForm.amount.value),
          status: "draft",
          requestType: "supplier",
          deliveryStatus: "requested",
          costCategory: "material",
          projectId: selectedProject,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: getCurrentUserId(),
        });
        mrForm.reset();
        showToast("MR created");
      } catch (err) {
        showToast(err.message, "error");
      }
    };
  }

  let unsubMr = () => {};
  let unsubPo = () => {};
  let unsubGrn = () => {};
  let unsubBoq = () => {};

  function bindProject() {
    unsubMr();
    unsubPo();
    unsubGrn();
    unsubBoq();
    if (!selectedProject) return;
    unsubMr = listenProjectSub(selectedProject, "materialRequests", (list) => {
      mrs = list;
      render();
    });
    unsubPo = listenProjectSub(selectedProject, "purchaseOrders", (list) => {
      pos = list;
      render();
    });
    unsubGrn = listenProjectSub(selectedProject, "goodsReceipts", (list) => {
      grns = list;
      render();
    });
    unsubBoq = listenProjectSub(selectedProject, "boqItems", (list) => {
      boqItems = list;
    });
  }

  listenList("projects", (list) => {
    projects = list;
    projectSel.innerHTML = '<option value="">Select project</option>';
    list.forEach((p) => {
      const o = document.createElement("option");
      o.value = p.id;
      o.textContent = p.name;
      if (p.id === selectedProject) o.selected = true;
      projectSel.appendChild(o);
    });
    if (!selectedProject && list.length) {
      selectedProject = list[0].id;
      projectSel.value = selectedProject;
      bindProject();
      render();
    }
  });

  listenList("vendors", (list) => {
    vendors = list;
    suppliers = mergeSupplierLists(vendors, suppliers);
    bindSupplierProducts();
    if (selectedProject) render();
  });

  listenList("suppliers", (list) => {
    suppliers = mergeSupplierLists(vendors, list);
    bindSupplierProducts();
    if (selectedProject) render();
  });

  listenList("supplierBills", (list) => {
    supplierBillCount = list.length;
  });

  const vendorForm = document.createElement("form");
  vendorForm.className = "card card-pad form-grid";
  vendorForm.style.marginTop = "1rem";
  vendorForm.innerHTML = `
    <input name="vendorName" placeholder="Supplier name" required />
    <button type="submit" class="btn btn-dark btn-sm">Add supplier</button>
  `;
  vendorForm.onsubmit = async (e) => {
    e.preventDefault();
    try {
      await createSupplier({
        name: vendorForm.vendorName.value.trim(),
        type: "material",
        phone: "",
        address: "",
      });
      vendorForm.reset();
      showToast("Supplier added");
    } catch (err) {
      showToast(err.message, "error");
    }
  };
  root.appendChild(vendorForm);

  projectSel.onchange = () => {
    selectedProject = projectSel.value;
    poDraftLines.length = 0;
    bindProject();
    render();
  };

  bindSupplierProducts();
  render();

  return {
    unmount: () => {
      unsubMr();
      unsubPo();
      unsubGrn();
      unsubBoq();
      productUnsubs.forEach((u) => u());
      productUnsubs = [];
    },
  };
}
