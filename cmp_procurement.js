/** Procurement UI — product picker, PO line composer, GRN receive lines */

import {
  searchProductPickerEntries,
  catalogEntryFor,
  calcLineAmount,
  normalizePoLine,
  sumPoLines,
  poLinesWithReceiveBalance,
  summarizePoItems,
} from "./util_procurement.js";
import { mapProductToInventoryMaterial } from "./util_stockLedger.js";
import { formatBDT } from "./util_format.js";
import { showToast } from "./cmp_toast.js";
import { icon } from "./cmp_icons.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Standard dismiss wiring for cust-detail modals (X, Cancel, overlay, Escape). */
function wireModalDismiss({ overlay, modal, close }) {
  const ac = new AbortController();
  const { signal } = ac;

  function onEscape(e) {
    if (e.key !== "Escape") return;
    if (!overlay.isConnected || !document.body.classList.contains("cust-detail-open")) return;
    close();
  }

  function dismissBtn(e) {
    e.preventDefault();
    e.stopPropagation();
    close();
  }

  overlay.addEventListener(
    "click",
    (e) => {
      if (e.target === overlay) close();
    },
    { signal }
  );
  modal.querySelector("[data-close]")?.addEventListener("click", dismissBtn, { signal });
  modal.querySelector("[data-cancel]")?.addEventListener("click", dismissBtn, { signal });
  modal.addEventListener("click", (e) => e.stopPropagation(), { signal });
  document.addEventListener("keydown", onEscape, { signal });

  return ac;
}

function finishModalClose(overlay, dismissAc, onClose) {
  dismissAc?.abort();
  overlay.remove();
  if (!document.querySelector(".cust-detail-overlay")) {
    document.body.classList.remove("cust-detail-open");
  }
  onClose?.();
}

/**
 * Product name typeahead.
 * @param {import("./util_procurement.js").CatalogEntry[]} catalog
 * @param {{ onSelect: (entry: import("./util_procurement.js").CatalogEntry) => void, placeholder?: string }} opts
 */
export function renderProductPicker(catalog, opts = {}) {
  const { onSelect, placeholder = "Select or type product…", getCatalog } = opts;
  const cat = () => (typeof getCatalog === "function" ? getCatalog() : catalog);
  const wrap = document.createElement("div");
  wrap.className = "pur-product-picker";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "cust-form-input pur-product-input";
  input.placeholder = placeholder;
  input.autocomplete = "off";
  input.setAttribute("role", "combobox");
  input.setAttribute("aria-expanded", "false");
  input.setAttribute("aria-haspopup", "listbox");

  const list = document.createElement("ul");
  list.className = "pur-product-suggestions";
  list.hidden = true;
  list.setAttribute("role", "listbox");

  wrap.append(input, list);

  let activeIdx = -1;
  let suggestions = [];

  function resolveSuggestions(query) {
    return searchProductPickerEntries(cat(), query, 500);
  }

  function hideList() {
    list.hidden = true;
    activeIdx = -1;
    input.setAttribute("aria-expanded", "false");
  }

  function showSuggestions(items) {
    suggestions = items;
    if (!items.length) {
      list.innerHTML = `<li class="pur-product-suggestion pur-product-suggestion--empty">No products — add under Suppliers → Products & Services</li>`;
      list.hidden = false;
      input.setAttribute("aria-expanded", "true");
      return;
    }
    list.innerHTML = items
      .map(
        (e, i) =>
          `<li class="pur-product-suggestion${i === activeIdx ? " is-active" : ""}" data-idx="${i}" role="option">${escapeHtml(e.name)}${e.code ? ` <span class="pur-product-code">${escapeHtml(e.code)}</span>` : ""}</li>`
      )
      .join("");
    list.hidden = false;
    input.setAttribute("aria-expanded", "true");
    list.querySelectorAll(".pur-product-suggestion[data-idx]").forEach((li) => {
      li.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        const idx = Number(li.dataset.idx);
        pick(suggestions[idx]);
      });
    });
  }

  function openSuggestionList() {
    showSuggestions(resolveSuggestions(input.value));
  }

  function pick(entry) {
    if (!entry) return;
    input.value = entry.name;
    hideList();
    onSelect?.(entry);
  }

  input.addEventListener("focus", () => {
    if (list.hidden) openSuggestionList();
  });

  input.addEventListener("click", () => {
    if (list.hidden) openSuggestionList();
  });

  input.addEventListener("input", () => {
    openSuggestionList();
  });

  input.addEventListener("keydown", (e) => {
    if (list.hidden) return;
    const items = list.querySelectorAll(".pur-product-suggestion[data-idx]");
    if (e.key === "ArrowDown") {
      e.preventDefault();
      activeIdx = Math.min(activeIdx + 1, suggestions.length - 1);
      showSuggestions(suggestions);
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      activeIdx = Math.max(activeIdx - 1, 0);
      showSuggestions(suggestions);
    } else if (e.key === "Enter" && activeIdx >= 0) {
      e.preventDefault();
      pick(suggestions[activeIdx]);
    } else if (e.key === "Escape") {
      hideList();
    }
  });

  document.addEventListener(
    "click",
    (e) => {
      if (!wrap.contains(e.target)) hideList();
    },
    true
  );

  return { el: wrap, input, reset: () => { input.value = ""; hideList(); } };
}

