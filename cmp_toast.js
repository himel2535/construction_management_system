import { navigateTo } from "./util_route.js";
import { resolveActionGuidance } from "./util_actionGuidance.js";
import { emitActionNotifications } from "./svc_actionNotifications.js";

const TOAST_MS = { success: 4000, error: 5000, info: 3500, rich: 7000 };

function removeExistingToast() {
  document.querySelector(".toast")?.remove();
}

export function showToast(message, type = "success") {
  removeExistingToast();
  const el = document.createElement("div");
  const kind = type === "error" || type === "info" ? type : "success";
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), TOAST_MS[kind] ?? 4000);
}

/**
 * Rich toast with verify links.
 * @param {{ title: string, detail?: string, verifyLinks?: Array<{label:string,link:string}>, type?: string, primaryLink?: string, primaryLabel?: string }} opts
 */
export function showActionFeedback(opts = {}) {
  removeExistingToast();
  const kind = opts.type === "error" || opts.type === "info" ? opts.type : "success";
  const el = document.createElement("div");
  el.className = `toast toast-${kind} toast--rich`;

  const titleEl = document.createElement("div");
  titleEl.className = "toast-rich-title";
  titleEl.textContent = opts.title || "Done";
  el.appendChild(titleEl);

  if (opts.detail) {
    const detailEl = document.createElement("div");
    detailEl.className = "toast-rich-detail";
    detailEl.textContent = opts.detail;
    el.appendChild(detailEl);
  }

  const links = opts.verifyLinks || [];
  if (links.length) {
    const verifyHead = document.createElement("div");
    verifyHead.className = "toast-rich-verify-head";
    verifyHead.textContent = "Verify at:";
    el.appendChild(verifyHead);

    const list = document.createElement("ul");
    list.className = "toast-verify-list";
    for (const item of links) {
      const li = document.createElement("li");
      if (item.link) {
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "toast-verify-link";
        btn.textContent = item.label;
        btn.addEventListener("click", () => {
          if (item.link.startsWith("#")) {
            const anchor = document.querySelector(item.link);
            anchor?.scrollIntoView({ behavior: "smooth", block: "start" });
          } else {
            navigateTo(item.link);
          }
          el.remove();
        });
        li.appendChild(btn);
      } else {
        li.textContent = item.label;
      }
      list.appendChild(li);
    }
    el.appendChild(list);
  }

  const primary = opts.primaryLink || links[0]?.link;
  if (primary && !primary.startsWith("#")) {
    const goBtn = document.createElement("button");
    goBtn.type = "button";
    goBtn.className = "toast-go-btn";
    goBtn.textContent = opts.primaryLabel || "Go there";
    goBtn.addEventListener("click", () => {
      navigateTo(primary);
      el.remove();
    });
    el.appendChild(goBtn);
  }

  document.body.appendChild(el);
  setTimeout(() => el.remove(), TOAST_MS.rich);
}

/**
 * Show rich toast + bell notifications for a catalogued action.
 * @param {string} actionKey
 * @param {object} ctx
 */
export async function actionFeedback(actionKey, ctx = {}) {
  const guidance = resolveActionGuidance(actionKey, ctx);
  if (!guidance) {
    showToast(ctx.fallbackMessage || "Saved");
    return;
  }
  showActionFeedback({
    ...guidance.toast,
    primaryLink: guidance.toast.verifyLinks?.[0]?.link,
    primaryLabel: guidance.toast.verifyLinks?.[0]?.label ? "Open" : undefined,
  });
  try {
    await emitActionNotifications(actionKey, ctx, guidance);
  } catch {
    /* non-blocking */
  }
}
