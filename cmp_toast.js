const TOAST_MS = { success: 4000, error: 5000, info: 3500 };

export function showToast(message, type = "success") {
  const existing = document.querySelector(".toast");
  if (existing) existing.remove();
  const el = document.createElement("div");
  const kind = type === "error" || type === "info" ? type : "success";
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), TOAST_MS[kind] ?? 4000);
}
