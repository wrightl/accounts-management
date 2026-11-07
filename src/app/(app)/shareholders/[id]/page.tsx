import { notFound } from "next/navigation";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { recordScopeFor } from "@/lib/accountant/record-scope";
import { RecordQueries } from "@/components/queries/record-queries";
import { getShareholder } from "@/lib/shareholders/queries";
import { listFounders } from "@/lib/expenses/queries";
import { ShareholderForm } from "@/components/shareholders/shareholder-form";
import { BackLink } from "@/components/ui/back-link";

export default async function ShareholderDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { companyId, role } = await guardTenantPage("records:read");
  const inPack = recordScopeFor(role) === "pack";
  const canWrite = await hasPermission("accounts:write");
  const { id } = await params;

  const [shareholder, founders] = await Promise.all([
    getShareholder(companyId, id),
    inPack ? [] : listFounders(companyId),
  ]);
  if (!shareholder) notFound();

  return (
    <div>
      <div className="mb-6">
        <BackLink href="/shareholders">Shareholders</BackLink>
      </div>
      <h1 className="mb-2 font-display text-2xl font-semibold">
        {shareholder.name}
      </h1>
      {shareholder.archivedAt && (
        <p className="mb-6 text-sm text-muted">Archived — read only.</p>
      )}
      {inPack ? (
        <p className="text-sm text-muted">{shareholder.shareCount} shares</p>
      ) : null}
      {!shareholder.archivedAt && !inPack && (
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
      <RecordQueries companyId={companyId} role={role} kind="shareholder" recordId={shareholder.id} />
    </div>
  );
}
