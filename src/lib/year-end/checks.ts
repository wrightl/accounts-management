import { formatIsoDateUk } from "@/lib/dates";
import { formatGBP } from "@/lib/money";
import type { PackBankTransaction, YearEndData } from "@/lib/year-end/data";
import { isPersonal, type Figures } from "@/lib/year-end/figures";
import { businessWord } from "@/lib/year-end/labels";

export type CheckItem = {
  text: string;
  /** Where in Alfa to fix it. */
  href?: string;
};

export type Check = {
  key: string;
  title: string;
  /** The pack cannot be downloaded until a blocking check is clear. */
  blocking: boolean;
  items: CheckItem[];
};

export const SETTINGS_HREF = "/settings/business#details";
export const YEAR_END_SETTINGS_HREF = "/settings/business#year-end";
export const BANK_BALANCES_HREF = "/settings/business#bank-balances";

const date = (iso: string | null) => formatIsoDateUk(iso) ?? "no date";

function bankHref(tx: { bookedAt: string }): string {
  return `/transactions?from=${tx.bookedAt}&to=${tx.bookedAt}`;
}

function bankText(tx: PackBankTransaction): string {
  const who = tx.counterparty ?? tx.description ?? tx.reference ?? "No description";
  return `${date(tx.bookedAt)} · ${who} · ${formatGBP(tx.amountPence)}`;
}

const MONTHS = [
  "january",
  "february",
  "march",
  "april",
  "may",
  "june",
  "july",
  "august",
  "september",
  "october",
  "november",
  "december",
];

/**
 * Whether a description names a month or a year and none of those it names is
 * the spend date's, e.g. "March hosting" dated in April.
 */
export function namesAnotherPeriod(description: string, spentAt: string): boolean {
  const spendYear = Number(spentAt.slice(0, 4));
  const spendMonth = Number(spentAt.slice(5, 7));
  const months = new Set<number>();
  for (const [word] of description.matchAll(/[A-Za-z]+/g)) {
    const lower = word.toLowerCase();
    // "may" and "march" are also ordinary words, so those need a capital.
    const ordinary = lower === "may" || lower === "march";
    if (ordinary && word[0] !== word[0]!.toUpperCase()) continue;
    const index = MONTHS.findIndex(
      (m) => m === lower || (lower.length === 3 && lower !== "may" && m.startsWith(lower)) ||
        (lower === "sept" && m === "september"),
    );
    if (index >= 0) months.add(index + 1);
  }
  const years = new Set([...description.matchAll(/\b(20\d{2})\b/g)].map((m) => Number(m[1])));
  if (months.size > 0 && !months.has(spendMonth)) return true;
  return years.size > 0 && !years.has(spendYear);
}

const normalise = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();

