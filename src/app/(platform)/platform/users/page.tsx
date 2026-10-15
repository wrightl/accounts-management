import { requirePlatformAdmin } from "@/lib/platform";
import { hasDatabaseClient } from "@/db";
import { listPlatformUsers } from "@/lib/platform/queries";
import { isPlatformAdminEmail } from "@/lib/bootstrap";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { InvitePlatformAdminButton } from "@/components/platform/invite-admin-form";
import { PlatformAdminActions } from "@/components/platform/platform-admin-actions";
import { StatusPill } from "@/components/platform/status-pill";
import { ClearFilters } from "@/components/platform/pager";
import { findLocalUserId } from "@/lib/users";

export default async function PlatformUsersPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  const session = await requirePlatformAdmin();
  const { q } = await searchParams;

  if (!hasDatabaseClient()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Users</h1>
        <p className="mt-2 text-muted">Connect a database to list users.</p>
      </div>
    );
  }

  const [rows, selfId] = await Promise.all([
    listPlatformUsers({ q }),
    findLocalUserId(session.userId),
  ]);

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
            <ClearFilters path="/platform/users" active={Boolean(q)} />
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
              <TH />
            </TR>
          </THead>
          <TBody>
            {rows.length === 0 ? (
              <TR>
                <TD colSpan={5}>
                  {q ? "No platform admins match that search." : "No platform admins yet."}
                </TD>
              </TR>
            ) : (
              rows.map((r) => {
                const envLocked = isPlatformAdminEmail(r.email);
                return (
                  <TR key={r.id}>
                    <TD>{r.email}</TD>
                    <TD>{r.name ?? "—"}</TD>
                    <TD>
                      {r.clerkUserId ? (
                        <StatusPill status="active" />
                      ) : (
                        <StatusPill status="pending" label="Invite pending" />
                      )}
                    </TD>
                    <TD>{envLocked ? "Env allowlist" : "Invited"}</TD>
                    <TD>
                      <PlatformAdminActions
                        userId={r.id}
                        email={r.email}
                        pendingInvite={!r.clerkUserId}
                        envLocked={envLocked}
                        isSelf={r.id === selfId}
                      />
                    </TD>
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
