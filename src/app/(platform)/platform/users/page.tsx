import { requirePlatformAdmin } from "@/lib/platform";
import { isDatabaseConfigured } from "@/env";
import { hasDatabaseClient } from "@/db";
import { listPlatformUsers } from "@/lib/platform/queries";
import { isPlatformAdminEmail } from "@/lib/bootstrap";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { InvitePlatformAdminButton } from "@/components/platform/invite-admin-form";

export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePlatformAdmin();
  const { q } = await searchParams;

  if (!isDatabaseConfigured() || !hasDatabaseClient()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Users</h1>
        <p className="mt-2 text-muted">Connect a database to list users.</p>
      </div>
    );
  }

  const rows = await listPlatformUsers({ q });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Users</h1>
          <p className="mt-1 text-muted">
            Platform operators only. They cannot belong to a company.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <form className="flex gap-2">
            <input
              type="search"
              name="q"
              defaultValue={q ?? ""}
              placeholder="Search email or name…"
              className="rounded-full border border-border bg-white px-4 py-2 text-sm"
            />
            <button
              type="submit"
              className="rounded-full bg-navy px-4 py-2 text-sm text-white"
            >
              Search
            </button>
          </form>
          <InvitePlatformAdminButton />
        </div>
      </div>

      <div className="mt-6">
        <Table>
          <THead>
            <TR>
              <TH>Email</TH>
              <TH>Name</TH>
              <TH>Status</TH>
              <TH>Source</TH>
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TR>
                <TD colSpan={4}>No platform admins yet.</TD>
              </TR>
            ) : (
              rows.map((r) => {
                const envLocked = isPlatformAdminEmail(r.email);
                return (
                  <TR key={r.id}>
                    <TD>{r.email}</TD>
                    <TD>{r.name ?? "—"}</TD>
                    <TD>{r.clerkUserId ? "Active" : "Pending invite"}</TD>
                    <TD>{envLocked ? "Env allowlist" : "Invited"}</TD>
                  </TR>
                );
              })
            )}
          </TBody>
        </Table>
      </div>
    </div>
  );
}
