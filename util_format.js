export function formatBDT(amount, currency = "BDT") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount ?? 0);
}

export function formatDate(date) {
  try {
    return new Date(date).toLocaleDateString("en-US");
  } catch {
    return date;
  }
}

/** Human-readable project timeline from ISO date strings. */
export function formatDateRange(start, end) {
  if (!start && !end) return "Not set";
  if (start && end) return `${formatDate(start)} – ${formatDate(end)}`;
  if (start) return `From ${formatDate(start)}`;
  return `Until ${formatDate(end)}`;
}

export function todayISO() {
  return new Date().toISOString().slice(0, 10);
}
