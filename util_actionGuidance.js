/** Action feedback catalog — toast copy + verify links + notification targets. */

function sicPayrollLink(ctx) {
  const q = new URLSearchParams();
  if (ctx.sicId) q.set("id", ctx.sicId);
  if (ctx.projectId) q.set("projectId", ctx.projectId);
  q.set("tab", "payroll");
  return `/site-incharge?${q}`;
}

function sicTabLink(ctx, tab) {
  const q = new URLSearchParams();
  if (ctx.sicId) q.set("id", ctx.sicId);
  if (ctx.projectId) q.set("projectId", ctx.projectId);
  q.set("tab", tab);
  return `/site-incharge?${q}`;
}

function fn(val) {
  return typeof val === "function" ? val : () => val ?? "";
}

function linkEntry(label, link) {
  return { label, link: fn(link) };
}

export const ACTION_GUIDANCE = {
  payroll_confirm_disbursement: {
    toast: {
      title: "Payment recorded",
      detail: (ctx) => [ctx.workerName, ctx.amountLabel].filter(Boolean).join(" · "),
      verify: (ctx) => [
        linkEntry("Payroll → Payment history (below)", () => `${sicPayrollLink(ctx)}#sic-payment-history`),
        linkEntry("Salary calc → Status paid", () => sicPayrollLink(ctx)),
        linkEntry("Finance → Expenses", "/accounting"),
      ],
    },
    notifySelf: {
      title: "Payment saved",
      message: (ctx) =>
        `Payment for ${ctx.workerName || "worker"} saved. Check Payment history and Salary calc Status on Payroll tab.`,
      link: (ctx) => sicPayrollLink(ctx),
    },
  },
  payroll_confirm_salary: {
    toast: {
      title: "Payment confirmed",
      detail: (ctx) => [ctx.workerName, ctx.amountLabel].filter(Boolean).join(" · "),
      verify: (ctx) => [
        linkEntry("Payroll → Payment history (below)", () => `${sicPayrollLink(ctx)}#sic-payment-history`),
        linkEntry("Salary calc → Status paid", () => sicPayrollLink(ctx)),
        linkEntry("Finance → Expenses", "/accounting"),
      ],
    },
    notifySelf: {
      title: "Salary payment confirmed",
      message: (ctx) => `Paid ${ctx.workerName || "worker"}. Verify in Payment history below.`,
      link: (ctx) => sicPayrollLink(ctx),
    },
  },
  payroll_entry_saved: {
    toast: {
      title: "Payroll entry saved",
      detail: (ctx) => ctx.workerName || "",
      verify: (ctx) => [linkEntry("Payroll entries table (below)", () => `${sicPayrollLink(ctx)}#sic-payroll-entries`)],
    },
    notifySelf: {
      title: "Payroll entry logged",
      message: "See Payroll entries table on the Payroll tab.",
      link: (ctx) => sicPayrollLink(ctx),
    },
  },
  material_log_saved: {
    toast: {
      title: "Material log saved",
      detail: () => "",
      verify: (ctx) => [linkEntry("Material log → Usage history", () => sicTabLink(ctx, "material"))],
    },
    notifySelf: {
      title: "Material log saved",
      message: "Check Usage history on the Material log tab.",
      link: (ctx) => sicTabLink(ctx, "material"),
    },
  },
  material_log_updated: {
    toast: {
      title: "Material log updated",
      verify: (ctx) => [linkEntry("Material log → Usage history", () => sicTabLink(ctx, "material"))],
    },
    notifySelf: {
      title: "Material log updated",
      message: "Changes are in Usage history on the Material log tab.",
      link: (ctx) => sicTabLink(ctx, "material"),
    },
  },
  material_log_approved: {
    toast: {
      title: "Material log approved",
      verify: (ctx) => [
        linkEntry("Material log → Usage history", () => sicTabLink(ctx, "material")),
        linkEntry("Overview → Variance reports", () => sicTabLink(ctx, "overview")),
      ],
    },
    notifySelf: {
      title: "Material log approved",
      message: "Approved log appears in Usage history; variance updates on Overview.",
      link: (ctx) => sicTabLink(ctx, "material"),
    },
  },
  central_requisition_submit: {
    toast: {
      title: "Central requisition submitted",
      detail: (ctx) => ctx.title || "",
      verify: (ctx) => [
        linkEntry("Site → Material requests", () => sicTabLink(ctx, "requests")),
        linkEntry("Inventory → Issue Vouchers (after approval)", "/inventory?tab=issue_vouchers"),
      ],
    },
    notifySelf: {
      title: "Requisition submitted",
      message: (ctx) => `Track "${ctx.title || "requisition"}" on Material requests tab.`,
      link: (ctx) => sicTabLink(ctx, "requests"),
    },
    notifyRoles: ["procurement_officer", "owner"],
    notifyRolePayload: {
      type: "action_handoff",
      title: "Central requisition to approve",
      message: (ctx) => `${ctx.title || "Requisition"} — approve in Inventory`,
      link: "/inventory?tab=issue_vouchers",
    },
  },
  central_requisition_approved: {
    toast: {
      title: "Central requisition approved",
      verify: () => [
        linkEntry("Issue Vouchers → create voucher", "/inventory?tab=issue_vouchers"),
        linkEntry("Central Ledger", "/inventory?tab=central_ledger"),
      ],
    },
    notifySelf: {
      title: "Requisition approved",
      message: "Create an issue voucher on the Issue Vouchers tab.",
      link: "/inventory?tab=issue_vouchers",
    },
  },
  issue_voucher_created: {
    toast: {
      title: "Issue voucher created",
      detail: (ctx) => (ctx.qty ? `${ctx.qty} issued` : ""),
      verify: () => [
        linkEntry("Central Ledger", "/inventory?tab=central_ledger"),
        linkEntry("Issue Vouchers list", "/inventory?tab=issue_vouchers"),
      ],
    },
    notifySelf: {
      title: "Stock issued to site",
      message: "Central stock reduced — verify in Central Ledger.",
      link: "/inventory?tab=central_ledger",
    },
  },
  stock_in_recorded: {
    toast: {
      title: "Stock in recorded",
      verify: () => [
        linkEntry("Central Ledger", "/inventory?tab=central_ledger"),
        linkEntry("Ledger", "/inventory?tab=ledger"),
      ],
    },
    notifySelf: {
      title: "Stock in recorded",
      message: "Verify quantities in Central Ledger.",
      link: "/inventory?tab=central_ledger",
    },
  },
  stock_issued: {
    toast: {
      title: "Stock issued to worker",
      verify: () => [
        linkEntry("Pending Returns", "/inventory?tab=pending_returns"),
        linkEntry("Ledger", "/inventory?tab=ledger"),
      ],
    },
    notifySelf: {
      title: "Stock issued",
      message: "Track returns on Pending Returns tab.",
      link: "/inventory?tab=pending_returns",
    },
  },
  mr_submitted: {
    toast: {
      title: "Material request submitted",
      verify: () => [
        linkEntry("Procurement → Material requests", "/purchases?tab=requests"),
        linkEntry("Approvals inbox", "/approvals"),
      ],
    },
    notifySelf: {
      title: "MR submitted",
      message: "Awaiting approval — check Material requests or Approvals.",
      link: "/purchases?tab=requests",
    },
    notifyRoles: ["procurement_officer", "owner", "project_manager"],
    notifyRolePayload: {
      type: "action_handoff",
      title: "Material request to approve",
      message: (ctx) => ctx.title || "New material request submitted",
      link: "/purchases?tab=requests",
    },
  },
  mr_approved: {
    toast: {
      title: "Material request approved",
      verify: () => [linkEntry("Procurement → Purchase orders", "/purchases?tab=orders")],
    },
    notifySelf: {
      title: "MR approved",
      message: "Create a purchase order on the Orders tab.",
      link: "/purchases?tab=orders",
    },
  },
  po_approved: {
    toast: {
      title: "PO approved",
      verify: () => [linkEntry("Procurement → Goods receipt", "/purchases?tab=grn")],
    },
    notifySelf: {
      title: "PO approved",
      message: "Receive goods on the Goods receipt tab.",
      link: "/purchases?tab=grn",
    },
  },
  grn_received: {
    toast: {
      title: "GRN received",
      detail: (ctx) => ctx.detail || "",
      verify: () => [
        linkEntry("Inventory → Central Ledger", "/inventory?tab=central_ledger"),
        linkEntry("Suppliers → Bills", "/suppliers"),
      ],
    },
    notifySelf: {
      title: "GRN recorded",
      message: "Stock added to central ledger; supplier bill posted.",
      link: "/inventory?tab=central_ledger",
    },
  },
  diary_submitted: {
    toast: {
      title: "Diary submitted",
      verify: (ctx) => [
        linkEntry("Daily diary tab", () => sicTabLink(ctx, "diary")),
        linkEntry("Approvals inbox", "/approvals"),
      ],
    },
    notifySelf: {
      title: "Diary submitted",
      message: "Awaiting approval — check Daily diary or Approvals.",
      link: (ctx) => sicTabLink(ctx, "diary"),
    },
  },
  diary_approved: {
    toast: {
      title: "Diary approved",
      detail: () => "Project progress updated",
      verify: (ctx) => [
        linkEntry("Daily diary tab", () => sicTabLink(ctx, "diary")),
        linkEntry("Projects → progress", "/projects"),
      ],
    },
    notifySelf: {
      title: "Diary approved",
      message: "Progress updated on the linked project.",
      link: (ctx) => sicTabLink(ctx, "diary"),
    },
  },
  settlement_paid: {
    toast: {
      title: "Settlement paid",
      verify: (ctx) => [
        linkEntry("Settlement tab", () => sicTabLink(ctx, "settlement")),
        linkEntry("Finance → Expenses", "/accounting"),
      ],
    },
    notifySelf: {
      title: "Settlement paid",
      message: "Posted to accounts — verify in Finance.",
      link: (ctx) => sicTabLink(ctx, "settlement"),
    },
  },
  settlement_approved: {
    toast: {
      title: "Settlement approved",
      verify: (ctx) => [linkEntry("Settlement tab", () => sicTabLink(ctx, "settlement"))],
    },
    notifySelf: {
      title: "Settlement approved",
      message: "Ready to mark paid on Settlement tab.",
      link: (ctx) => sicTabLink(ctx, "settlement"),
    },
  },
  settlement_saved: {
    toast: {
      title: "Settlement saved",
      detail: (ctx) => ctx.amountLabel || "",
      verify: (ctx) => [linkEntry("Settlement tab", () => sicTabLink(ctx, "settlement"))],
    },
    notifySelf: {
      title: "Settlement draft saved",
      message: "Review amounts on Settlement tab before approving.",
      link: (ctx) => sicTabLink(ctx, "settlement"),
    },
  },
  expense_submitted: {
    toast: {
      title: "Expense submitted for approval",
      verify: () => [
        linkEntry("Approvals inbox", "/approvals"),
        linkEntry("Finance → Expenses", "/accounting"),
      ],
    },
    notifySelf: {
      title: "Expense submitted",
      message: "Track approval in Approvals inbox.",
      link: "/approvals",
    },
    notifyRoles: ["owner", "accountant", "project_manager"],
    notifyRolePayload: {
      type: "approval",
      title: "Expense awaiting approval",
      message: (ctx) => ctx.title || "New expense submitted",
      link: "/approvals",
    },
  },
  expense_approved: {
    toast: {
      title: "Expense approved",
      verify: () => [linkEntry("Finance → Expenses", "/accounting")],
    },
    notifySelf: {
      title: "Expense approved",
      message: "Posted — verify in Finance expenses list.",
      link: "/accounting",
    },
  },
  bill_submitted: {
    toast: {
      title: "Bill submitted for approval",
      verify: () => [
        linkEntry("Approvals inbox", "/approvals"),
        linkEntry("Billing → Submitted", "/billing?tab=submitted"),
      ],
    },
    notifySelf: {
      title: "Bill submitted",
      message: "Awaiting approval in Approvals or Billing.",
      link: "/approvals",
    },
    notifyRoles: ["owner", "accountant"],
    notifyRolePayload: {
      type: "approval",
      title: "Bill awaiting approval",
      message: (ctx) => ctx.title || "Client bill submitted",
      link: "/approvals",
    },
  },
  salary_payment_workers: {
    toast: {
      title: "Salary payment recorded",
      detail: (ctx) => [ctx.workerName, ctx.amountLabel].filter(Boolean).join(" · "),
      verify: () => [
        linkEntry("Workers → Payment history", "/workers?tab=salary"),
        linkEntry("Finance → Expenses", "/accounting"),
      ],
    },
    notifySelf: {
      title: "Salary payment recorded",
      message: "See Payment history on Workers page.",
      link: "/workers?tab=salary",
    },
  },
  approval_accepted: {
    toast: {
      title: "Item approved",
      detail: (ctx) => ctx.entityLabel || "",
      verify: (ctx) => ctx.verifyLinks || [{ label: "Approvals inbox", link: "/approvals" }],
    },
    notifySelf: {
      title: "Approval completed",
      message: (ctx) => ctx.message || "Item approved.",
      link: (ctx) => ctx.link || "/approvals",
    },
  },
  approval_rejected: {
    toast: {
      title: "Item rejected",
      detail: (ctx) => ctx.entityLabel || "",
      verify: (ctx) => ctx.verifyLinks || [{ label: "Approvals inbox", link: "/approvals" }],
    },
    notifySelf: {
      title: "Approval rejected",
      message: (ctx) => ctx.message || "Item rejected.",
      link: (ctx) => ctx.link || "/approvals",
    },
  },
  approval_queue_pending: {
    notifyRoles: null,
    notifyRolePayload: {
      type: "approval",
      title: (ctx) => ctx.title || "Approval required",
      message: (ctx) => ctx.message || "An item needs your approval.",
      link: "/approvals",
    },
  },
};

