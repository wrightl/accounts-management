import { describe, expect, it } from "vitest";
import { generateDemoBooks, type DemoBooks } from "@/lib/demo/generate";
import { addMonths } from "@/lib/demo/calendar";
import { DEMO_COMPANY } from "@/lib/demo/story";

const PEOPLE = {
  leadId: "00000000-0000-4000-8000-000000000001",
  secondId: "00000000-0000-4000-8000-000000000002",
  accountantId: "00000000-0000-4000-8000-000000000003",
};
const COMPANY = "11111111-1111-4111-8111-111111111111";

function books(today: string): DemoBooks {
  return generateDemoBooks({ companyId: COMPANY, today, people: PEOPLE });
}

const ANCHORS = ["2026-11-18", "2027-04-02", "2028-01-31"];

describe("generateDemoBooks", () => {
  it("gives the same books for the same day", () => {
    expect(books("2026-11-18")).toEqual(books("2026-11-18"));
  });

  it("gives different ids on a different day, so a reset never reuses them", () => {
    expect(books("2026-11-18").invoices[0]!.id).not.toBe(books("2026-11-19").invoices[0]!.id);
  });

  for (const today of ANCHORS) {
    describe(`anchored on ${today}`, () => {
      const b = books(today);
      const endOfToday = new Date(`${today}T23:59:59Z`);

      it("covers at least three years", () => {
        expect(b.recordsStart <= addMonths(today, -36)).toBe(true);
        expect(b.recordsStart.endsWith("-04-01")).toBe(true);
        const months = new Set(b.invoices.filter((i) => i.status !== "draft").map((i) => i.issueDate!.slice(0, 7)));
        expect(months.size).toBeGreaterThanOrEqual(36);
      });

      it("records nothing after today", () => {
        const dates = [
          ...b.invoices.map((i) => i.issueDate!),
          ...b.expenses.map((e) => e.spentAt!),
          ...b.bankTransactions.map((t) => t.bookedAt),
          ...b.creditNotes.map((c) => c.issueDate),
          ...b.dividendDeclarations.map((d) => d.declaredAt),
          ...b.quotes.map((q) => q.issueDate!),
          ...b.orders.map((o) => o.issueDate!),
          ...b.deadlineFilings.map((f) => f.filedOn),
        ];
        expect(dates.filter((d) => d > today)).toEqual([]);
        const stamps = [
          ...b.payments.map((p) => p.receivedAt as Date),
          ...b.notifications.map((n) => n.createdAt as Date),
          ...b.weeklyCloses.map((w) => w.closedAt as Date),
        ];
        expect(stamps.filter((s) => s > endOfToday)).toEqual([]);
      });

      it("keeps every bank balance consistent and in credit", () => {
        for (const account of b.bankAccounts) {
          const rows = b.bankTransactions.filter((t) => t.bankAccountId === account.id);
          let running = account.openingBalancePence!;
          for (const row of rows) {
            running += row.amountPence;
            const stated = Math.round(Number((row.raw as Record<string, string>)["Balance (GBP)"]) * 100);
            expect(stated).toBe(running);
            expect(running).toBeGreaterThan(0);
          }
        }
        expect(b.bankAccounts[0]!.openingBalancePence).toBe(DEMO_COMPANY.openingCurrentAccountPence);
      });

      it("settles every paid invoice in full", () => {
        const paid = new Map<string, number>();
        for (const p of b.payments) paid.set(p.invoiceId, (paid.get(p.invoiceId) ?? 0) + p.amountPence);
        for (const c of b.creditNotes) paid.set(c.invoiceId, (paid.get(c.invoiceId) ?? 0) + c.grossPence! - c.refundedPence!);
        for (const w of b.writeOffs) paid.set(w.invoiceId, (paid.get(w.invoiceId) ?? 0) + w.amountPence);
        for (const inv of b.invoices.filter((i) => i.status === "paid")) {
          expect(paid.get(inv.id!), inv.number).toBe(inv.grossPence);
        }
      });

      it("shows debts in every age bucket", () => {
        const overdueDays = b.invoices
          .filter((i) => i.status === "sent" && i.dueDate! < today)
          .map((i) => (Date.parse(today) - Date.parse(i.dueDate!)) / 86_400_000);
        expect(overdueDays.some((d) => d <= 30)).toBe(true);
        expect(overdueDays.some((d) => d > 30 && d <= 60)).toBe(true);
        expect(overdueDays.some((d) => d > 60)).toBe(true);
      });

      it("leaves only the last three weeks of bank lines to reconcile", () => {
        const confirmed = new Set(b.reconciliationMatches.filter((m) => m.confirmed).map((m) => m.bankTransactionId));
        const open = b.bankTransactions.filter((t) => !confirmed.has(t.id!));
        expect(open.length).toBeGreaterThan(3);
        const cutoff = new Date(Date.parse(today) - 22 * 86_400_000).toISOString().slice(0, 10);
        expect(open.filter((t) => t.bookedAt < cutoff)).toEqual([]);
      });

      it("uses unique ids and document numbers", () => {
        const ids = Object.values(b)
          .filter(Array.isArray)
          .flat()
          .map((r) => (r as { id?: string }).id)
          .filter(Boolean);
        expect(new Set(ids).size).toBe(ids.length);
        for (const list of [b.invoices, b.quotes, b.orders, b.creditNotes]) {
          const numbers = list.map((d) => d.number);
          expect(new Set(numbers).size).toBe(numbers.length);
          expect(numbers.every((n) => /^[A-Z]+-\d{4}-\d{4}$/.test(n))).toBe(true);
        }
      });

      it("shows the features the demo is for", () => {
        expect(b.quotes.some((q) => q.status === "sent" && q.validUntil! >= today)).toBe(true);
        expect(b.quotes.some((q) => q.status === "declined" && q.declinedReasonCategory)).toBe(true);
        expect(b.orders.some((o) => o.status === "active")).toBe(true);
        expect(b.recurringInvoices.filter((r) => r.enabled).length).toBe(3);
        expect(b.invoices.some((i) => i.status === "draft")).toBe(true);
        expect(b.invoices.some((i) => i.status === "void")).toBe(true);
        expect(b.invoices.some((i) => i.latePaymentForInvoiceId)).toBe(true);
        expect(b.writeOffs.map((w) => w.kind).sort()).toEqual(["bad_debt", "bad_debt", "bank_charges"]);
        expect(b.creditNotes.some((c) => c.refundedPence! > 0)).toBe(true);
        expect(b.expenses.some((e) => e.status === "pending")).toBe(true);
        expect(b.expenses.some((e) => e.detectedCurrency === "USD")).toBe(true);
        expect(b.expenses.some((e) => e.mileageMiles)).toBe(true);
        expect(b.expenses.some((e) => e.coversTo)).toBe(true);
        expect(b.reimbursements.some((r) => r.status === "pending")).toBe(true);
        expect(b.dividendDeclarations.length).toBeGreaterThanOrEqual(5);
        expect(b.invoiceLineItems.some((l) => l.expenseId)).toBe(true);
        expect(b.reconciliationMatches.some((m) => !m.confirmed && m.note?.startsWith("AI:"))).toBe(true);
        expect(b.accountantQueries.some((q) => q.status === "open")).toBe(true);
        expect(b.company.booksLockedThrough).toBeTruthy();
      });
    });
  }
});
