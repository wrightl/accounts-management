import { listAuditPage } from "@/lib/audit";
import { guardTenantPage } from "@/lib/auth";
import { listPageHref, parseListPaging } from "@/lib/list-paging";
import { ListPagination } from "@/components/ui/list-pagination";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { SettingsPageHeader } from "@/components/settings/settings-page-header";

export default async function AuditLogPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await guardTenantPage("users:manage");
  const sp = await searchParams;
  const { rows, ...paging } = await listAuditPage(companyId, parseListPaging(sp));

  return (
    <div>
      <SettingsPageHeader
        title="Audit log"
        description="Sensitive changes to this company and who made them. Admins only."
      />

      <div>
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No audit entries yet.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>When</TH>
                <TH>Actor</TH>
                <TH>Action</TH>
                <TH>Entity</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD className="whitespace-nowrap text-muted">
                    {r.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                  </TD>
                  <TD>{r.actorName || r.actorEmail || "—"}</TD>
                  <TD className="font-mono text-xs">{r.action}</TD>
                  <TD className="text-muted text-xs">
                    {r.entityType ?? "—"}
                    {r.entityId ? ` · ${r.entityId.slice(0, 8)}` : ""}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <ListPagination {...paging} href={(to) => listPageHref("/audit", sp, to)} />
      </div>
    </div>
  );
}
