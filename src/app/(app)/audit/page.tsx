import { desc, eq } from "drizzle-orm";
import { guardTenantPage } from "@/lib/auth";
import { getDb } from "@/db";
import { auditLog, users } from "@/db/schema";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export default async function AuditLogPage() {
  const { companyId } = await guardTenantPage("users:manage");

  const db = getDb();
  const rows = await db
    .select({
      id: auditLog.id,
      action: auditLog.action,
      entityType: auditLog.entityType,
      entityId: auditLog.entityId,
      createdAt: auditLog.createdAt,
      actorEmail: users.email,
      actorName: users.name,
    })
    .from(auditLog)
    .leftJoin(users, eq(auditLog.actorUserId, users.id))
    .where(eq(auditLog.companyId, companyId))
    .orderBy(desc(auditLog.createdAt))
    .limit(200);

  return (
    <div>
      <h1 className="font-display text-2xl font-semibold">Audit log</h1>
      <p className="mt-1 text-muted">
        Recent sensitive actions for this company (admin only).
      </p>

      <div className="mt-6">
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
      </div>
    </div>
  );
}
