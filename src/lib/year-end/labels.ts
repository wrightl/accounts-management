/** "company" for a limited company, "business" for a sole trader. */
export function businessWord(isLimited: boolean): string {
  return isLimited ? "company" : "business";
}

export function expenseStatusText(
  status: string,
  options: { isLimited: boolean; paidByOwner: boolean },
): string {
  const personal = status === "reimbursable" || status === "reimbursed";
  // A sole trader's own spending is money put in, never a debt owed to them.
  if (personal && options.paidByOwner) return "Paid personally by the owner";
  switch (status) {
    case "recorded":
      return "Recorded";
    case "reimbursable":
      return "Awaiting reimbursement";
    case "reimbursed":
      return "Reimbursed";
    case "company_paid":
      return `Paid by ${businessWord(options.isLimited)}`;
    default:
      return humanise(status);
  }
}

/** One line on each expense status the pack uses, for the cover's key. */
export function expenseStatusKey(isLimited: boolean): [string, string][] {
  const business = businessWord(isLimited);
  return [
    [`Paid by ${business}`, `Paid from a ${business} bank account or card.`],
    [
      "Awaiting reimbursement",
      `Paid personally by someone and not yet paid back by the ${business}.`,
    ],
    ["Reimbursed", `Paid personally by someone and since paid back by the ${business}.`],
    ...(isLimited
      ? []
      : ([
          [
            "Paid personally by the owner",
            "A business cost the owner paid from their own money. Counted as money the owner put in.",
          ],
        ] as [string, string][])),
    ["Recorded", "Logged, but nobody has yet said how it was paid."],
  ];
}

const INVOICE_STATUS: Record<string, string> = {
  sent: "Sent",
  paid: "Paid",
  overdue: "Overdue",
};

export function invoiceStatusText(status: string): string {
  return INVOICE_STATUS[status] ?? humanise(status);
}

/** `bank_transfer` → "Bank transfer". */
export function humanise(value: string | null | undefined): string {
  const text = (value ?? "").replace(/[_-]+/g, " ").trim();
  return text ? text.charAt(0).toUpperCase() + text.slice(1) : "";
}

export const NONE_IN_PERIOD = "None in this period";
