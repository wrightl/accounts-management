import Link from "next/link";
import { notFound } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/platform";
import { hasDatabaseClient } from "@/db";
import { getPlatformCompanyDetail } from "@/lib/platform/queries";
import { getCompanyBillingDetail } from "@/lib/platform/billing-queries";
import { Table, THead, TBody, TR, TH, TD } from "@/components/ui/table";
import {
  CompanyDeleteForm,
  CompanyInviteAdminForm,
  CompanySupportNoteForm,
  CompanySuspendForm,
} from "@/components/platform/company-ops-forms";
import { CompanyBillingOpsForm } from "@/components/platform/company-billing-ops";
import { roleLabel, isRole } from "@/lib/roles";

export default async function PlatformCompanyDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  await requirePlatformAdmin();
  const { id } = await params;

  if (!hasDatabaseClient()) {
    return (
      <div>
        <h1 className="font-display text-2xl font-semibold">Company</h1>
        <p className="mt-2 text-muted">Connect a database to inspect companies.</p>
      </div>
    );
  }

  const detail = await getPlatformCompanyDetail(id);
  if (!detail) notFound();

  const { company, members, recentAudit, notes, inboundCounts, sendCounts } =
    detail;
  const { billing, entitlements } = await getCompanyBillingDetail(id);

  return (
    <div>
      <p className="text-sm text-muted">
        <Link href="/platform/companies" className="hover:underline">
          ← Companies
        </Link>
      </p>
      <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="font-display text-2xl font-semibold">{company.name}</h1>
          <p className="mt-1 text-muted">
            {company.legalName} ·{" "}
            <span className="font-mono text-xs">{company.slug}</span>
          </p>
        </div>
        {company.suspendedAt ? (
          <span className="rounded-full bg-red-100 px-3 py-1 text-sm text-red-800">
            Suspended
            {company.suspendedReason ? `: ${company.suspendedReason}` : ""}
          </span>
        ) : null}
      </div>

      <div className="mt-8 grid gap-6 lg:grid-cols-2">
        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="font-display text-lg font-semibold">Profile</h2>
          <dl className="mt-3 space-y-2 text-sm">
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Entity</dt>
              <dd>
                {company.entityType === "limited_company"
                  ? "Limited company"
                  : "Sole trader"}
              </dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Email</dt>
              <dd>{company.email ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Company number</dt>
              <dd>{company.companyNumber ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Bank</dt>
              <dd>{company.bankName ?? company.bankProvider ?? "—"}</dd>
            </div>
            <div className="flex justify-between gap-4">
              <dt className="text-muted">Created</dt>
              <dd>{company.createdAt.toLocaleString("en-GB")}</dd>
            </div>
          </dl>
        </section>

        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="font-display text-lg font-semibold">Job counts</h2>
          <dl className="mt-3 grid grid-cols-2 gap-3 text-sm">
            <div>
              <dt className="text-muted">Inbound pending</dt>
              <dd className="text-lg font-semibold">{inboundCounts.pending}</dd>
            </div>
            <div>
              <dt className="text-muted">Inbound failed</dt>
              <dd className="text-lg font-semibold">{inboundCounts.failed}</dd>
            </div>
            <div>
              <dt className="text-muted">Send pending</dt>
              <dd className="text-lg font-semibold">{sendCounts.pending}</dd>
            </div>
            <div>
              <dt className="text-muted">Send failed</dt>
              <dd className="text-lg font-semibold">{sendCounts.failed}</dd>
            </div>
          </dl>
        </section>

        <CompanySuspendForm
          companyId={company.id}
          suspended={Boolean(company.suspendedAt)}
        />

        <CompanyDeleteForm
          companyId={company.id}
          companyName={company.name}
        />

        <CompanyBillingOpsForm
          companyId={company.id}
          complimentary={entitlements.complimentary}
          plan={billing.plan}
          status={billing.status}
          trialEndsAt={billing.trialEndsAt}
          currentPeriodEnd={billing.currentPeriodEnd}
          stripeCustomerId={billing.stripeCustomerId}
          stripeSubscriptionId={billing.stripeSubscriptionId}
          complimentaryNote={billing.complimentaryNote}
          complimentaryExpiresAt={billing.complimentaryExpiresAt}
          readOnly={entitlements.readOnly}
        />

        <section className="rounded-2xl border border-border bg-white p-5">
          <h2 className="font-display text-lg font-semibold">Invite admin</h2>
          <p className="mt-1 text-sm text-muted">
            Send a Clerk invite and attach the user as company admin.
          </p>
          <CompanyInviteAdminForm companyId={company.id} />
        </section>
      </div>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">Members</h2>
        <div className="mt-3">
          <Table>
            <THead>
              <TR>
                <TH>Email</TH>
                <TH>Name</TH>
                <TH>Role</TH>
              </TR>
            </THead>
            <TBody>
              {members.map((m) => (
                <TR key={m.id}>
                  <TD>{m.email}</TD>
                  <TD>{m.name ?? "—"}</TD>
                  <TD>{isRole(m.role) ? roleLabel(m.role) : m.role}</TD>
                </TR>
              ))}
            </TBody>
          </Table>
        </div>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">Support notes</h2>
        <CompanySupportNoteForm companyId={company.id} />
        <ul className="mt-4 space-y-3">
          {notes.length === 0 ? (
            <li className="text-sm text-muted">No notes yet.</li>
          ) : (
            notes.map((n) => (
              <li
                key={n.id}
                className="rounded-xl border border-border bg-white p-4 text-sm"
              >
                <p className="whitespace-pre-wrap">{n.body}</p>
                <p className="mt-2 text-xs text-muted">
                  {n.authorName ?? n.authorEmail ?? "Unknown"} ·{" "}
                  {n.createdAt.toLocaleString("en-GB")}
                </p>
              </li>
            ))
          )}
        </ul>
      </section>

      <section className="mt-8">
        <h2 className="font-display text-lg font-semibold">Recent activity</h2>
        <div className="mt-3">
          {recentAudit.length === 0 ? (
            <p className="text-sm text-muted">No audit entries.</p>
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
                {recentAudit.map((r) => (
                  <TR key={r.id}>
                    <TD className="whitespace-nowrap text-muted">
                      {r.createdAt.toLocaleString("en-GB")}
                    </TD>
                    <TD>{r.actorName ?? r.actorEmail ?? "—"}</TD>
                    <TD className="font-mono text-xs">{r.action}</TD>
                    <TD className="text-muted">
                      {r.entityType ?? "—"}
                      {r.entityId ? ` ${r.entityId.slice(0, 8)}` : ""}
                    </TD>
                  </TR>
                ))}
              </TBody>
            </Table>
          )}
        </div>
      </section>
    </div>
  );
}
