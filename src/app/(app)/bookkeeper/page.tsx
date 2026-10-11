import type { Metadata } from "next";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { AskBox } from "@/components/bookkeeper/ask-box";
import {
  CategorySuggestionList,
  FindSuggestionsButton,
  ReceiptMatchList,
} from "@/components/bookkeeper/suggestion-lists";
import { aiGatewayConfigured } from "@/lib/ai/models";
import { formatBankCategory } from "@/lib/bank/categories";
import { DAILY_QUESTION_LIMIT, questionsAskedToday } from "@/lib/bookkeeper/ask";
import { countUncategorisedOutgoing, listCategorySuggestions } from "@/lib/bookkeeper/categories";
import { listAiReceiptMatches } from "@/lib/bookkeeper/receipts";

export const metadata: Metadata = { title: "AI bookkeeper" };

export default async function BookkeeperPage() {
  const { companyId } = await guardTenantPage("accounts:read");
  const [canWrite, canAsk] = await Promise.all([
    hasPermission("accounts:write"),
    hasPermission("reports:read"),
  ]);
  const aiReady = aiGatewayConfigured();
  const [categories, receipts, uncategorised, asked] = await Promise.all([
    listCategorySuggestions(companyId),
    listAiReceiptMatches(companyId),
    countUncategorisedOutgoing(companyId),
    canAsk ? questionsAskedToday(companyId) : Promise.resolve(0),
  ]);

  return (
    <div className="max-w-3xl">
      <h1 className="font-display text-2xl font-semibold">AI bookkeeper</h1>
      <p className="mt-1 text-muted">
        Suggestions to speed up the bookkeeping, and answers from your own figures. Nothing
        changes until someone accepts it.
      </p>
      {!aiReady ? (
        <p className="mt-4 rounded-xl bg-wash px-4 py-3 text-sm">
          AI isn&apos;t set up on this deployment, so questions and AI suggestions are off.
          Categories learned from your own history still work.
        </p>
      ) : null}

      {canAsk && aiReady ? (
        <section className="mt-8">
          <AskBox remaining={Math.max(0, DAILY_QUESTION_LIMIT - asked)} />
        </section>
      ) : null}

      <section className="mt-10">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-lg font-semibold">Spending categories</h2>
            <p className="mt-1 text-sm text-muted">
              {uncategorised} payment{uncategorised === 1 ? "" : "s"} out of the bank without a
              category. Suggestions follow how you&apos;ve categorised the same payee before, and
              get better each time you accept or correct one.
            </p>
          </div>
          {canWrite ? <FindSuggestionsButton /> : null}
        </div>
        <div className="mt-4">
          <CategorySuggestionList
            canWrite={canWrite}
            rows={categories.map((c) => ({
              id: c.id,
              bookedAt: c.bookedAt,
              counterparty: c.counterparty,
              amountPence: c.amountPence,
              categoryLabel: formatBankCategory(c.category),
              reason: c.reason,
              source: c.source,
            }))}
          />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="font-display text-lg font-semibold">Receipts and card payments</h2>
        <p className="mt-1 text-sm text-muted">
          Matches the exact matcher couldn&apos;t make: merchant names that look different on the
          statement, or amounts changed by a tip, fee or exchange rate. Exact matches appear in{" "}
          Transactions as usual.
        </p>
        <div className="mt-4">
          <ReceiptMatchList
            canWrite={canWrite}
            rows={receipts.map((r) => ({
              matchId: r.matchId,
              expenseDescription: r.expenseDescription,
              expenseAmountPence: r.expenseAmountPence,
              spentAt: r.spentAt,
              bankAmountPence: r.bankAmountPence,
              bookedAt: r.bookedAt,
              counterparty: r.counterparty,
              explanation: (r.note ?? "").replace(/^AI:\s*/, ""),
            }))}
          />
        </div>
      </section>
    </div>
  );
}
