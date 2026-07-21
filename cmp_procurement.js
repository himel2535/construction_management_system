/** Procurement UI — product picker, PO line composer, GRN receive lines */

import {
  searchProductPickerEntries,
  catalogEntryFor,
  calcLineAmount,
  normalizePoLine,
  sumPoLines,
  poLinesWithReceiveBalance,
} from "./util_procurement.js";
import { formatBDT } from "./util_format.js";
import { showToast } from "./cmp_toast.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
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
 * Full PO create composer with line items.
 * @param {{
 *   getCatalog?: () => import("./util_procurement.js").CatalogEntry[],
 *   getSuppliers?: () => object[],
 *   catalog?: import("./util_procurement.js").CatalogEntry[],
 *   suppliers?: object[],
 *   mrs: object[],
 *   draftLines: object[],
 *   onCreatePo: (payload: { lines: object[], mrId: string, vendorId: string, vendorName: string, amount: number }) => void | Promise<void>,
 * }} opts
 */
export function renderPurchaseOrderComposer(opts) {
  const {
    catalog = [],
    suppliers = [],
    getCatalog,
    getSuppliers,
    mrs,
    draftLines,
    onCreatePo,
  } = opts;
  const cat = () => (typeof getCatalog === "function" ? getCatalog() : catalog);
  const sups = () => (typeof getSuppliers === "function" ? getSuppliers() : suppliers);

  const wrap = document.createElement("div");
  wrap.className = "pur-po-composer";

  let selectedProductKey = "";
  let selectedProductName = "";
  let selectedSupplierId = draftLines[0]?.supplierId || "";

  const mrOpts = mrs.map((m) => `<option value="${m.id}">${escapeHtml(m.title)}</option>`).join("");

  wrap.innerHTML = `
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
    </div>
  `;

  const pickerHost = wrap.querySelector(".pur-product-picker-host");
  const supplierSel = wrap.querySelector('[name="lineSupplier"]');
  const qtyIn = wrap.querySelector('[name="lineQty"]');
  const unitIn = wrap.querySelector('[name="lineUnit"]');
  const rateIn = wrap.querySelector('[name="lineRate"]');
  const totalDisplay = wrap.querySelector(".pur-line-total-display");
  const addLineBtn = wrap.querySelector(".pur-add-line-btn");
  const linesHost = wrap.querySelector(".pur-lines-table-host");
  const totalValue = wrap.querySelector(".pur-po-total-value");
  const createBtn = wrap.querySelector(".pur-create-po-btn");
  const mrSel = wrap.querySelector('[name="mrId"]');

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

  function onSupplierChange() {
    selectedSupplierId = supplierSel.value;
    applyCatalogRowToLineFields();
  }

  supplierSel.addEventListener("change", onSupplierChange);
  qtyIn.addEventListener("input", updateLineTotalPreview);
  rateIn.addEventListener("input", updateLineTotalPreview);

  function renderLinesTable() {
    if (!draftLines.length) {
      linesHost.innerHTML = "";
      totalValue.textContent = formatBDT(0);
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
      </div>
    `;
    totalValue.textContent = formatBDT(sumPoLines(draftLines));
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

  createBtn.onclick = async () => {
    if (!draftLines.length) {
      showToast("Add at least one line", "error");
      return;
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
  };

  renderLinesTable();
  refreshSupplierOptions();

  return wrap;
}

/**
 * GRN receive form — line-wise when PO has lines, else amount-only.
 * @param {object} po
 * @param {object[]} priorGrns
 * @param {string} receiptDateDefault
 */
export function renderGrnReceiveForm(po, priorGrns, receiptDateDefault) {
  const wrap = document.createElement("form");
  wrap.className = "pur-grn-form";

  const balanceLines = po?.lines?.length ? poLinesWithReceiveBalance(po, priorGrns) : [];
  const hasLines = balanceLines.length > 0;

  if (hasLines) {
    wrap.innerHTML = `
      <p class="pur-grn-hint">Enter received quantity per line (max = remaining on PO).</p>
      <table class="dash-table pur-grn-line-table">
        <thead><tr><th>Product</th><th class="text-right">Ordered</th><th class="text-right">Received</th><th class="text-right">Receive now</th></tr></thead>
        <tbody>
          ${balanceLines
            .map(
              (l, i) => `
            <tr data-line-idx="${i}">
              <td>${escapeHtml(l.productName)}</td>
              <td class="text-right">${l.orderedQty} ${escapeHtml(l.unit)}</td>
              <td class="text-right">${l.receivedQty}</td>
              <td class="text-right">
                <input type="number" min="0" max="${l.remainingQty}" step="any" class="toolbar-input pur-grn-qty" data-idx="${i}" value="${l.remainingQty > 0 ? l.remainingQty : 0}" ${l.remainingQty <= 0 ? "disabled" : ""} />
              </td>
            </tr>`
            )
            .join("")}
        </tbody>
      </table>
      <div class="pur-grn-actions">
        <label>Receipt date <input type="date" name="receiptDate" value="${escapeHtml(receiptDateDefault)}" /></label>
        <span class="pur-grn-total">Receive total: <strong class="pur-grn-total-value">—</strong></span>
        <button type="submit" class="btn btn-green btn-sm">Receive GRN</button>
      </div>
    `;

    const totalEl = wrap.querySelector(".pur-grn-total-value");

    function updateGrnTotal() {
      let sum = 0;
      wrap.querySelectorAll(".pur-grn-qty").forEach((inp) => {
        const idx = Number(inp.dataset.idx);
        const line = balanceLines[idx];
        const qty = Number(inp.value) || 0;
        sum += calcLineAmount(qty, line.rate);
      });
      totalEl.textContent = formatBDT(sum);
    }

    wrap.querySelectorAll(".pur-grn-qty").forEach((inp) => {
      inp.addEventListener("input", updateGrnTotal);
    });
    updateGrnTotal();

    wrap.getReceivePayload = () => {
      const receiveLines = [];
      let amount = 0;
      wrap.querySelectorAll(".pur-grn-qty").forEach((inp) => {
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
      return {
        amount,
        receiveLines,
        receiptDate: wrap.querySelector('[name="receiptDate"]')?.value,
      };
    };
  } else {
    wrap.innerHTML = `
      <div class="pur-grn-actions pur-grn-actions--simple">
        <input name="amount" type="number" placeholder="GRN amount *" required />
        <input name="receiptDate" type="date" value="${escapeHtml(receiptDateDefault)}" />
        <button type="submit" class="btn btn-green btn-sm">Receive GRN</button>
      </div>
    `;
    wrap.getReceivePayload = () => ({
      amount: Number(wrap.querySelector('[name="amount"]')?.value) || 0,
      receiveLines: [],
      receiptDate: wrap.querySelector('[name="receiptDate"]')?.value,
    });
  }

  return wrap;
}
