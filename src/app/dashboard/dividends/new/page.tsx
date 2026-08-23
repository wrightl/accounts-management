import Link from "next/link";
import { guardPage, hasPermission } from "@/lib/auth";
import { getActiveShareholdersForSplit } from "@/lib/shareholders/queries";
import { DividendDeclareForm } from "@/components/dividends/dividends-form";
import { buttonClasses } from "@/components/ui/button";
import { isDatabaseConfigured } from "@/env";

export default async function NewDividendPage() {
  await guardPage("accounts:write");
  const canWrite = await hasPermission("accounts:write");

  if (!isDatabaseConfigured()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">New dividend</h1>
        <p className="mt-2 text-muted">
          Connect a database to declare dividends.
        </p>
      </div>
    );
  }

  const split = await getActiveShareholdersForSplit();

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/dividends" className={buttonClasses("ghost")}>
          ← Dividends
        </Link>
      </div>
      <h1 className="mb-2 font-display text-2xl font-semibold">New dividend</h1>
      <p className="mb-6 text-sm text-muted">
        Enter a total amount. It is split across all active shareholders by share
        count.
      </p>
      <DividendDeclareForm
        canWrite={canWrite}
        balanced={split.balanced}
        totalShares={split.totalShares}
        shareholders={split.shareholders}
        registerError={
          !split.balanced
            ? split.totalShares == null
              ? "Set total shares on the Shareholders page first."
              : `Active share counts (${split.activeSum}) must equal total shares (${split.totalShares}).`
            : null
        }
      />
    </div>
  );
}
