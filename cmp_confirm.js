/** App-wide confirm dialog (replaces window.confirm). Returns true if confirmed. */

import { icon } from "./cmp_icons.js";

function escapeHtml(s) {
  return String(s)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * @param {{ title?: string, message: string, confirmLabel?: string, cancelLabel?: string, variant?: 'default' | 'danger' }} opts
 * @returns {Promise<boolean>}
 */
export function confirmAction({
  title = "Confirm",
  message,
  confirmLabel = "OK",
  cancelLabel = "Cancel",
  variant = "default",
} = {}) {
  const text = message != null ? String(message) : "";
  return new Promise((resolve) => {
    const overlay = document.createElement("div");
    overlay.className = "cust-detail-overlay app-confirm-overlay";
    overlay.setAttribute("role", "presentation");

    const modal = document.createElement("div");
    modal.className = "cust-detail-modal app-confirm-modal card";
    modal.setAttribute("role", "alertdialog");
    modal.setAttribute("aria-modal", "true");
    modal.setAttribute("aria-labelledby", "app-confirm-title");
    modal.setAttribute("aria-describedby", "app-confirm-message");
    modal.setAttribute("tabindex", "-1");

    modal.innerHTML = `
      <div class="cust-detail-head app-confirm-head">
        <div class="cust-detail-title">
          <strong id="app-confirm-title">${escapeHtml(title)}</strong>
        </div>
        <button type="button" class="icon-btn icon-btn--sm cust-detail-close" data-close aria-label="Close">${icon("x", { size: 16 })}</button>
      </div>
      <p id="app-confirm-message" class="app-confirm-message">${escapeHtml(text)}</p>
      <div class="form-actions cust-form-actions app-confirm-actions">
        <button type="button" class="btn btn-ghost" data-cancel>${escapeHtml(cancelLabel)}</button>
        <button type="button" class="btn ${variant === "danger" ? "btn-primary app-confirm-btn--danger" : "btn-primary"}" data-confirm>${escapeHtml(confirmLabel)}</button>
      </div>
    `;

    overlay.appendChild(modal);
    document.body.appendChild(overlay);
    document.body.classList.add("cust-detail-open");

    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      overlay.remove();
      if (!document.querySelector(".cust-detail-overlay")) {
        document.body.classList.remove("cust-detail-open");
      }
      resolve(value);
    };

    overlay.addEventListener("click", (e) => {
      if (e.target === overlay) finish(false);
    });
    modal.querySelector("[data-close]")?.addEventListener("click", () => finish(false));
    modal.querySelector("[data-cancel]")?.addEventListener("click", () => finish(false));
    modal.querySelector("[data-confirm]")?.addEventListener("click", () => finish(true));

    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        finish(false);
        document.removeEventListener("keydown", onKey);
      }
    };
    document.addEventListener("keydown", onKey);

    modal.querySelector("[data-confirm]")?.focus();
  });
}
