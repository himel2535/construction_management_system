export function formatBDT(amount, currency = "BDT") {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(amount ?? 0);
}

const bdtNumberFormatter = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });

/** Numeric amount only (no BDT prefix), preserves sign. */
export function formatBDTNumber(amount) {
  const n = Number(amount) || 0;
  const abs = Math.abs(n);
  const formatted = bdtNumberFormatter.format(abs);
  return n < 0 ? `-${formatted}` : formatted;
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
