export const DELAY_CAUSES = [
  { id: "weather", label: "Weather" },
  { id: "material", label: "Material delay" },
  { id: "labor", label: "Labor shortage" },
  { id: "design_change", label: "Design change" },
  { id: "permit", label: "Permit / approval" },
  { id: "client", label: "Client decision" },
  { id: "other", label: "Other" },
];

export function delayCauseLabel(id) {
  return DELAY_CAUSES.find((c) => c.id === id)?.label || id || "—";
}

export function delayCauseOptions() {
  return [{ value: "", label: "—" }, ...DELAY_CAUSES.map((c) => ({ value: c.id, label: c.label }))];
}