/**
 * Shared PO composer logic — inline page or modal form.
 * @param {{
 *   root: HTMLElement,
 *   variant?: 'inline' | 'modal',
 *   getCatalog?: () => import("./util_procurement.js").CatalogEntry[],
 *   getSuppliers?: () => object[],
 *   catalog?: import("./util_procurement.js").CatalogEntry[],
 *   suppliers?: object[],
 *   mrs: object[],
 *   draftLines: object[],
 *   onCreatePo: (payload: { lines: object[], mrId: string, vendorId: string, vendorName: string, amount: number }) => void | Promise<void>,
 *   onTotalChange?: (total: number) => void,
 * }} opts
 */
function initPurchaseOrderComposer(opts) {
  const {
    root,
    variant = "inline",
    catalog = [],
    suppliers = [],
    getCatalog,
    getSuppliers,
    mrs,
    draftLines,
    onCreatePo,
    onTotalChange,
  } = opts;
  const isModal = variant === "modal";
  const cat = () => (typeof getCatalog === "function" ? getCatalog() : catalog);
  const sups = () => (typeof getSuppliers === "function" ? getSuppliers() : suppliers);

  let selectedProductKey = "";
  let selectedProductName = "";
  let selectedSupplierId = draftLines[0]?.supplierId || "";
  const mrOpts = mrs.map((m) => `<option value="${m.id}">${escapeHtml(m.title)}</option>`).join("");

  if (isModal) {
    const addLineGrid = root.querySelector("[data-pur-add-line-grid]");
    addLineGrid.innerHTML = `
      <label class="cust-form-field cust-form-field--full pur-po-product-field">
        <span class="cust-form-label">Product</span>
        <div class="pur-product-picker-host"></div>
      </label>
      <label class="cust-form-field">
        <span class="cust-form-label">Supplier</span>
        <select name="lineSupplier" class="cust-form-input"><option value="">Select supplier</option></select>
      </label>
      <label class="cust-form-field">
        <span class="cust-form-label">Qty</span>
        <input name="lineQty" type="number" min="0" step="any" class="cust-form-input" placeholder="Qty" disabled />
      </label>
      <label class="cust-form-field">
        <span class="cust-form-label">Unit</span>
        <input name="lineUnit" type="text" class="cust-form-input" placeholder="Bag, pcs…" disabled />
      </label>
      <label class="cust-form-field">
        <span class="cust-form-label">Rate</span>
        <input name="lineRate" type="number" min="0" step="0.01" class="cust-form-input" placeholder="Rate" disabled />
      </label>
      <div class="cust-form-field pur-line-total-field">
        <span class="cust-form-label">Line total</span>
        <span class="pur-line-total-display">—</span>
      </div>
      <div class="cust-form-field pur-add-line-field">
        <span class="cust-form-label pur-add-line-label-spacer" aria-hidden="true">&nbsp;</span>
        <button type="button" class="btn btn-ghost pur-add-line-btn" disabled>Add line</button>
      </div>`;
    const optionsBody = root.querySelector("[data-pur-options-body]");
    optionsBody.innerHTML = `
      <div class="cust-form-grid cust-form-grid--2">
        <label class="cust-form-field cust-form-field--full">
          <span class="cust-form-label">Link MR (optional)</span>
          <select name="mrId" class="cust-form-input"><option value="">—</option>${mrOpts}</select>
        </label>
      </div>`;
  } else {
    root.className = "pur-po-composer";
    root.innerHTML = `
      <label class="cust-form-field cust-form-field--full pur-po-product-field">
        <span class="cust-form-label">Product</span>
        <div class="pur-product-picker-host"></div>
      </label>
      <div class="pur-po-line-grid">
        <label class="cust-form-field">
          <span class="cust-form-label">Supplier</span>
          <select name="lineSupplier" class="cust-form-input"><option value="">Select supplier</option></select>
        </label>
        <label class="cust-form-field">
          <span class="cust-form-label">Qty</span>
          <input name="lineQty" type="number" min="0" step="any" class="cust-form-input" placeholder="Qty" disabled />
        </label>
        <label class="cust-form-field">
          <span class="cust-form-label">Unit</span>
          <input name="lineUnit" type="text" class="cust-form-input" placeholder="Bag, pcs…" disabled />
        </label>
        <label class="cust-form-field">
          <span class="cust-form-label">Rate</span>
          <input name="lineRate" type="number" min="0" step="0.01" class="cust-form-input" placeholder="Rate" disabled />
        </label>
        <div class="cust-form-field pur-line-total-field">
          <span class="cust-form-label">Line total</span>
          <span class="pur-line-total-display">—</span>
        </div>
        <div class="cust-form-field pur-add-line-field">
          <span class="cust-form-label pur-add-line-label-spacer" aria-hidden="true">&nbsp;</span>
          <button type="button" class="btn btn-ghost btn-sm pur-add-line-btn" disabled>Add line</button>
        </div>
      </div>
      <div class="pur-lines-table-host"></div>
      <div class="pur-po-footer">
        <label class="cust-form-field pur-po-mr-field">
          <span class="cust-form-label">Link MR (optional)</span>
          <select name="mrId" class="cust-form-input"><option value="">—</option>${mrOpts}</select>
        </label>
        <span class="pur-po-total-label">PO total: <strong class="pur-po-total-value">${formatBDT(sumPoLines(draftLines))}</strong></span>
        <button type="button" class="btn btn-primary btn-sm pur-create-po-btn">Create PO</button>
      </div>`;
  }

  const scope = isModal ? root : root;
  const pickerHost = scope.querySelector(".pur-product-picker-host");
  const supplierSel = scope.querySelector('[name="lineSupplier"]');
  const qtyIn = scope.querySelector('[name="lineQty"]');
  const unitIn = scope.querySelector('[name="lineUnit"]');
  const rateIn = scope.querySelector('[name="lineRate"]');
  const totalDisplay = scope.querySelector(".pur-line-total-display");
  const addLineBtn = scope.querySelector(".pur-add-line-btn");
  const linesHost = isModal ? scope.querySelector("[data-pur-lines-host]") : scope.querySelector(".pur-lines-table-host");
  const linesSection = isModal ? scope.querySelector("[data-pur-lines-section]") : null;
  const totalValue = isModal ? null : scope.querySelector(".pur-po-total-value");
  const createBtn = isModal ? null : scope.querySelector(".pur-create-po-btn");
  const mrSel = scope.querySelector('[name="mrId"]');

  const picker = renderProductPicker(cat(), {
    getCatalog: cat,
    onSelect: (entry) => {
      selectedProductKey = entry.productKey;
      selectedProductName = entry.name || "";
      refreshSupplierOptions();
      applyCatalogRowToLineFields();
    },
  });
  pickerHost.appendChild(picker.el);

  function notifyTotalChange() {
    const total = sumPoLines(draftLines);
    if (totalValue) totalValue.textContent = formatBDT(total);
    onTotalChange?.(total);
  }

  function activeSuppliersList() {
    return (sups() || []).filter((s) => (s.status || "active") !== "inactive");
  }

  function currentCatalogRow() {
    if (!selectedProductKey || !selectedSupplierId) return null;
    return catalogEntryFor(cat(), selectedSupplierId, selectedProductKey);
  }

  function lineInputsReady() {
    return Boolean(selectedProductKey && selectedSupplierId);
  }

  function updateLineTotalPreview() {
    const q = qtyIn.value;
    const r = rateIn.value;
    if (q === "" && r === "") {
      totalDisplay.textContent = "—";
      return;
    }
    totalDisplay.textContent = formatBDT(calcLineAmount(q, r));
  }

  function applyCatalogRowToLineFields() {
    const row = currentCatalogRow();
    if (row) {
      unitIn.value = row.unit;
      rateIn.value = row.rate;
      unitIn.readOnly = true;
    } else if (lineInputsReady()) {
      unitIn.readOnly = false;
    } else {
      unitIn.value = "";
      rateIn.value = "";
      unitIn.readOnly = false;
    }
    refreshLineFieldsEnabled();
    updateLineTotalPreview();
  }

  function refreshLineFieldsEnabled() {
    const ready = lineInputsReady();
    qtyIn.disabled = !ready;
    rateIn.disabled = !ready;
    addLineBtn.disabled = !ready;
    unitIn.disabled = !ready;
    if (ready) {
      const row = currentCatalogRow();
      unitIn.readOnly = Boolean(row);
    }
  }

  function refreshSupplierOptions() {
    if (draftLines.length) {
      const lockedId = draftLines[0].supplierId;
      const lockedName = draftLines[0].supplierName || lockedId;
      supplierSel.innerHTML = `<option value="${escapeHtml(lockedId)}" selected>${escapeHtml(lockedName)}</option>`;
      supplierSel.disabled = true;
      selectedSupplierId = lockedId;
      applyCatalogRowToLineFields();
      return;
    }

    const active = activeSuppliersList();
    if (!active.length) {
      supplierSel.innerHTML = '<option value="">No suppliers — add in Suppliers</option>';
      supplierSel.disabled = true;
      selectedSupplierId = "";
      refreshLineFieldsEnabled();
      return;
    }

    supplierSel.innerHTML =
      '<option value="">Select supplier</option>' +
      active
        .map((s) => {
          const row = selectedProductKey ? catalogEntryFor(cat(), s.id, selectedProductKey) : null;
          const label = row
            ? `${s.name || s.id} — ${formatBDT(row.rate)}/${row.unit}`
            : s.name || s.id;
          const pid = row?.productId || "";
          return `<option value="${escapeHtml(s.id)}" data-product-id="${escapeHtml(pid)}">${escapeHtml(label)}</option>`;
        })
        .join("");
    supplierSel.disabled = false;
    if (selectedSupplierId && active.some((s) => s.id === selectedSupplierId)) {
      supplierSel.value = selectedSupplierId;
    } else {
      selectedSupplierId = supplierSel.value || "";
    }
    applyCatalogRowToLineFields();
  }

  supplierSel.addEventListener("change", () => {
    selectedSupplierId = supplierSel.value;
    applyCatalogRowToLineFields();
  });
  qtyIn.addEventListener("input", updateLineTotalPreview);
  rateIn.addEventListener("input", updateLineTotalPreview);

  function renderLinesTable() {
    if (linesSection) linesSection.hidden = !draftLines.length;
    if (!draftLines.length) {
      linesHost.innerHTML = "";
      notifyTotalChange();
      selectedSupplierId = "";
      refreshSupplierOptions();
      return;
    }
    selectedSupplierId = draftLines[0].supplierId;
    linesHost.innerHTML = `
      <div class="table-wrap projects-table-wrap">
      <table class="dash-table projects-table pur-line-table">
        <thead><tr><th>Product</th><th>Supplier</th><th class="text-right">Qty</th><th>Unit</th><th class="text-right">Rate</th><th class="text-right">Amount</th><th></th></tr></thead>
        <tbody>
          ${draftLines
            .map(
              (l, i) => `
            <tr>
              <td>${escapeHtml(l.productName)}</td>
              <td>${escapeHtml(l.supplierName)}</td>
              <td class="text-right">${l.qty}</td>
              <td>${escapeHtml(l.unit)}</td>
              <td class="text-right">${formatBDT(l.rate)}</td>
              <td class="text-right">${formatBDT(l.amount)}</td>
              <td><button type="button" class="btn btn-ghost btn-sm pur-remove-line" data-idx="${i}">Remove</button></td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
      </div>`;
    notifyTotalChange();
    linesHost.querySelectorAll(".pur-remove-line").forEach((btn) => {
      btn.onclick = () => {
        draftLines.splice(Number(btn.dataset.idx), 1);
        renderLinesTable();
        refreshSupplierOptions();
      };
    });
    refreshSupplierOptions();
  }

  addLineBtn.onclick = () => {
    if (!lineInputsReady()) {
      showToast("Select product and supplier", "error");
      return;
    }
    const qty = Number(qtyIn.value);
    if (!qty || qty <= 0) {
      showToast("Enter quantity", "error");
      return;
    }
    const row = currentCatalogRow();
    const supplierRow = activeSuppliersList().find((s) => s.id === selectedSupplierId);
    const supplierName = supplierRow?.name || supplierRow?.id || selectedSupplierId;

    if (draftLines.length && draftLines[0].supplierId !== selectedSupplierId) {
      showToast("One PO = one supplier. Remove lines or use another PO.", "error");
      return;
    }

    let line;
    if (row) {
      line = normalizePoLine({
        supplierProductId: row.productId,
        productName: row.name,
        productCode: row.code,
        supplierId: row.supplierId,
        supplierName: row.supplierName,
        unit: row.unit,
        qty,
        rate: Number(rateIn.value) || row.rate,
      });
    } else {
      const productName = (selectedProductName || picker.input.value || "").trim();
      const unit = String(unitIn.value || "").trim();
      const rate = Number(rateIn.value);
      if (!productName) {
        showToast("Select a product from the list", "error");
        return;
      }
      if (!unit) {
        showToast("Enter unit (e.g. Bag, pcs)", "error");
        return;
      }
      if (!rate || rate <= 0) {
        showToast("Enter rate", "error");
        return;
      }
      line = normalizePoLine({
        supplierProductId: "",
        productName,
        productCode: "",
        supplierId: selectedSupplierId,
        supplierName,
        unit,
        qty,
        rate,
      });
    }

    draftLines.push(line);
    picker.reset();
    selectedProductKey = "";
    selectedProductName = "";
    supplierSel.value = "";
    qtyIn.value = "";
    unitIn.value = "";
    rateIn.value = "";
    totalDisplay.textContent = "—";
    refreshSupplierOptions();
    renderLinesTable();
  };

  async function submitCreatePo() {
    if (!draftLines.length) {
      showToast("Add at least one line", "error");
      return false;
    }
    const vendorId = draftLines[0].supplierId;
    const vendorName = draftLines[0].supplierName;
    const amount = sumPoLines(draftLines);
    await onCreatePo({
      lines: draftLines.map((l) => ({ ...l })),
      mrId: mrSel.value,
      vendorId,
      vendorName,
      amount,
    });
    draftLines.length = 0;
    renderLinesTable();
    picker.reset();
    mrSel.value = "";
    return true;
  }

  if (createBtn) {
    createBtn.onclick = () => {
      void submitCreatePo();
    };
  }

  renderLinesTable();
  refreshSupplierOptions();
  notifyTotalChange();

  return {
    el: isModal ? root : root,
    submitCreatePo,
    resetComposer: () => {
      draftLines.length = 0;
      picker.reset();
      mrSel.value = "";
      renderLinesTable();
      refreshSupplierOptions();
    },
  };
}

/**
 * Full PO create composer with line items (inline layout).
 * @param {{
 *   getCatalog?: () => import("./util_procurement.js").CatalogEntry[],
 *   getSuppliers?: () => object[],
 *   catalog?: import("./util_procurement.js").CatalogEntry[],
 *   suppliers?: object[],
 *   mrs: object[],
 *   draftLines: object[],
 *   onCreatePo: (payload: { lines: object[], mrId: string, vendorId: string, vendorName: string, amount: number }) => void | Promise<void>,
 *   variant?: 'inline' | 'modal',
 *   onTotalChange?: (total: number) => void,
 * }} opts
 */
export function renderPurchaseOrderComposer(opts) {
  const wrap = document.createElement("div");
  const { el } = initPurchaseOrderComposer({ ...opts, root: wrap, variant: opts.variant || "inline" });
  return el;
}

/**
 * Open PO builder in standard cust-detail-modal popup.
 * @param {{
 *   getCatalog?: () => import("./util_procurement.js").CatalogEntry[],
 *   getSuppliers?: () => object[],
 *   mrs: object[],
 *   draftLines: object[],
 *   onCreatePo: (payload: { lines: object[], mrId: string, vendorId: string, vendorName: string, amount: number }) => void | Promise<void>,
 *   onClose?: () => void,
 * }} opts
 */
export function openPurchaseOrderModal(opts) {
  const { mrs, draftLines, onCreatePo, onClose } = opts;
  const titleId = `pur-po-modal-title-${Math.random().toString(36).slice(2, 9)}`;

  const overlay = document.createElement("div");
  overlay.className = "cust-detail-overlay";
  overlay.setAttribute("role", "presentation");

  const modal = document.createElement("div");
  modal.className = "cust-detail-modal card pur-po-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", titleId);
  modal.setAttribute("tabindex", "-1");
  modal.innerHTML = `
    <div class="cust-detail-head">
      <div class="cust-detail-title">
        <strong id="${titleId}">Build purchase order</strong>
        <span class="text-muted">Product → supplier → qty; one supplier per PO</span>
      </div>
      <button type="button" class="icon-btn icon-btn--sm cust-detail-close" data-close aria-label="Close">${icon("x", { size: 16 })}</button>
    </div>
    <form class="cust-form cust-form--compact pur-po-modal-form">
      <div class="cust-form-shell">
        <div class="cust-form-row">
          <div class="cust-form-section">
            <div class="cust-form-section-head">
              <h4 class="cust-form-section-title">Add line</h4>
            </div>
            <div class="cust-form-section-body pur-po-modal-add-body">
              <div class="cust-form-grid cust-form-grid--2" data-pur-add-line-grid></div>
            </div>
          </div>
        </div>
        <div class="cust-form-row pur-po-lines-section" hidden data-pur-lines-section>
          <div class="cust-form-section">
            <div class="cust-form-section-head">
              <h4 class="cust-form-section-title">Added lines</h4>
            </div>
            <div class="cust-form-section-body" data-pur-lines-host></div>
          </div>
        </div>
        <div class="cust-form-row">
          <div class="cust-form-section">
            <div class="cust-form-section-head">
              <h4 class="cust-form-section-title">Options</h4>
            </div>
            <div class="cust-form-section-body" data-pur-options-body></div>
          </div>
        </div>
      </div>
      <div class="cust-form-footer">
        <span class="pur-po-modal-total">PO total: <strong class="pur-po-modal-total-value">${formatBDT(0)}</strong></span>
        <div class="form-actions cust-form-actions">
          <button type="submit" class="btn btn-primary">Create PO</button>
          <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
        </div>
      </div>
    </form>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  document.body.classList.add("cust-detail-open");

  let dismissAc = null;
  function close() {
    finishModalClose(overlay, dismissAc, onClose);
  }
  dismissAc = wireModalDismiss({ overlay, modal, close });
  overlay._purDismiss = close;

  const form = modal.querySelector(".pur-po-modal-form");
  const totalEl = modal.querySelector(".pur-po-modal-total-value");

  const composer = initPurchaseOrderComposer({
    root: form,
    variant: "modal",
    getCatalog: opts.getCatalog,
    getSuppliers: opts.getSuppliers,
    mrs,
    draftLines,
    onTotalChange: (total) => {
      totalEl.textContent = formatBDT(total);
    },
    onCreatePo: async (payload) => {
      await onCreatePo(payload);
    },
  });

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    try {
      const ok = await composer.submitCreatePo();
      if (ok) close();
    } catch {
      /* caller shows toast; keep modal open */
    }
  });

  modal.focus({ preventScroll: true });

  return { close, composer };
}

