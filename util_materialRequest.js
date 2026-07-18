/** Material request and delivery status helpers */

export const MR_REQUEST_TYPES = ["supplier", "central"];

export const MR_STATUSES = ["draft", "submitted", "approved", "rejected"];

export const DELIVERY_STATUSES = ["requested", "approved", "ordered", "partial", "delivered"];

export function mrStatusLabel(status) {
  return (
    { draft: "Draft", submitted: "Submitted", approved: "Approved", rejected: "Rejected" }[status] ||
    status ||
    "—"
  );
}

export function deliveryStatusLabel(status) {
  return (
    {
      requested: "Requested",
      approved: "Approved",
      ordered: "Ordered",
      partial: "Partial",
      delivered: "Delivered",
    }[status] || status || "—"
  );
}

export function deliveryChipClass(status) {
  if (status === "delivered") return "ok";
  if (status === "partial" || status === "ordered") return "pending";
  return "draft";
}

/** Compute delivery status from linked PO and GRN rows. */
export function deriveDeliveryStatus(mr, pos = [], grns = []) {
  const poId = mr.poId;
  const linkedPo = poId ? pos.find((p) => p.id === poId) : pos.find((p) => p.mrId === mr.id);
  if (!linkedPo) {
    if (mr.status === "approved") return "approved";
    if (mr.status === "submitted") return "requested";
    return mr.deliveryStatus || "requested";
  }
  const poGrns = grns.filter((g) => g.poId === linkedPo.id);
  if (!poGrns.length) {
    return linkedPo.status === "approved" ? "ordered" : mr.deliveryStatus || "approved";
  }
  const totalReceived = poGrns.reduce((s, g) => s + (Number(g.amount) || 0), 0);
  const poAmount = Number(linkedPo.amount) || 0;
  if (poAmount > 0 && totalReceived >= poAmount * 0.99) return "delivered";
  if (totalReceived > 0) return "partial";
  return "ordered";
}
