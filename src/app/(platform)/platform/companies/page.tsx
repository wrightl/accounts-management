import Link from "next/link";
import { requirePlatformAdmin } from "@/lib/platform";
import { hasDatabaseClient } from "@/db";
import {
  isCompanyListFilter,
  countPlatformCompanies,
  listPlatformCompanies,
} from "@/lib/platform/queries";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import { StatusPill } from "@/components/platform/status-pill";
import { ClearFilters } from "@/components/platform/pager";
import { ListPagination } from "@/components/ui/list-pagination";
import { listPageHref, parseListPaging, fetchPage } from "@/lib/list-paging";
import { DisplayDate } from "@/components/date-format-provider";


const FILTER_OPTIONS = [
  { value: "", label: "All companies" },
  { value: "suspended", label: "Suspended" },
  { value: "trialing", label: "Trialing" },
  { value: "active", label: "Paying" },
  { value: "past_due", label: "Past due" },
  { value: "canceled", label: "Canceled / unpaid" },
  { value: "complimentary", label: "Complimentary" },
];

export default async function PlatformCompaniesPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  await requirePlatformAdmin();
  const sp = await searchParams;
  const { q, filter: rawFilter } = sp;
  const filter = isCompanyListFilter(rawFilter) ? rawFilter : undefined;

  if (!hasDatabaseClient()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Companies</h1>
        <p className="mt-2 text-muted">Connect a database to list companies.</p>
      </div>
    );
  }

  const { rows, ...paging } = await fetchPage(
    parseListPaging(sp),
    () => countPlatformCompanies({ q, filter }),
    (window) => listPlatformCompanies({ q, filter, ...window }),
  );

  return (
    <div>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">Companies</h1>
          <p className="mt-1 text-muted">All tenants on the platform.</p>
        </div>
        <form className="flex flex-wrap gap-2">
          <input
            type="search"
            name="q"
            defaultValue={q ?? ""}
            placeholder="Search name or slug…"
            aria-label="Search companies"
            className="rounded-full border border-border bg-white px-4 py-2 text-sm"
          />
          <select
            name="filter"
            defaultValue={filter ?? ""}
            aria-label="Filter companies"
            className="rounded-full border border-border bg-white px-4 py-2 text-sm"
          >
            {FILTER_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <button
            type="submit"
            className="rounded-full bg-navy px-4 py-2 text-sm text-white"
          >
            Search
          </button>
          <ClearFilters path="/platform/companies" active={Boolean(q || filter)} />
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
                <TH>Billing</TH>
                <TH>Jobs</TH>
                <TH>Last activity</TH>
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
                  <TD>
                    {r.complimentary ? (
                      <StatusPill status="complimentary" />
                    ) : r.billingStatus ? (
                      <span className="flex items-center gap-1.5">
                        <StatusPill status={r.billingStatus} />
                        {r.billingPlan && r.billingPlan !== "trial" ? (
                          <span className="text-xs capitalize text-muted">
                            {r.billingPlan}
                          </span>
                        ) : null}
                      </span>
                    ) : (
                      <span className="text-xs text-muted">—</span>
                    )}
                  </TD>
                  <TD>
                    {r.failedInbound + r.failedSend > 0 ? (
                      <StatusPill
                        status="failed"
                        label={`${r.failedInbound + r.failedSend} failed`}
                      />
                    ) : (
                      <span className="text-muted">—</span>
                    )}
                  </TD>
                  <TD className="whitespace-nowrap text-muted">
                    <DisplayDate value={r.lastAuditAt} />
                  </TD>
                  <TD className="whitespace-nowrap text-muted">
                    <DisplayDate value={r.createdAt} />
                  </TD>
                  <TD>
                    {r.suspendedAt ? (
                      <StatusPill status="suspended" />
                    ) : (
                      <span className="text-xs text-muted">Active</span>
                    )}
                  </TD>
                </TR>
              ))}
            </TBody>
          </Table>
        )}
        <ListPagination
          {...paging}
          href={(to) => listPageHref("/platform/companies", sp, to)}
        />
      </div>
    </div>
  );
}
