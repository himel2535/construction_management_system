export function showToast(message: string, type: "success" | "error" | "info" = "success") {
  if (typeof document === "undefined") return;
  document.querySelector(".toast")?.remove();
  const el = document.createElement("div");
  const kind = type === "error" || type === "info" ? type : "success";
  el.className = `toast toast-${kind}`;
  el.textContent = message;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 4000);
}
