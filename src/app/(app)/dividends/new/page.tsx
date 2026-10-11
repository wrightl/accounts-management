import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { getActiveShareholdersForSplit } from "@/lib/shareholders/queries";
import { DividendDeclareForm } from "@/components/dividends/dividends-form";
import { buttonClasses } from "@/components/ui/button";
import { getReservesPosition } from "@/lib/ledger/queries";

export default async function NewDividendPage({
  searchParams,
}: {
  searchParams: Promise<{ amount?: string }>;
}) {
  const { companyId } = await guardTenantPage("accounts:write");
  const canWrite = await hasPermission("accounts:write");
  const { amount } = await searchParams;
  // Prefilled from "Safe to pay yourself".
  const defaultAmount = amount && /^\d+(\.\d{1,2})?$/.test(amount) ? amount : "";

  const [split, reserves] = await Promise.all([
    getActiveShareholdersForSplit(companyId),
    getReservesPosition(companyId),
  ]);

  return (
    <div>
      <div className="mb-6">
        <Link href="/dividends" className={buttonClasses("ghost")}>
          ← Dividends
        </Link>
      </div>
      <h1 className="mb-2 font-display text-2xl font-semibold">New dividend</h1>
      {split.balanced && (
        <p className="mb-6 text-sm text-muted">
          Enter a total amount. It is split across all active shareholders by share
          count.
        </p>
      )}
      <DividendDeclareForm
        canWrite={canWrite}
        balanced={split.balanced}
        totalShares={split.totalShares}
        shareholders={split.shareholders}
        availablePence={reserves.availablePence}
        defaultAmountPounds={defaultAmount}
        hasOpeningBalances={reserves.hasOpeningBalances}
        registerError={
          !split.balanced
            ? split.shareholders.length === 0
              ? "Add at least one active shareholder before declaring a dividend."
              : `Active share counts (${split.activeSum}) must equal total shares (${split.totalShares}).`
            : null
        }
      />
    </div>
  );
}