function grnMappingBadge(productName, inventoryMaterials) {
  const material = mapProductToInventoryMaterial(productName, inventoryMaterials);
  if (material) {
    return `<span class="pur-grn-map-badge pur-grn-map-ok">Stock OK</span>`;
  }
  return `<span class="pur-grn-map-badge pur-grn-map-warn">Not in inventory</span>`;
}

/**
 * GRN receive composer — modal or inline.
 * @param {{
 *   root: HTMLElement,
 *   variant?: 'modal' | 'inline',
 *   approvedPos: object[],
 *   getPriorGrnsForPo: (poId: string) => object[],
 *   inventoryMaterials?: object[],
 *   receiptDateDefault: string,
 *   preselectedPoId?: string,
 *   onTotalChange?: (total: number) => void,
 *   onSubmitBlockedChange?: (blocked: boolean) => void,
 * }} opts
 */
function initGrnReceiveComposer(opts) {
  const {
    root,
    variant = "inline",
    approvedPos,
    getPriorGrnsForPo,
    inventoryMaterials = [],
    receiptDateDefault,
    preselectedPoId = "",
    onTotalChange,
    onSubmitBlockedChange,
  } = opts;
  const isModal = variant === "modal";

  let selectedPoId = preselectedPoId || "";
  let balanceLines = [];
  let selectedPo = null;

  if (isModal) {
    const poBody = root.querySelector("[data-pur-grn-po-body]");
    poBody.innerHTML = `
      <div class="cust-form-grid cust-form-grid--2">
        <label class="cust-form-field cust-form-field--full">
          <span class="cust-form-label">Approved PO</span>
          <select name="poId" class="cust-form-input" data-pur-grn-po-select required>
            <option value="">Select PO</option>
            ${approvedPos
              .map(
                (p) =>
                  `<option value="${escapeHtml(p.id)}" ${p.id === preselectedPoId ? "selected" : ""}>${escapeHtml(p.vendorName || "—")} · ${escapeHtml(summarizePoItems(p))} · ${formatBDT(p.amount)}</option>`
              )
              .join("")}
          </select>
        </label>
        <div class="cust-form-field cust-form-field--full pur-grn-po-summary" data-pur-grn-po-summary hidden></div>
      </div>`;
    root.querySelector("[data-pur-grn-receipt-body]").innerHTML = `
      <div class="cust-form-grid cust-form-grid--2">
        <label class="cust-form-field">
          <span class="cust-form-label">Receipt date</span>
          <input type="date" name="receiptDate" class="cust-form-input" value="${escapeHtml(receiptDateDefault)}" required />
        </label>
      </div>`;
  }

  const poSel = isModal ? root.querySelector("[data-pur-grn-po-select]") : null;
  const linesSection = isModal ? root.querySelector("[data-pur-grn-lines-section]") : null;
  const linesHost = isModal ? root.querySelector("[data-pur-grn-lines-host]") : root;
  const amountSection = isModal ? root.querySelector("[data-pur-grn-amount-section]") : null;
  const mapWarning = isModal ? root.querySelector("[data-pur-grn-map-warning]") : null;
  const totalEl = isModal
    ? root.closest(".pur-grn-modal")?.querySelector(".pur-grn-modal-total-value")
    : root.querySelector(".pur-grn-total-value");
  const submitBtn = isModal ? root.closest(".pur-grn-modal")?.querySelector('[type="submit"]') : null;

  function notifyTotal(total) {
    if (totalEl) totalEl.textContent = formatBDT(total);
    onTotalChange?.(total);
  }

  function hasUnmappedReceiveLines(receiveLines) {
    return receiveLines.some(
      (l) => l.qty > 0 && !mapProductToInventoryMaterial(l.productName, inventoryMaterials)
    );
  }

  function updateSubmitBlocked() {
    if (!isModal) return;
    const payload = getReceivePayload();
    const blocked =
      !selectedPo ||
      Boolean(payload?.receiveLines?.length && hasUnmappedReceiveLines(payload.receiveLines));
    if (mapWarning) {
      const unmappedBlocked = Boolean(
        payload?.receiveLines?.length && hasUnmappedReceiveLines(payload.receiveLines)
      );
      if (unmappedBlocked) {
        const names = payload.receiveLines
          .filter((l) => l.qty > 0 && !mapProductToInventoryMaterial(l.productName, inventoryMaterials))
          .map((l) => l.productName)
          .join(", ");
        mapWarning.hidden = false;
        mapWarning.textContent = `${names} not found in Inventory → Materials. Add the material there before receiving.`;
      } else {
        mapWarning.hidden = true;
        mapWarning.textContent = "";
      }
    }
    if (submitBtn) submitBtn.disabled = blocked;
    onSubmitBlockedChange?.(blocked);
  }

  function renderLinesForPo(po) {
    selectedPo = po;
    balanceLines = po?.lines?.length ? poLinesWithReceiveBalance(po, getPriorGrnsForPo(po.id)) : [];
    const hasLines = balanceLines.length > 0;

    if (isModal) {
      const summaryEl = root.querySelector("[data-pur-grn-po-summary]");
      if (summaryEl) {
        if (po) {
          summaryEl.hidden = false;
          summaryEl.innerHTML = `<span class="text-muted">${escapeHtml(po.vendorName || "—")} · ${escapeHtml(summarizePoItems(po))} · ${formatBDT(po.amount)}</span>`;
        } else {
          summaryEl.hidden = true;
          summaryEl.innerHTML = "";
        }
      }
      if (linesSection) linesSection.hidden = !hasLines;
      if (amountSection) amountSection.hidden = hasLines || !po;
    }

    if (!po) {
      if (isModal && linesHost) linesHost.innerHTML = "";
      notifyTotal(0);
      updateSubmitBlocked();
      return;
    }

    if (hasLines) {
      const tableHtml = `
        <p class="pur-grn-hint">Enter received quantity per line (max = remaining on PO).</p>
        <div class="table-wrap projects-table-wrap">
          <table class="dash-table projects-table pur-grn-line-table">
            <thead><tr><th>Product</th><th class="text-right">Ordered</th><th class="text-right">Received</th><th class="text-right">Receive now</th><th>Inventory</th></tr></thead>
            <tbody>
              ${balanceLines
                .map(
                  (l, i) => `
                <tr data-line-idx="${i}">
                  <td>${escapeHtml(l.productName)}</td>
                  <td class="text-right">${l.orderedQty} ${escapeHtml(l.unit)}</td>
                  <td class="text-right">${l.receivedQty}</td>
                  <td class="text-right">
                    <input type="number" min="0" max="${l.remainingQty}" step="any" class="cust-form-input pur-grn-qty" data-idx="${i}" value="${l.remainingQty > 0 ? l.remainingQty : 0}" ${l.remainingQty <= 0 ? "disabled" : ""} />
                  </td>
                  <td>${grnMappingBadge(l.productName, inventoryMaterials)}</td>
                </tr>`
                )
                .join("")}
            </tbody>
          </table>
        </div>`;

      if (isModal) {
        linesHost.innerHTML = tableHtml;
      } else {
        root.innerHTML = `
          ${tableHtml}
          <div class="pur-grn-actions">
            <label>Receipt date <input type="date" name="receiptDate" value="${escapeHtml(receiptDateDefault)}" /></label>
            <span class="pur-grn-total">Receive total: <strong class="pur-grn-total-value">—</strong></span>
            <button type="submit" class="btn btn-green btn-sm">Receive GRN</button>
          </div>`;
      }

      const scope = isModal ? linesHost : root;
      scope.querySelectorAll(".pur-grn-qty").forEach((inp) => {
        inp.addEventListener("input", () => {
          updateGrnTotal(scope);
          updateSubmitBlocked();
        });
      });
      updateGrnTotal(scope);
      updateSubmitBlocked();
    } else {
      if (isModal) {
        amountSection.innerHTML = `
          <div class="cust-form-section">
            <div class="cust-form-section-head"><h4 class="cust-form-section-title">Amount</h4></div>
            <div class="cust-form-section-body">
              <label class="cust-form-field cust-form-field--full">
                <span class="cust-form-label">GRN amount</span>
                <input name="amount" type="number" min="0" step="0.01" class="cust-form-input" placeholder="Enter amount" required />
              </label>
            </div>
          </div>`;
        amountSection.hidden = false;
        amountSection.querySelector('[name="amount"]')?.addEventListener("input", () => {
          const val = Number(amountSection.querySelector('[name="amount"]')?.value) || 0;
          notifyTotal(val);
        });
      } else {
        root.innerHTML = `
          <div class="pur-grn-actions pur-grn-actions--simple">
            <input name="amount" type="number" placeholder="GRN amount *" required />
            <input name="receiptDate" type="date" value="${escapeHtml(receiptDateDefault)}" />
            <button type="submit" class="btn btn-green btn-sm">Receive GRN</button>
          </div>`;
      }
      notifyTotal(0);
      updateSubmitBlocked();
    }
  }

  function updateGrnTotal(scope) {
    let sum = 0;
    scope.querySelectorAll(".pur-grn-qty").forEach((inp) => {
      const idx = Number(inp.dataset.idx);
      const line = balanceLines[idx];
      const qty = Number(inp.value) || 0;
      sum += calcLineAmount(qty, line.rate);
    });
    notifyTotal(sum);
  }

  function getReceivePayload() {
    if (!selectedPo) return null;
    const receiptDate = isModal
      ? root.querySelector('[name="receiptDate"]')?.value
      : root.querySelector('[name="receiptDate"]')?.value;

    if (balanceLines.length) {
      const scope = isModal ? linesHost : root;
      const receiveLines = [];
      let amount = 0;
      scope.querySelectorAll(".pur-grn-qty").forEach((inp) => {
        const idx = Number(inp.dataset.idx);
        const line = balanceLines[idx];
        const qty = Number(inp.value) || 0;
        if (qty <= 0) return;
        const lineAmount = calcLineAmount(qty, line.rate);
        amount += lineAmount;
        receiveLines.push({
          supplierProductId: line.supplierProductId,
          productName: line.productName,
          unit: line.unit,
          qty,
          rate: line.rate,
          amount: lineAmount,
          lineIndex: line.lineIndex,
        });
      });
      return { poId: selectedPo.id, amount, receiveLines, receiptDate };
    }

    const amountEl = isModal
      ? amountSection?.querySelector('[name="amount"]')
      : root.querySelector('[name="amount"]');
    return {
      poId: selectedPo.id,
      amount: Number(amountEl?.value) || 0,
      receiveLines: [],
      receiptDate,
    };
  }

  function selectPo(poId) {
    selectedPoId = poId || "";
    const po = approvedPos.find((p) => p.id === poId) || null;
    renderLinesForPo(po);
  }

  if (isModal && poSel) {
    poSel.addEventListener("change", () => selectPo(poSel.value));
    if (preselectedPoId) selectPo(preselectedPoId);
    else updateSubmitBlocked();
  }

  return {
    selectPo,
    getReceivePayload,
    getSelectedPo: () => selectedPo,
  };
}

