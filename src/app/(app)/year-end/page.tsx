import { Download } from "lucide-react";
import Link from "next/link";
import { guardTenantPage, hasPermission } from "@/lib/auth";
import { getEntitlements } from "@/lib/billing/entitlements";
import { todayIsoDate } from "@/lib/dates";
import { getCompanySettings } from "@/lib/settings/queries";
import { blockingItems, outstandingCount, type Check } from "@/lib/year-end/checks";
import { earliestRecordDate } from "@/lib/year-end/data";
import { prepareYearEndPack } from "@/lib/year-end/pack";
import {
  defaultYear,
  isCompleted,
  isStandardYear,
  listYears,
  parsePeriod,
  periodLabel,
  yearEndRule,
} from "@/lib/year-end/period";
import { listYearEndRuns, yearStatus, type YearEndRun, type YearStatus } from "@/lib/year-end/runs";
import { TAB } from "@/lib/year-end/tabs";
import { AccountantNotes } from "@/components/year-end/accountant-notes";
import { YearChooser } from "@/components/year-end/year-chooser";
import { DisplayDate } from "@/components/date-format-provider";
import { buttonClasses } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/page-header";
import { Table, TBody, TD, TH, THead, TR } from "@/components/ui/table";
import { cn } from "@/lib/utils";

/** Items shown per check on screen; the workbook's Notes for the accountant tab lists them all. */
const ITEMS_SHOWN = 20;

const STATUS_LABEL: Record<YearStatus, string> = {
  not_started: "Not started",
  checks_outstanding: "Checks outstanding",
  ready: "Ready to export",
  exported: "Exported",
};

const STATUS_STYLE: Record<YearStatus, string> = {
  not_started: "bg-wash text-muted",
  checks_outstanding: "bg-amber-100 text-amber-900",
  ready: "bg-accent/30 text-navy",
  exported: "bg-success/15 text-success",
};

function StatusPill({ status }: { status: YearStatus }) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium",
        STATUS_STYLE[status],
      )}
    >
      {STATUS_LABEL[status]}
    </span>
  );
}

function StepHeading({ step, children }: { step: number; children: React.ReactNode }) {
  return (
    <h2 className="flex items-center gap-3 font-display text-lg font-semibold">
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-navy text-sm text-white">
        {step}
      </span>
      {children}
    </h2>
  );
}

function CheckCard({ check }: { check: Check }) {
  const shown = check.items.slice(0, ITEMS_SHOWN);
  const more = check.items.length - shown.length;
  return (
    <Card className={cn("p-5", check.blocking && "border-red-300")}>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="font-medium">{check.title}</h3>
        <span className={cn("text-sm", check.blocking ? "text-red-700" : "text-muted")}>
          {check.blocking
            ? "Fix before downloading"
            : `${check.items.length} to review`}
        </span>
      </div>
      <ul className="mt-3 space-y-1.5 text-sm">
        {shown.map((item, i) => (
          <li key={i}>
            {item.href ? (
              <Link href={item.href} className="underline decoration-navy/30 hover:decoration-navy">
                {item.text}
              </Link>
            ) : (
              item.text
            )}
          </li>
        ))}
      </ul>
      {more > 0 ? (
        <p className="mt-3 text-sm text-muted">
          And {more} more. All of them are listed on the workbook&apos;s {TAB.notes} tab.
        </p>
      ) : null}
    </Card>
  );
}

