import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform";
import { hasDatabaseClient } from "@/db";
import { listPlatformCompanies } from "@/lib/platform/queries";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";

export default async function PlatformCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requirePlatformAdmin();
  const { q } = await searchParams;

  if (!hasDatabaseClient()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Companies</h1>
        <p className="mt-2 text-muted">Connect a database to list companies.</p>
      </div>
    );
  }

  const rows = await listPlatformCompanies({ q });

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Companies</h1>
          <p className="mt-1 text-muted">
            All tenants on the platform ({rows.length}).
          </p>
        </div>
        <form className="flex gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name or slug…"
            className="rounded-full border border-border bg-white px-4 py-2 text-sm"
          />
          <button
            type="submit"
            className="rounded-full bg-navy px-4 py-2 text-sm text-white"
          >
            Search
          </button>
        </form>
      </div>

      <div className="mt-6">
        {rows.length === 0 ? (
          <p className="text-sm text-muted">No companies found.</p>
        ) : (
          <Table>
            <THead>
              <TR>
                <TH>Name</TH>
                <TH>Slug</TH>
                <TH>Type</TH>
                <TH>Members</TH>
                <TH>Jobs</TH>
                <TH>Created</TH>
                <TH>Status</TH>
              </TR>
            </THead>
            <TBody>
              {rows.map((r) => (
                <TR key={r.id}>
                  <TD>
                    <Link
                      href={`/platform/companies/${r.id}`}
                      className="font-medium text-navy hover:underline"
                    >
                      {r.name}
                    </Link>
                  </TD>
                  <TD className="font-mono text-xs text-muted">{r.slug}</TD>
                  <TD className="text-muted">
                    {r.entityType === "limited_company" ? "Ltd" : "Sole trader"}
                  </TD>
                  <TD>{r.memberCount}</TD>
                  <TD className="text-muted">
                    {r.failedInbound + r.failedSend > 0
                      ? `${r.failedInbound + r.failedSend} failed`
                      : "—"}
                  </TD>
                  <TD className="whitespace-nowrap text-muted">
                    {r.createdAt.toLocaleDateString("en-GB")}
                  </TD>
                  <TD>
                    {r.suspendedAt ? (
                      <span className="rounded-full bg-red-100 px-2 py-0.5 text-xs text-red-800">
                        Suspended
                      </span>
                    ) : (
                      <span className="text-xs text-muted">Active</span>
                    )}
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