/**
 * Open GRN receive in standard cust-detail-modal popup.
 * @param {{
 *   approvedPos: object[],
 *   getPriorGrnsForPo: (poId: string) => object[],
 *   inventoryMaterials?: object[],
 *   preselectedPoId?: string,
 *   receiptDateDefault?: string,
 *   onReceive: (payload: { poId: string, amount: number, receiveLines: object[], receiptDate: string }, po: object) => void | Promise<void>,
 *   onClose?: () => void,
 * }} opts
 */
export function openGrnReceiveModal(opts) {
  const {
    approvedPos,
    getPriorGrnsForPo,
    inventoryMaterials = [],
    preselectedPoId = "",
    receiptDateDefault = new Date().toISOString().slice(0, 10),
    onReceive,
    onClose,
  } = opts;
  const titleId = `pur-grn-modal-title-${Math.random().toString(36).slice(2, 9)}`;

  const overlay = document.createElement("div");
  overlay.className = "cust-detail-overlay";
  overlay.setAttribute("role", "presentation");

  const modal = document.createElement("div");
  modal.className = "cust-detail-modal card pur-grn-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-labelledby", titleId);
  modal.setAttribute("tabindex", "-1");
  modal.innerHTML = `
    <div class="cust-detail-head">
      <div class="cust-detail-title">
        <strong id="${titleId}">Receive goods (GRN)</strong>
        <span class="text-muted">Receive against approved PO and post to accounts</span>
      </div>
      <button type="button" class="icon-btn icon-btn--sm cust-detail-close" data-close aria-label="Close">${icon("x", { size: 16 })}</button>
    </div>
    <form class="cust-form cust-form--compact pur-grn-modal-form">
      <div class="cust-form-shell">
        <div class="cust-form-row">
          <div class="cust-form-section">
            <div class="cust-form-section-head">
              <h4 class="cust-form-section-title">Purchase order</h4>
            </div>
            <div class="cust-form-section-body" data-pur-grn-po-body></div>
          </div>
        </div>
        <div class="cust-form-row" hidden data-pur-grn-lines-section>
          <div class="cust-form-section">
            <div class="cust-form-section-head">
              <h4 class="cust-form-section-title">Receive lines</h4>
            </div>
            <div class="cust-form-section-body pur-grn-lines-body" data-pur-grn-lines-host></div>
          </div>
        </div>
        <div class="cust-form-row" hidden data-pur-grn-amount-section></div>
        <div class="cust-form-row">
          <div class="cust-form-section">
            <div class="cust-form-section-head">
              <h4 class="cust-form-section-title">Receipt</h4>
            </div>
            <div class="cust-form-section-body" data-pur-grn-receipt-body></div>
          </div>
        </div>
        <p class="pur-grn-map-warning" hidden data-pur-grn-map-warning role="alert"></p>
      </div>
      <div class="cust-form-footer">
        <span class="pur-grn-modal-total">Receive total: <strong class="pur-grn-modal-total-value">${formatBDT(0)}</strong></span>
        <div class="form-actions cust-form-actions">
          <button type="submit" class="btn btn-green">Receive GRN</button>
          <button type="button" class="btn btn-ghost" data-cancel>Cancel</button>
        </div>
      </div>
    </form>
  `;

  overlay.appendChild(modal);
  document.body.appendChild(overlay);
  document.body.classList.add("cust-detail-open");

  let dismissAc = null;
  function close() {
    finishModalClose(overlay, dismissAc, onClose);
  }
  dismissAc = wireModalDismiss({ overlay, modal, close });
  overlay._purDismiss = close;

  const form = modal.querySelector(".pur-grn-modal-form");

  let composer;
  try {
    composer = initGrnReceiveComposer({
      root: form,
      variant: "modal",
      approvedPos,
      getPriorGrnsForPo,
      inventoryMaterials,
      receiptDateDefault,
      preselectedPoId,
    });
  } catch (err) {
    console.error("GRN composer init failed:", err);
    showToast(err?.message || "Could not open receive form", "error");
    close();
    return { close: () => {}, composer: null };
  }

  form.addEventListener("submit", async (e) => {
    e.preventDefault();
    const payload = composer.getReceivePayload();
    const po = composer.getSelectedPo();
    if (!payload || !po) {
      showToast("Select an approved PO", "error");
      return;
    }
    if (payload.amount <= 0) {
      showToast("Enter receive quantity or amount", "error");
      return;
    }
    try {
      await onReceive(payload, po);
      close();
    } catch {
      /* caller shows toast; keep modal open */
    }
  });

  modal.focus({ preventScroll: true });

  return { close, composer };
}

/**
 * GRN receive form — line-wise when PO has lines, else amount-only (inline layout).
 * @param {object} po
 * @param {object[]} priorGrns
 * @param {string} receiptDateDefault
 */
export function renderGrnReceiveForm(po, priorGrns, receiptDateDefault) {
  const wrap = document.createElement("form");
  wrap.className = "pur-grn-form";
  const composer = initGrnReceiveComposer({
    root: wrap,
    variant: "inline",
    approvedPos: [po],
    getPriorGrnsForPo: () => priorGrns,
    inventoryMaterials: [],
    receiptDateDefault,
    preselectedPoId: po?.id || "",
  });
  composer.selectPo(po?.id || "");
  wrap.getReceivePayload = () => {
    const payload = composer.getReceivePayload();
    if (!payload) return { amount: 0, receiveLines: [], receiptDate: receiptDateDefault };
    return payload;
  };
  return wrap;
}
