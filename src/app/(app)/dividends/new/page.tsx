import { guardTenantPage, hasPermission } from "@/lib/auth";
import { getActiveShareholdersForSplit } from "@/lib/shareholders/queries";
import { DividendDeclareForm } from "@/components/dividends/dividends-form";
import { getReservesPosition } from "@/lib/ledger/queries";
import { PageHeader } from "@/components/ui/page-header";

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
      <PageHeader
        backHref="/dividends"
        backLabel="Dividends"
        title="Create dividend"
        description={
          split.balanced
            ? "Enter a total and it is split across active shareholders by share count."
            : undefined
        }
        className="mb-6"
      />
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