/** Every check for the period. A check with no items has passed. */
export function runChecks(
  data: YearEndData,
  figures: Figures,
  /** Summary figures that don't equal the sum of their detail tab. */
  summaryMismatches: CheckItem[] = [],
): Check[] {
  const { company, isLimited } = data;
  const business = businessWord(isLimited);
  const checks: Check[] = [];
  const add = (key: string, title: string, items: CheckItem[], blocking = false) =>
    checks.push({ key, title, blocking, items });

  // --- Blocking: details the pack cannot be read without -----------------------

  const missing: CheckItem[] = [];
  const need = (isMissing: boolean, text: string, href: string) => {
    if (isMissing) missing.push({ text, href });
  };
  if (isLimited) {
    need(!company.legalName.trim(), "Legal name", SETTINGS_HREF);
    need(!company.companyNumber?.trim(), "Company number", SETTINGS_HREF);
    need(
      !(company.financialYearEndMonth >= 1 && company.financialYearEndMonth <= 12),
      "Financial year end",
      YEAR_END_SETTINGS_HREF,
    );
  } else {
    need(!company.legalName.trim() || !data.owner, "Owner's name", SETTINGS_HREF);
    need(!company.accountingBasis, "Accounting basis (cash basis or traditional accruals)", YEAR_END_SETTINGS_HREF);
  }
  for (const account of data.bankAccounts) {
    need(
      // An account with no transactions and no balance is left off the pack.
      account.startBalancePence == null && account.hasTransactions,
      `Opening balance for the bank account "${account.name}"`,
      BANK_BALANCES_HREF,
    );
  }
  add(
    "required-details",
    `Details needed before the pack can be downloaded`,
    missing,
    true,
  );

  // --- Details the accountant will ask for --------------------------------------

  const details: CheckItem[] = [];
  if (!company.utr?.trim()) {
    details.push({
      text: isLimited ? "Company UTR" : "Self Assessment UTR",
      href: SETTINGS_HREF,
    });
  }
  if (isLimited) {
    if (!data.totalShares) details.push({ text: "Total shares in issue", href: "/shareholders" });
    for (const s of data.shareholders) {
      if (!s.name.trim().includes(" ")) {
        details.push({ text: `Shareholder "${s.name}" needs a full name`, href: "/shareholders" });
      }
    }
  } else if (!company.tradingStartedOn) {
    details.push({ text: "Date trading started", href: SETTINGS_HREF });
  }
  if (data.bankAccounts.length === 0) {
    details.push({
      text: `No bank account is set up in Alfa, so the pack has no bank balances`,
      href: "/transactions",
    });
  }
  add("missing-details", "Missing details", details);

  // --- Bank ---------------------------------------------------------------------

  add(
    "bank-unmatched",
    "Bank transactions with no match",
    figures.unmatched.map((tx) => ({ text: bankText(tx), href: bankHref(tx) })),
  );

  if (!isLimited && data.owner) {
    const ownerName = normalise(data.owner.name);
    const names = ownerName.split(" ").filter((part) => part.length > 1);
    const mentionsOwner = (tx: PackBankTransaction) => {
      const text = normalise([tx.counterparty, tx.reference, tx.description].filter(Boolean).join(" "));
      return (
        names.length > 0 &&
        (text.includes(ownerName) || (names.length > 1 && [names[0]!, names.at(-1)!].every((n) => text.split(" ").includes(n))))
      );
    };
    const ownerTransfers = data.bankTransactions.filter(
      (tx) =>
        tx.matches.some((m) => m.matchType === "transfer") ||
        (tx.matches.length === 0 && mentionsOwner(tx)),
    );
    add(
      "owner-transfers",
      "Transfers to or from the owner not marked as drawings or money put in",
      ownerTransfers.map((tx) => ({ text: bankText(tx), href: bankHref(tx) })),
    );
  }

  // --- Sales --------------------------------------------------------------------

  const payments = data.invoices.flatMap((invoice) =>
    invoice.payments.map((payment) => ({ invoice, payment })),
  );
  add(
    "payments-unlinked",
    "Invoice payments not linked to a bank transaction",
    payments
      .filter(({ payment }) => !payment.bank)
      .map(({ invoice, payment }) => ({
        text: `${invoice.number} · ${invoice.clientName} · ${formatGBP(payment.amountPence)} received ${date(payment.receivedOn)}`,
        href: `/invoices/${invoice.id}`,
      })),
  );

  // One bank line can settle several records, so compare it with all of them together.
  const differences: CheckItem[] = [];
  const paymentsByBank = Map.groupBy(
    payments.filter(({ payment }) => payment.bank),
    ({ payment }) => payment.bank!.bankTransactionId,
  );
  for (const group of paymentsByBank.values()) {
    const bank = group[0]!.payment.bank!;
    const recorded = group.reduce((total, { payment }) => total + payment.amountPence, 0);
    if (recorded === bank.amountPence) continue;
    differences.push({
      text: `Invoice payment ${[...new Set(group.map((g) => g.invoice.number))].join(", ")}: ${formatGBP(recorded)} recorded, ${formatGBP(bank.amountPence)} on the bank line of ${date(bank.bookedAt)}`,
      href: `/invoices/${group[0]!.invoice.id}`,
    });
  }
  const relevantExpenses = [...new Set([...figures.periodExpenses, ...figures.spentInPeriod])];
  const expensesByBank = Map.groupBy(
    relevantExpenses.filter((e) => e.bank),
    (e) => e.bank!.bankTransactionId,
  );
  for (const group of expensesByBank.values()) {
    const bank = group[0]!.bank!;
    const recorded = group.reduce((total, e) => total + e.amountPence, 0);
    if (recorded === -bank.amountPence) continue;
    differences.push({
      text: `Expense ${group.map((e) => figures.expenseRef.get(e.id)).join(", ")} (${group[0]!.description}): ${formatGBP(recorded)} recorded, ${formatGBP(-bank.amountPence)} on the bank line of ${date(bank.bookedAt)}`,
      href: `/expenses/${group[0]!.id}`,
    });
  }
  add("amount-differences", "Matched pairs where the amounts differ", differences);

  const payers = new Map<string, { names: Set<string>; invoiceId: string; payer: string }>();
  for (const { invoice, payment } of payments) {
    const payer = payment.bank?.counterparty?.trim();
    if (!payer) continue;
    const entry = payers.get(normalise(payer)) ?? { names: new Set(), invoiceId: invoice.id, payer };
    entry.names.add(invoice.clientName);
    payers.set(normalise(payer), entry);
  }
  add(
    "client-names",
    "Invoices paid by the same payer under different client names",
    [...payers.values()]
      .filter((p) => p.names.size > 1)
      .map((p) => ({
        text: `Payments from "${p.payer}" are against invoices for ${[...p.names].join(" and ")}`,
        href: "/clients",
      })),
  );

  add(
    "owed-to-customers",
    `Invoices with money owed back to the customer at the period end: overpaid, or credited after payment${
      data.basis === "cash" ? " (the amount is included in money received)" : ""
    }`,
    figures.owedToCustomers.map(({ invoice, pence }) => ({
      text: `${invoice.number} · ${invoice.clientName} · ${formatGBP(pence)} owed back`,
      href: `/invoices/${invoice.id}`,
    })),
  );

  // --- Expenses -----------------------------------------------------------------

  const expenseItem = (e: (typeof relevantExpenses)[number], extra = ""): CheckItem => ({
    text: `${figures.expenseRef.get(e.id)} · ${date(e.spentAt)} · ${e.description} · ${formatGBP(e.amountPence)}${extra}`,
    href: `/expenses/${e.id}`,
  });
  add(
    "expenses-uncategorised",
    "Expenses with no category",
    relevantExpenses.filter((e) => !e.category).map((e) => expenseItem(e)),
  );
  add(
    "expenses-no-receipt",
    "Expenses with no receipt",
    relevantExpenses
      // A mileage claim has no receipt to attach.
      .filter((e) => e.receipts.length === 0 && !e.mileageMiles)
      .map((e) => expenseItem(e)),
  );
  add(
    "expenses-other-period",
    "Expenses whose description names a different month or year from the spend date",
    relevantExpenses
      .filter((e) => e.spentAt && namesAnotherPeriod(e.description, e.spentAt))
      .map((e) => expenseItem(e)),
  );
  if (data.basis === "cash") {
    add(
      "expenses-no-bank-date",
      `Expenses paid by the ${business} with no bank payment found (counted on the spend date)`,
      figures.periodExpenses
        .filter((e) => !e.bank && !isPersonal(e))
        .map((e) => expenseItem(e)),
    );
  }

  const reimbursementItems: CheckItem[] = [];
  for (const run of data.reimbursements) {
    const items = run.expenseIds.map((id) => data.expenses.get(id)!);
    const itemTotal = items.reduce((total, e) => total + e.amountPence, 0);
    const payee = data.people.get(run.payeeUserId)?.name ?? "Person not recorded";
    if (items.length === 0) {
      reimbursementItems.push({
        text: `Reimbursement of ${formatGBP(run.totalPence)} to ${payee} on ${date(run.paidOn)} has no expenses listed`,
        href: `/reimbursements/${run.id}`,
      });
    } else if (itemTotal !== run.totalPence) {
      reimbursementItems.push({
        text: `Reimbursement to ${payee} on ${date(run.paidOn)}: ${formatGBP(run.totalPence)} paid, but its expenses add up to ${formatGBP(itemTotal)}`,
        href: `/reimbursements/${run.id}`,
      });
    }
  }
  add(
    "reimbursement-items",
    "Reimbursements that do not match their expense records",
    reimbursementItems,
  );

  add(
    "summary-ties",
    "Summary figures that do not equal the sum of their detail tab",
    summaryMismatches,
  );

  return checks;
}

export function blockingItems(checks: Check[]): CheckItem[] {
  return checks.filter((c) => c.blocking).flatMap((c) => c.items);
}

export function outstandingCount(checks: Check[]): number {
  return checks.reduce((total, c) => total + c.items.length, 0);
}
