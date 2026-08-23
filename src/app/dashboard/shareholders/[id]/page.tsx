import Link from "next/link";
import { notFound } from "next/navigation";
import { guardPage, hasPermission } from "@/lib/auth";
import { getShareholder } from "@/lib/shareholders/queries";
import { listFounders } from "@/lib/expenses/queries";
import { ShareholderForm } from "@/components/shareholders/shareholder-form";
import { buttonClasses } from "@/components/ui/button";
import { isDatabaseConfigured } from "@/env";

export default async function ShareholderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await guardPage("accounts:read");
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  if (!isDatabaseConfigured()) {
    return <p className="text-muted">Connect a database to view shareholders.</p>;
  }

  const [shareholder, founders] = await Promise.all([
    getShareholder(id),
    listFounders(),
  ]);
  if (!shareholder) notFound();

  return (
    <div>
      <div className="mb-6">
        <Link href="/dashboard/shareholders" className={buttonClasses("ghost")}>
          ← Shareholders
        </Link>
      </div>
      <h1 className="mb-2 font-display text-2xl font-semibold">
        {shareholder.name}
      </h1>
      {shareholder.archivedAt && (
        <p className="mb-6 text-sm text-muted">Archived — read only.</p>
      )}
      {!shareholder.archivedAt && (
        <div className="mt-6">
          <ShareholderForm
            mode="edit"
            shareholder={{
              id: shareholder.id,
              name: shareholder.name,
              shareCount: shareholder.shareCount,
              userId: shareholder.userId,
            }}
            users={founders}
            canWrite={canWrite}
          />
        </div>
      )}
    </div>
  );
}
