import { notFound } from "next/navigation";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { recordScopeFor } from "@/lib/accountant/record-scope";
import { RecordQueries } from "@/components/queries/record-queries";
import { getShareholder } from "@/lib/shareholders/queries";
import { listFounders } from "@/lib/expenses/queries";
import { ShareholderForm } from "@/components/shareholders/shareholder-form";
import { PageHeader } from "@/components/ui/page-header";

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
      <PageHeader
        backHref="/shareholders"
        backLabel="Shareholders"
        title={shareholder.name}
        description={
          shareholder.archivedAt
            ? "Archived, so it can't be changed."
            : inPack
              ? `${shareholder.shareCount} shares`
              : undefined
        }
      />
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
