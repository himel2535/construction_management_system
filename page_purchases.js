import { create, listenList, listenProjectSub, updatePath } from "./svc_data.js";
import { readRef } from "./svc_tenant.js";
import { getCurrentUserId } from "./svc_auth.js";
import { createSupplierBill, mergeSupplierLists, createSupplier } from "./svc_supplier.js";
import { formatBDT, todayISO } from "./util_format.js";
import { showToast, actionFeedback } from "./cmp_toast.js";
import { setActiveNav } from "./cmp_layout.js";
import { setPageChrome } from "./cmp_header.js";
import { statusChip } from "./cmp_ui.js";
import { openCustFormDialog, escapeHtml } from "./cmp_projectTab.js";
import { buildProductCatalog, summarizePoItems } from "./util_procurement.js";
import { openPurchaseOrderModal, openGrnReceiveModal } from "./cmp_procurement.js";
import { deliveryStatusLabel, deliveryChipClass } from "./util_materialRequest.js";
import {
  submitMaterialRequest,
  approveMaterialRequest,
  syncMrDeliveryFromGrn,
} from "./svc_materialRequest.js";
import { approvePurchaseOrder } from "./svc_procurement.js";
import { postGrnToCentralStock } from "./svc_centralStock.js";
import { canPerformAction, upsertApprovalQueue, canApproveEntity } from "./svc_governance.js";
import { approvalAwaitingHint } from "./util_approvalResponsibility.js";
import {
  computeProcurementStats,
  renderProcurementKpiStripHtml,
  renderProcurementTabBar,
  purSection,
  PROCUREMENT_TABS,
} from "./cmp_procurementHub.js";
import { getRouteQuery } from "./util_route.js";