/**
 * @param {string} actionKey
 * @param {object} ctx
 */
export function resolveActionGuidance(actionKey, ctx = {}) {
  const spec = ACTION_GUIDANCE[actionKey];
  if (!spec) return null;

  const toastSpec = spec.toast || {};
  const verifyRaw =
    ctx.verifyLinks?.length > 0
      ? ctx.verifyLinks
      : typeof toastSpec.verify === "function"
        ? toastSpec.verify(ctx)
        : toastSpec.verify || [];
  const verifyLinks = verifyRaw.map((v) => ({
    label: v.label,
    link: typeof v.link === "function" ? v.link(ctx) : v.link,
  }));

  const resolveField = (field) => {
    if (!field) return null;
    if (typeof field === "function") return field(ctx);
    if (typeof field === "object") {
      const out = {};
      for (const [k, v] of Object.entries(field)) {
        out[k] = typeof v === "function" ? v(ctx) : v;
      }
      return out;
    }
    return field;
  };

  return {
    actionKey,
    toast: {
      title: resolveField(toastSpec.title) || "Done",
      detail: resolveField(toastSpec.detail) || "",
      verifyLinks,
      type: toastSpec.type || "success",
    },
    notifySelf: resolveField(spec.notifySelf),
    notifyRoles: spec.notifyRoles || [],
    notifyRolePayload: resolveField(spec.notifyRolePayload),
    entityId: ctx.entityId || "",
    projectId: ctx.projectId || "",
  };
}
