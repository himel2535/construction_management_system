/** Procurement UI — product picker, PO line composer, GRN receive lines */

import {
  searchProducts,
  suppliersForProduct,
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
  const { onSelect, placeholder = "Product name…" } = opts;
  const wrap = document.createElement("div");
  wrap.className = "pur-product-picker";

  const input = document.createElement("input");
  input.type = "text";
  input.className = "toolbar-input pur-product-input";
  input.placeholder = placeholder;
  input.autocomplete = "off";

  const list = document.createElement("ul");
  list.className = "pur-product-suggestions";
  list.hidden = true;

  wrap.append(input, list);

  let activeIdx = -1;
  let suggestions = [];

  function hideList() {
    list.hidden = true;
    activeIdx = -1;
  }

  function showSuggestions(items) {
    suggestions = items;
    if (!items.length) {
      list.innerHTML = `<li class="pur-product-suggestion pur-product-suggestion--empty">No product found — add in Suppliers → Products & Services</li>`;
      list.hidden = false;
      return;
    }
    list.innerHTML = items
      .map(
        (e, i) =>
          `<li class="pur-product-suggestion${i === activeIdx ? " is-active" : ""}" data-idx="${i}" role="option">${escapeHtml(e.name)}${e.code ? ` <span class="pur-product-code">${escapeHtml(e.code)}</span>` : ""}</li>`
      )
      .join("");
    list.hidden = false;
    list.querySelectorAll(".pur-product-suggestion[data-idx]").forEach((li) => {
      li.addEventListener("mousedown", (ev) => {
        ev.preventDefault();
        const idx = Number(li.dataset.idx);
        pick(suggestions[idx]);
      });
    });
  }

  function pick(entry) {
    if (!entry) return;
    input.value = entry.name;
    hideList();
    onSelect?.(entry);
  }

  input.addEventListener("input", () => {
    const q = input.value.trim();
    if (q.length < 1) {
      hideList();
      return;
    }
    showSuggestions(searchProducts(catalog, q, 15));
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
 *   catalog: import("./util_procurement.js").CatalogEntry[],
 *   mrs: object[],
 *   draftLines: object[],
 *   onCreatePo: (payload: { lines: object[], mrId: string, vendorId: string, vendorName: string, amount: number }) => void | Promise<void>,
 * }} opts
 */
export function renderPurchaseOrderComposer(opts) {
  const { catalog, mrs, draftLines, onCreatePo } = opts;

  const wrap = document.createElement("div");
  wrap.className = "pur-po-composer";

  let selectedProductKey = "";
  let selectedSupplierId = draftLines[0]?.supplierId || "";

  const mrOpts = mrs.map((m) => `<option value="${m.id}">${escapeHtml(m.title)}</option>`).join("");

  wrap.innerHTML = `
    <div class="pur-po-composer-row pur-po-composer-row--picker">
      <label class="pur-field-label">Product</label>
      <div class="pur-product-picker-host"></div>
    </div>
    <div class="pur-po-composer-row pur-po-composer-grid">
      <label class="pur-field-label">Supplier</label>
      <select name="lineSupplier" class="toolbar-select" disabled><option value="">Select product first</option></select>
      <label class="pur-field-label">Qty</label>
      <input name="lineQty" type="number" min="0" step="any" class="toolbar-input" placeholder="Qty" disabled />
      <label class="pur-field-label">Unit</label>
      <input name="lineUnit" type="text" class="toolbar-input" readonly disabled />
      <label class="pur-field-label">Rate</label>
      <input name="lineRate" type="number" min="0" step="0.01" class="toolbar-input" placeholder="Rate" disabled />
      <label class="pur-field-label">Line total</label>
      <span class="pur-line-total-display">—</span>
      <button type="button" class="btn btn-ghost btn-sm pur-add-line-btn" disabled>Add line</button>
    </div>
    <div class="pur-lines-table-host"></div>
    <div class="pur-po-footer">
      <label class="pur-field-label">Link MR (optional)</label>
      <select name="mrId" class="toolbar-select"><option value="">—</option>${mrOpts}</select>
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

  const picker = renderProductPicker(catalog, {
    onSelect: (entry) => {
      selectedProductKey = entry.productKey;
      refreshSupplierOptions();
    },
  });
  pickerHost.appendChild(picker.el);

  function updateLineTotalPreview() {
    const t = calcLineAmount(qtyIn.value, rateIn.value);
    totalDisplay.textContent = formatBDT(t);
  }

  function setLineFieldsEnabled(on) {
    supplierSel.disabled = !on;
    qtyIn.disabled = !on;
    rateIn.disabled = !on;
    addLineBtn.disabled = !on;
    if (!on) unitIn.disabled = true;
  }

  function refreshSupplierOptions() {
    const rows = suppliersForProduct(catalog, selectedProductKey);
    if (!rows.length) {
      supplierSel.innerHTML = '<option value="">No supplier for this product</option>';
      supplierSel.disabled = true;
      setLineFieldsEnabled(false);
      return;
    }
    if (selectedSupplierId && !rows.some((r) => r.supplierId === selectedSupplierId)) {
      selectedSupplierId = "";
    }
    if (selectedSupplierId && draftLines.length) {
      const mismatch = rows.every((r) => r.supplierId !== selectedSupplierId);
      if (mismatch) {
        supplierSel.innerHTML = `<option value="">PO locked to ${escapeHtml(draftLines[0].supplierName)} — pick their product or clear lines</option>`;
        supplierSel.disabled = true;
        setLineFieldsEnabled(false);
        return;
      }
    }
    supplierSel.innerHTML =
      '<option value="">Select supplier</option>' +
      rows
        .map(
          (r) =>
            `<option value="${escapeHtml(r.supplierId)}" data-product-id="${escapeHtml(r.productId)}">${escapeHtml(r.supplierName)} — ${formatBDT(r.rate)}/${escapeHtml(r.unit)}</option>`
        )
        .join("");
    supplierSel.disabled = false;
    if (selectedSupplierId) supplierSel.value = selectedSupplierId;
    setLineFieldsEnabled(!!selectedProductKey);
  }

  function onSupplierChange() {
    selectedSupplierId = supplierSel.value;
    const opt = supplierSel.selectedOptions[0];
    const productId = opt?.dataset?.productId || "";
    const row = catalog.find((e) => e.supplierId === selectedSupplierId && e.productId === productId);
    if (row) {
      unitIn.value = row.unit;
      rateIn.value = row.rate;
      unitIn.disabled = false;
    } else {
      unitIn.value = "";
      rateIn.value = "";
    }
    updateLineTotalPreview();
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
      <table class="dash-table pur-line-table">
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
    const opt = supplierSel.selectedOptions[0];
    const productId = opt?.dataset?.productId || "";
    const row = catalog.find((e) => e.supplierId === supplierSel.value && e.productId === productId);
    if (!row) {
      showToast("Select a supplier for this product", "error");
      return;
    }
    const qty = Number(qtyIn.value);
    if (!qty || qty <= 0) {
      showToast("Enter quantity", "error");
      return;
    }
    if (draftLines.length && draftLines[0].supplierId !== row.supplierId) {
      showToast("One PO = one supplier. Remove lines or use another PO.", "error");
      return;
    }
    const line = normalizePoLine({
      supplierProductId: row.productId,
      productName: row.name,
      productCode: row.code,
      supplierId: row.supplierId,
      supplierName: row.supplierName,
      unit: row.unit,
      qty,
      rate: Number(rateIn.value) || row.rate,
    });
    draftLines.push(line);
    picker.reset();
    selectedProductKey = "";
    supplierSel.value = "";
    qtyIn.value = "";
    unitIn.value = "";
    rateIn.value = "";
    totalDisplay.textContent = "—";
    setLineFieldsEnabled(false);
    supplierSel.innerHTML = '<option value="">Select product first</option>';
    supplierSel.disabled = true;
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