export function mountPurchases(container) {
  setActiveNav();
  setPageChrome({
    title: "Procurement",
    subtitle: "Material requests, purchase orders, and goods receipt.",
    showDateRange: false,
    quickActionLabel: "",
    onQuickAction: null,
  });

  const root = document.createElement("div");
  root.className = "purchases-page dashboard-page dashboard-mockup";
  root.innerHTML = `
    <div id="pur-kpi-host" class="dash-kpi-row"></div>
    <div class="toolbar-row projects-toolbar pur-context-bar" id="pur-context-bar">
      <label class="pur-project-label">Project
        <select id="pur-project" class="cust-form-input pur-project-select"><option value="">Select project</option></select>
      </label>
      <div class="cust-toolbar-btn-group pur-context-actions">
        <button type="button" class="btn btn-secondary btn-sm" id="pur-add-supplier">+ Add supplier</button>
      </div>
    </div>
    <div id="pur-tab-host"></div>
    <div id="pur-content-host" class="pur-content-host"></div>
  `;
  container.appendChild(root);

  const kpiHost = root.querySelector("#pur-kpi-host");
  const tabHost = root.querySelector("#pur-tab-host");
  const contentHost = root.querySelector("#pur-content-host");
  const projectSel = root.querySelector("#pur-project");

  let projects = [];
  let vendors = [];
  let suppliers = [];
  let supplierBillCount = 0;
  let selectedProject = "";
  let activeTab = (() => {
    const t = getRouteQuery().get("tab");
    return t && PROCUREMENT_TABS.some((x) => x.id === t) ? t : "requests";
  })();
  let mrs = [];
  let pos = [];
  let grns = [];
  let inventoryMaterials = [];
  let boqItems = [];
  let productsBySupplierId = {};
  let productCatalog = [];
  const poDraftLines = [];
  let productUnsubs = [];
  let activeGrnModalClose = null;
  let procurementModalOpen = false;

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

  function renderChrome() {
    const stats = computeProcurementStats(mrs, pos, grns, { hasProject: Boolean(selectedProject) });
    kpiHost.innerHTML = renderProcurementKpiStripHtml(stats);
    tabHost.innerHTML = "";
    tabHost.appendChild(
      renderProcurementTabBar(activeTab, (tab) => {
        activeTab = tab;
        render({ full: true });
      })
    );
  }

  function poDraftActionsCell(p) {
    if (p.status !== "draft") return "—";
    if (canApproveEntity("purchase_order")) {
      return `<button type="button" class="btn btn-primary btn-sm po-approve" data-id="${p.id}">Approve</button>`;
    }
    return `<span class="approval-awaiting-hint">${escapeHtml(approvalAwaitingHint("purchase_order"))}</span>`;
  }

  function buildPoTableRowsHtml() {
    return pos.length
      ? pos
          .map(
            (p) => `
            <tr>
              <td>${escapeHtml(p.vendorName || "—")}</td>
              <td class="pur-po-items-cell">${escapeHtml(summarizePoItems(p))}</td>
              <td class="cust-col-center">${formatBDT(p.amount)}</td>
              <td class="cust-col-center">${statusChip(p.status)}</td>
              <td class="cust-col-center proj-row-actions-cell">${poDraftActionsCell(p)}</td>
            </tr>`
          )
          .join("")
      : '<tr class="empty-row"><td colspan="5">No POs</td></tr>';
  }

  function openBuildPoModal() {
    if (!selectedProject) {
      showToast("Select a project first", "error");
      return;
    }
    poDraftLines.length = 0;
    procurementModalOpen = true;
    openPurchaseOrderModal({
      getCatalog: () => productCatalog,
      getSuppliers: () => suppliers,
      mrs,
      draftLines: poDraftLines,
      onCreatePo: async ({ lines, mrId, vendorId, vendorName, amount }) => {
        try {
          const now = Date.now();
          const poId = await create(`purchaseOrders/${selectedProject}`, {
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
            createdAt: now,
            updatedAt: now,
            createdBy: getCurrentUserId(),
          });
          await upsertApprovalQueue({
            entityType: "purchase_order",
            entityId: poId,
            projectId: selectedProject,
            title: `${vendorName || "PO"} · ${formatBDT(amount)}`,
            path: `purchaseOrders/${selectedProject}/${poId}`,
            status: "pending",
            submittedAt: now,
            submittedBy: getCurrentUserId(),
          });
          showToast("PO created (draft) — pending approval");
          render({ full: true });
        } catch (err) {
          showToast(err.message, "error");
          throw err;
        }
      },
      onClose: () => {
        poDraftLines.length = 0;
        procurementModalOpen = false;
      },
    });
  }

  function openCreateMrDialog() {
    const boqOpts = boqItems.map((b) => ({ value: b.id, label: b.item }));
    openCustFormDialog({
      title: "Create material request",
      subtitle: "Supplier-side requisition for this project",
      modalClass: "pur-mr-modal",
      submitLabel: "Create",
      values: { title: "", boqId: "", qty: "", amount: "" },
      sections: [
        {
          title: "Request",
          fields: [
            { name: "title", label: "MR title", type: "text", required: true },
            {
              name: "boqId",
              label: "BOQ line",
              type: "select",
              options: [{ value: "", label: "Optional BOQ line" }, ...boqOpts],
            },
            { name: "qty", label: "Quantity", type: "number" },
            { name: "amount", label: "Estimated amount (BDT)", type: "number", required: true },
          ],
        },
      ],
      onSave: async (data) => {
        await create(`materialRequests/${selectedProject}`, {
          title: String(data.title || "").trim(),
          boqId: data.boqId || "",
          qty: Number(data.qty) || 0,
          amount: Number(data.amount),
          status: "draft",
          requestType: "supplier",
          deliveryStatus: "requested",
          costCategory: "material",
          projectId: selectedProject,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          createdBy: getCurrentUserId(),
        });
        showToast("MR created");
        render();
      },
    });
  }

  function openAddSupplierDialog() {
    openCustFormDialog({
      title: "Add supplier",
      modalClass: "pur-mr-modal",
      submitLabel: "Add",
      values: { vendorName: "" },
      sections: [
        {
          title: "Supplier",
          fields: [{ name: "vendorName", label: "Supplier name", type: "text", required: true }],
        },
      ],
      onSave: async (data) => {
        await createSupplier({
          name: String(data.vendorName || "").trim(),
          type: "material",
          phone: "",
          address: "",
        });
        showToast("Supplier added");
      },
    });
  }

  function bindMrActions(host) {
    host.querySelectorAll(".mr-submit").forEach((btn) => {
      if (!canPerformAction("submit_material_request")) {
        btn.remove();
        return;
      }
      btn.onclick = async () => {
        try {
          await submitMaterialRequest(selectedProject, btn.dataset.id);
          await actionFeedback("mr_submitted", { title: mrs.find((m) => m.id === btn.dataset.id)?.title });
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });
    host.querySelectorAll(".mr-approve").forEach((btn) => {
      btn.onclick = async () => {
        if (!canPerformAction("approve_material_request")) {
          showToast("Only Project Manager can approve material requests", "error");
          return;
        }
        try {
          await approveMaterialRequest(selectedProject, btn.dataset.id);
          await actionFeedback("mr_approved");
        } catch (err) {
          showToast(err.message, "error");
        }
      };
    });
  }

  function renderRequestsTab() {
    const wrap = document.createElement("div");
    wrap.className = "pur-tab-panel";
    const tableHtml = `
      <div class="table-wrap projects-table-wrap">
        <table class="dash-table projects-table pur-mr-table" id="mr">
          <thead><tr><th>Title</th><th class="cust-col-center">Amount</th><th class="cust-col-center">Status</th><th class="cust-col-center">Delivery</th><th class="cust-col-center">Actions</th></tr></thead>
          <tbody>
            ${mrs.length
              ? mrs
                  .map((m) => {
                    const dClass = deliveryChipClass(m.deliveryStatus || "requested");
                    let actions = "";
                    if (m.status === "draft" && canPerformAction("submit_material_request")) {
                      actions += `<button type="button" class="btn btn-primary btn-sm mr-submit" data-id="${m.id}">Submit</button>`;
                    }
                    if (m.status === "submitted") {
                      if (canApproveEntity("material_request")) {
                        actions += `<button type="button" class="btn btn-primary btn-sm mr-approve" data-id="${m.id}">Approve</button>`;
                      } else {
                        actions += `<span class="approval-awaiting-hint">${escapeHtml(approvalAwaitingHint("material_request"))}</span>`;
                      }
                    }
                    const typeLabel =
                      m.requestType === "central" ? '<span class="chip">Central issue</span>' : "";
                    return `<tr>
                    <td>${escapeHtml(m.title)} ${typeLabel}</td>
                    <td class="cust-col-center">${formatBDT(m.amount)}</td>
                    <td class="cust-col-center">${statusChip(m.status)}</td>
                    <td class="cust-col-center"><span class="mr-delivery-chip mr-delivery-chip--${dClass}">${escapeHtml(deliveryStatusLabel(m.deliveryStatus || "requested"))}</span></td>
                    <td class="cust-col-center proj-row-actions-cell">${actions || "—"}</td>
                  </tr>`;
                  })
                  .join("")
              : '<tr class="empty-row"><td colspan="5">No material requests</td></tr>'}
          </tbody>
        </table>
      </div>`;
    const section = purSection(
      "Material requests",
      "Site requisition and approval",
      `<button type="button" class="btn btn-primary btn-sm" id="pur-create-mr">+ Create request</button>`,
      tableHtml
    );
    wrap.appendChild(section);
    section.querySelector("#pur-create-mr")?.addEventListener("click", () => openCreateMrDialog());
    bindMrActions(section);
    return wrap;
  }

  async function handlePoApprove(btn) {
    if (btn.disabled) return;
    if (!canPerformAction("approve_purchase_order")) {
      showToast("Only Project Manager can approve purchase orders", "error");
      return;
    }
    const po = pos.find((x) => x.id === btn.dataset.id);
    if (!po) {
      showToast("PO not found — refresh the page and try again.", "error");
      return;
    }
    showToast(
      `Approving PO for ${po.vendorName || "vendor"} (${formatBDT(po.amount)})…`,
      "info"
    );
    btn.disabled = true;
    btn.classList.add("is-loading");
    try {
      await approvePurchaseOrder(selectedProject, po.id);
      await actionFeedback("po_approved");
    } catch (err) {
      showToast(err.message || "Could not approve PO", "error");
    } finally {
      btn.disabled = false;
      btn.classList.remove("is-loading");
    }
  }

  function ensurePoApproveDelegation(host) {
    if (host.dataset.poApproveDelegated === "1") return;
    host.dataset.poApproveDelegated = "1";
    host.addEventListener("click", (e) => {
      const btn = e.target.closest(".po-approve");
      if (!btn || !host.contains(btn)) return;
      void handlePoApprove(btn);
    });
  }

  function renderOrdersTab() {
    const wrap = document.createElement("div");
    wrap.className = "pur-tab-panel pur-orders-panel";
    wrap.id = "pur-orders-panel";

    const buildPoBtn = canPerformAction("create_purchase_order")
      ? `<button type="button" class="btn btn-primary btn-sm" id="pur-build-po">+ Build PO</button>`
      : "";
    const section = purSection(
      "Purchase orders",
      "Product → supplier → qty; one supplier per PO",
      buildPoBtn,
      ""
    );
    const body = section.querySelector(".pur-section-body");

    const poTableWrap = document.createElement("div");
    poTableWrap.id = "pur-po-table-wrap";
    poTableWrap.className = "table-wrap projects-table-wrap";
    poTableWrap.innerHTML = `
      <table class="dash-table projects-table">
        <thead><tr><th>Vendor</th><th>Items</th><th class="cust-col-center">Amount</th><th class="cust-col-center">Status</th><th class="cust-col-center">Actions</th></tr></thead>
        <tbody id="pur-po-table-tbody">${buildPoTableRowsHtml()}</tbody>
      </table>`;
    body.appendChild(poTableWrap);

    section.querySelector("#pur-build-po")?.addEventListener("click", () => openBuildPoModal());
    wrap.appendChild(section);
    ensurePoApproveDelegation(wrap);
    return wrap;
  }

  async function submitGrnReceive(payload, po) {
    const poId = payload.poId;
    if (!po.vendorId) {
      showToast("PO has no supplier", "error");
      throw new Error("PO has no supplier");
    }
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
      { autoApprove: false, billCount: supplierBillCount }
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
      await actionFeedback("grn_received", {
        detail: posted.length
          ? `AP posted; ${posted.length} line(s) added to central stock`
          : "Supplier bill posted to AP",
      });
    } catch (stockErr) {
      showToast(
        `GRN saved but central stock incomplete: ${stockErr.message}. Add materials in Inventory → Materials.`,
        "error"
      );
    }
    render();
  }

  function purgeProcurementModals() {
    document.querySelectorAll(".pur-grn-modal, .pur-po-modal").forEach((el) => {
      el.closest(".cust-detail-overlay")?.remove();
    });
    if (!document.querySelector(".cust-detail-overlay")) {
      document.body.classList.remove("cust-detail-open");
    }
  }

  function openReceiveGrnModal() {
    if (!canPerformAction("post_central_grn")) {
      showToast("Only Procurement can receive goods (GRN)", "error");
      return;
    }
    if (!selectedProject) {
      showToast("Select a project first", "error");
      return;
    }
    const approvedPos = pos.filter((p) => p.status === "approved");
    if (!approvedPos.length) {
      showToast("No approved POs to receive against", "error");
      return;
    }
    purgeProcurementModals();
    activeGrnModalClose?.();
    procurementModalOpen = true;
    const { close } = openGrnReceiveModal({
      approvedPos,
      inventoryMaterials,
      getPriorGrnsForPo: (poId) => grns.filter((g) => g.poId === poId),
      receiptDateDefault: todayISO(),
      onReceive: submitGrnReceive,
      onClose: () => {
        activeGrnModalClose = null;
        procurementModalOpen = false;
      },
    });
    activeGrnModalClose = close;
  }

  function renderGrnTab() {
    const wrap = document.createElement("div");
    wrap.className = "pur-tab-panel";

    const grnBtn = canPerformAction("post_central_grn")
      ? `<button type="button" class="btn btn-green btn-sm" id="pur-receive-grn">+ Receive GRN</button>`
      : "";
    const section = purSection(
      "Goods receipt (GRN)",
      "Receive and post to accounts",
      grnBtn,
      ""
    );
    const body = section.querySelector(".pur-section-body");

    const grnTableWrap = document.createElement("div");
    grnTableWrap.className = "table-wrap projects-table-wrap";
    grnTableWrap.innerHTML = `
      <table class="dash-table projects-table" id="grn">
        <thead><tr><th>PO</th><th>Items</th><th class="cust-col-center">Amount</th><th>Date</th><th class="cust-col-center">Status</th><th class="cust-col-center">Central stock</th></tr></thead>
        <tbody>
          ${grns.length
            ? grns
                .map((g) => {
                  const po = pos.find((p) => p.id === g.poId);
                  const centralBadge = g.centralStockPosted
                    ? '<span class="central-grn-badge">Posted</span>'
                    : "—";
                  const items = g.receiveLines?.length
                    ? g.receiveLines.map((l) => `${escapeHtml(l.productName)} ×${l.qty}`).join(", ")
                    : "—";
                  return `<tr>
                    <td>${escapeHtml(po?.vendorName || g.poId)}</td>
                    <td>${items}</td>
                    <td class="cust-col-center">${formatBDT(g.amount)}</td>
                    <td>${escapeHtml(g.receiptDate || "")}</td>
                    <td class="cust-col-center">${statusChip(g.status)}</td>
                    <td class="cust-col-center">${centralBadge}</td>
                  </tr>`;
                })
                .join("")
            : '<tr class="empty-row"><td colspan="6">No GRNs</td></tr>'}
        </tbody>
      </table>`;
    body.appendChild(grnTableWrap);

    section.querySelector("#pur-receive-grn")?.addEventListener("click", () => openReceiveGrnModal());

    wrap.appendChild(section);
    return wrap;
  }

  function renderContentFull() {
    contentHost.innerHTML = "";
    if (!selectedProject) {
      contentHost.innerHTML = `<p class="proj-empty card pur-empty-hint">Select a project to manage procurement</p>`;
      return;
    }
    if (activeTab === "requests") contentHost.appendChild(renderRequestsTab());
    else if (activeTab === "orders") contentHost.appendChild(renderOrdersTab());
    else if (activeTab === "grn") contentHost.appendChild(renderGrnTab());
  }

  function render(opts = {}) {
    renderChrome();
    if (!selectedProject) {
      contentHost.innerHTML = `<p class="proj-empty card pur-empty-hint">Select a project to manage procurement</p>`;
      return;
    }
    if (!procurementModalOpen) {
      renderContentFull();
    }
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
      render({ full: true });
    } else {
      renderChrome();
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

  listenList("inventoryMaterials", (list) => {
    inventoryMaterials = list;
  });

  projectSel.onchange = () => {
    selectedProject = projectSel.value;
    poDraftLines.length = 0;
    poComposerExpanded = false;
    composerMounted = false;
    bindProject();
    render({ full: true });
  };

  root.querySelector("#pur-add-supplier")?.addEventListener("click", () => openAddSupplierDialog());

  bindSupplierProducts();
  render({ full: true });

  return {
    unmount: () => {
      activeGrnModalClose?.();
      activeGrnModalClose = null;
      procurementModalOpen = false;
      purgeProcurementModals();
      unsubMr();
      unsubPo();
      unsubGrn();
      unsubBoq();
      productUnsubs.forEach((u) => u());
      productUnsubs = [];
    },
  };
}