export default async function YearEndPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const { companyId } = await guardTenantPage("filing:read");
  const [canExport, canManageSettings] = await Promise.all([
    hasPermission("reports:export"),
    hasPermission("settings:manage"),
  ]);
  const sp = await searchParams;
  const today = todayIsoDate();

  const [company, earliest, runs, entitlements] = await Promise.all([
    getCompanySettings(companyId),
    earliestRecordDate(companyId),
    listYearEndRuns(companyId),
    getEntitlements(companyId),
  ]);
  const isLimited = company.entityType === "limited_company";
  const rule = yearEndRule(company);
  const years = listYears(rule, earliest, today);
  const suggested = defaultYear(rule, today);
  const selected = parsePeriod(sp.from, sp.to);
  const standard = selected ? isStandardYear(rule, selected) : true;

  const runFor = (period: { from: string; to: string }): YearEndRun | undefined =>
    runs.find((r) => r.periodFrom === period.from && r.periodTo === period.to);
  // Custom ranges someone has already reviewed or exported, listed with the standard years.
  const customRuns = runs.filter(
    (r) => !years.some((y) => y.from === r.periodFrom && y.to === r.periodTo),
  );

  const pack = selected
    ? await prepareYearEndPack({ companyId, period: selected, includeVat: entitlements.vatExport })
    : null;
  const failing = pack?.checks.filter((c) => c.items.length > 0) ?? [];
  const blockers = pack ? blockingItems(pack.checks) : [];
  const passed = pack ? pack.checks.length - failing.length : 0;
  const downloadHref = (format: "xlsx" | "csv") =>
    `/api/year-end/pack?from=${selected!.from}&to=${selected!.to}${format === "csv" ? "&format=csv" : ""}`;
  const selectedRun = selected ? runFor(selected) : undefined;

  const title = isLimited ? "Year-end accounts" : "Self Assessment year";

  return (
    <div>
      <PageHeader
        title={title}
        description={
          isLimited
            ? "Choose the financial year, review what the checks found, answer the notes for your accountant, then download the pack."
            : "Choose the year, review what the checks found, answer the notes for your accountant, then download the pack for them or your Self Assessment return."
        }
      />

      <section className="mt-8">
        <StepHeading step={1}>Choose the year</StepHeading>
        <div className="mt-4">
          <YearChooser
            years={years.map((y) => ({
              ...y,
              label: `${periodLabel(y)}${isCompleted(y, today) ? "" : " (in progress)"}`,
            }))}
            selected={selected}
            suggested={suggested}
            customSelected={!standard}
            canRecord={canExport}
          />
        </div>

        <div className="mt-6">
          <Table>
            <THead>
              <TR>
                <TH>Year</TH>
                <TH>Status</TH>
                <TH>Last exported</TH>
                <TH className="text-right">
                  <span className="sr-only">Open</span>
                </TH>
              </TR>
            </THead>
            <TBody>
              {[
                ...years.map((y) => ({ period: y, custom: false })),
                ...customRuns.map((r) => ({
                  period: { from: r.periodFrom, to: r.periodTo },
                  custom: true,
                })),
              ].map(({ period, custom }) => {
                const run = runFor(period);
                return (
                  <TR key={`${period.from}_${period.to}`}>
                    <TD>
                      {periodLabel(period)}
                      {custom ? <span className="text-muted"> (custom range)</span> : null}
                      {!isCompleted(period, today) ? (
                        <span className="text-muted"> (in progress)</span>
                      ) : null}
                    </TD>
                    <TD>
                      <StatusPill status={yearStatus(run)} />
                    </TD>
                    <TD>{run?.exportedAt ? <DisplayDate value={run.exportedAt} /> : "—"}</TD>
                    <TD className="text-right">
                      <Link
                        href={`/year-end?from=${period.from}&to=${period.to}`}
                        className="underline"
                      >
                        Open
                      </Link>
                    </TD>
                  </TR>
                );
              })}
            </TBody>
          </Table>
        </div>
      </section>

      {selected && pack ? (
        <>
          <section className="mt-12">
            <StepHeading step={2}>Review the checks</StepHeading>
            <p className="mt-2 text-sm text-muted">
              {periodLabel(selected)}
              {pack.data.basis === "cash"
                ? " · cash basis"
                : !isLimited && pack.data.basis === "accruals"
                  ? " · traditional accruals"
                  : ""}
            </p>
            {!standard ? (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                This range is not one of your standard years
                {isLimited ? "" : " (the tax year, or the year end set in Business settings)"}. Use
                it only for a first or final period, and check the dates with your accountant.
              </p>
            ) : null}
            {!isCompleted(selected, today) ? (
              <p className="mt-4 rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                This period has not ended yet, so the figures will change.
              </p>
            ) : null}

            <div className="mt-5 space-y-4">
              {failing.length === 0 ? (
                <Card className="p-5 text-sm">
                  All {passed} checks are clear for this period.
                </Card>
              ) : (
                <>
                  {failing
                    .slice()
                    .sort((a, b) => Number(b.blocking) - Number(a.blocking))
                    .map((check) => (
                      <CheckCard key={check.key} check={check} />
                    ))}
                  <p className="text-sm text-muted">
                    {passed} other {passed === 1 ? "check is" : "checks are"} clear. Alfa only
                    reports these; it never changes a record for you.
                  </p>
                </>
              )}
            </div>
          </section>

          <section className="mt-12">
            <StepHeading step={3}>Notes for the accountant</StepHeading>
            <p className="mt-2 max-w-2xl text-sm text-muted">
              This is the {TAB.notes} tab of the workbook, built from the same records as the
              rest of the pack. Tick what you have checked and add anything your accountant
              should know. Nothing here changes your records.
            </p>
            <div className="mt-5">
              <AccountantNotes
                // A different period has its own answers.
                key={`${selected.from}_${selected.to}`}
                period={selected}
                sections={pack.notes.sections}
                canEdit={canExport}
                canSetStartDate={canManageSettings}
                startDate={{
                  label: isLimited ? "Date of incorporation" : "Date trading started",
                  missing: pack.notes.startDateMissing,
                }}
              />
            </div>
          </section>

          <section className="mt-12">
            <StepHeading step={4}>Download the pack</StepHeading>
            {!canExport ? (
              <p className="mt-3 text-sm text-muted">
                Your role can&apos;t download the pack. Ask an admin or your accountant.
              </p>
            ) : blockers.length > 0 ? (
              <p className="mt-3 text-sm text-red-700">
                The pack can&apos;t be downloaded until the {blockers.length === 1 ? "detail" : "details"}{" "}
                marked &quot;Fix before downloading&quot; above {blockers.length === 1 ? "is" : "are"} filled in.
              </p>
            ) : (
              <>
                <p className="mt-3 max-w-2xl text-sm text-muted">
                  One zip with the workbook, every receipt named by its expense reference, and the
                  invoice PDFs.
                  {outstandingCount(pack.checks) > 0
                    ? ` The items the checks found are listed on the workbook's ${TAB.notes} tab.`
                    : ""}
                </p>
                {pack.notes.unconfirmed > 0 ? (
                  <p className="mt-4 max-w-2xl rounded-xl bg-amber-50 px-4 py-3 text-sm text-amber-900">
                    {pack.notes.unconfirmed}{" "}
                    {pack.notes.unconfirmed === 1 ? "item is" : "items are"} not confirmed in the
                    notes above. You can still download the pack: the workbook will show{" "}
                    {pack.notes.unconfirmed === 1 ? "it" : "each"} as &quot;Not confirmed&quot;.
                  </p>
                ) : null}
                <div className="mt-4 flex flex-wrap gap-3">
                  <a href={downloadHref("xlsx")} className={buttonClasses("primary")} download>
                    <Download className="h-4 w-4" />
                    Download workbook and receipts
                  </a>
                  <a href={downloadHref("csv")} className={buttonClasses("ghost")} download>
                    <Download className="h-4 w-4" />
                    Download as CSV files
                  </a>
                </div>
              </>
            )}
            {selectedRun?.exportedAt ? (
              <p className="mt-3 text-sm text-muted">
                Last exported on <DisplayDate value={selectedRun.exportedAt} />.
              </p>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}
