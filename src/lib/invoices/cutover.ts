/** Whether an imported invoice issued on `issueDate` is brought forward. */
export function isBroughtForward(
  issueDate: string | null | undefined,
  cutover: string | null | undefined,
): boolean {
  return Boolean(issueDate && cutover && issueDate < cutover);
}

export interface CutoverInvoice {
  /** Draft and void invoices never count, so they are left out. */
  issueDate: string | null;
  netPence: number;
  vatPence: number;
}

export interface CutoverActivity {
  invoiceIssueDate: string | null;
  /** London calendar day. */
  date: string;
}

export interface CutoverCredit extends CutoverActivity {
  netPence: number;
  vatPence: number;
}

export interface CutoverImpact {
  invoicesBroughtForward: number;
  invoicesCounted: number;
  /** Change to income across all periods. Negative when income leaves the accounts. */
  incomeChangePence: number;
  vatChangePence: number;
  /** Payments, credit notes and refunds that start or stop counting. */
  activityChanged: number;
  /** Every date whose figures move, for the period lock check. */
  affectedDates: string[];
}

function activityCounts(
  a: CutoverActivity,
  cutover: string | null,
): boolean {
  return !(isBroughtForward(a.invoiceIssueDate, cutover) && a.date < cutover!);
}

/** What moving the cutover from `current` to `next` does to the accounts. */
export function cutoverImpact(
  current: string | null,
  next: string | null,
  rows: {
    invoices: CutoverInvoice[];
    payments: CutoverActivity[];
    credits: CutoverCredit[];
    refunds: CutoverActivity[];
  },
): CutoverImpact {
  const impact: CutoverImpact = {
    invoicesBroughtForward: 0,
    invoicesCounted: 0,
    incomeChangePence: 0,
    vatChangePence: 0,
    activityChanged: 0,
    affectedDates: [],
  };

  for (const inv of rows.invoices) {
    const before = isBroughtForward(inv.issueDate, current);
    const after = isBroughtForward(inv.issueDate, next);
    if (before === after) continue;
    const sign = after ? -1 : 1;
    if (after) impact.invoicesBroughtForward += 1;
    else impact.invoicesCounted += 1;
    impact.incomeChangePence += sign * inv.netPence;
    impact.vatChangePence += sign * inv.vatPence;
    if (inv.issueDate) impact.affectedDates.push(inv.issueDate);
  }

  for (const credit of rows.credits) {
    const before = activityCounts(credit, current);
    const after = activityCounts(credit, next);
    if (before === after) continue;
    // A credit note reduces income, so it moves the opposite way to an invoice.
    const sign = after ? -1 : 1;
    impact.incomeChangePence += sign * credit.netPence;
    impact.vatChangePence += sign * credit.vatPence;
    impact.activityChanged += 1;
    impact.affectedDates.push(credit.date);
  }

  for (const activity of [...rows.payments, ...rows.refunds]) {
    if (activityCounts(activity, current) === activityCounts(activity, next)) {
      continue;
    }
    impact.activityChanged += 1;
    impact.affectedDates.push(activity.date);
  }

  return impact;
}

function dayAfter(iso: string): string {
  const d = new Date(`${iso}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + 1);
  return d.toISOString().slice(0, 10);
}

/** Things worth reading before saving; none of them block the change. */
export function cutoverWarnings(params: {
  cutover: string | null;
  isLimitedCompany: boolean;
  openingBalancesAsAt: string | null;
}): string[] {
  const { cutover, isLimitedCompany, openingBalancesAsAt } = params;
  if (!cutover) return [];
  const warnings = [
    "Alfa reports VAT by issue date. If you use the VAT cash accounting scheme, VAT on payments for brought-forward invoices won't appear here.",
  ];
  if (isLimitedCompany) {
    if (!openingBalancesAsAt) {
      warnings.push(
        "No opening balances are set, so reserves and the corporation tax estimate only include profit from the cutover date. Set them on the Reserves page.",
      );
    } else if (dayAfter(openingBalancesAsAt) !== cutover) {
      warnings.push(
        `Opening balances are as at ${openingBalancesAsAt}, so a cutover of ${dayAfter(openingBalancesAsAt)} keeps reserves complete. Any other date can leave profit out of reserves or count it twice.`,
      );
    }
  }
  return warnings;
}
