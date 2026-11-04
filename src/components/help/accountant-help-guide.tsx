import type { EntityType } from "@/db/schema";
import {
  BulletList,
  HelpLink,
  SectionHeading,
  StepList,
} from "@/components/help/help-guide";

const SECTIONS = [
  { id: "access", title: "What you can see and do" },
  { id: "start", title: "Getting started" },
  { id: "records", title: "Reading the records" },
  { id: "queries", title: "Raising a query" },
  { id: "reports", title: "Reports & the accountant pack" },
  { id: "tax", title: "Tax, reserves & director's loans", ltdOnly: true },
  { id: "lock", title: "Locking the books" },
  { id: "limits", title: "What you can't do here" },
];

/** The help page for external accountants; everyone else gets HelpGuide. */
export function AccountantHelpGuide({
  entityType,
}: {
  entityType: EntityType | null;
}) {
  const isLtd = entityType === "limited_company";
  const visibleSections = SECTIONS.filter((s) => !s.ltdOnly || isLtd);

  return (
    <div className="lg:grid lg:grid-cols-[14rem_minmax(0,1fr)] lg:gap-10">
      <nav
        aria-label="Help sections"
        className="mb-8 lg:sticky lg:top-8 lg:mb-0 lg:self-start"
      >
        <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted">
          On this page
        </p>
        <ul className="flex flex-wrap gap-x-3 gap-y-1.5 text-sm lg:flex-col lg:gap-1">
          {visibleSections.map((section) => (
            <li key={section.id}>
              <a
                href={`#${section.id}`}
                className="text-muted hover:text-navy"
              >
                {section.title}
              </a>
            </li>
          ))}
        </ul>
      </nav>

      <div className="max-w-2xl space-y-12">
        <section aria-labelledby="access">
          <SectionHeading id="access">What you can see and do</SectionHeading>
          <p className="mt-3 text-sm text-foreground/90">
            Your client keeps their books here. You have read-only access to
            what you need to prepare and file their accounts.
          </p>
          <BulletList
            items={[
              <>
                <strong>Read</strong> the records in the accountant pack, the
                reports, deadlines and the company profile.
              </>,
              <>
                <strong>Download</strong> the accountant pack and, where the
                client&apos;s plan includes it, the VAT CSV.
              </>,
              <>
                <strong>Ask</strong> the team about anything using{" "}
                <HelpLink href="/queries">Queries</HelpLink>.
              </>,
              <>
                <strong>Set</strong> the books lock, the invoice cutover date
                {isLtd ? " and opening balances" : ""}. These are the only
                figures you can change.
              </>,
            ]}
          />
          <p className="mt-3 text-sm text-foreground/90">
            If an administrator has turned it on, you can also connect your own
            AI assistant, such as Claude or ChatGPT, in{" "}
            <HelpLink href="/settings/ai-assistant">AI assistant</HelpLink>. It
            sees only what you can see here, and can&apos;t change anything.
          </p>
        </section>

        <section aria-labelledby="start">
          <SectionHeading id="start">Getting started</SectionHeading>
          <StepList
            items={[
              <>
                Check the year end, UTR and VAT details on the{" "}
                <HelpLink href="/company">Company profile</HelpLink>.
              </>,
              <>
                See what is due next on{" "}
                <HelpLink href="/deadlines">Deadlines</HelpLink>. The team marks
                these as done, so tell them when you have filed.
              </>,
              <>
                Open <HelpLink href="/reports">Reports</HelpLink> and check
                &quot;Books up to date to&quot;, the latest date the bank rows
                are all matched.
              </>,
              <>
                Download the accountant pack for the period you are working on.
              </>,
            ]}
          />
          <p className="mt-3 text-sm text-foreground/90">
            If you act for more than one company on Alfa, switch between them
            from the company name in the menu.
          </p>
        </section>

        <section aria-labelledby="records">
          <SectionHeading id="records">Reading the records</SectionHeading>
          <p className="mt-3 text-sm text-foreground/90">
            The record pages show the same rows as the accountant pack, so the
            screen and the download agree. That leaves out:
          </p>
          <BulletList
            items={[
              <>Draft and void invoices.</>,
              <>Expenses still waiting for the team to review them.</>,
              <>Reimbursement runs that have not been paid.</>,
              <>The team&apos;s own notes and labels.</>,
            ]}
          />
          <p className="mt-3 text-sm text-foreground/90">
            Start from <HelpLink href="/transactions">Transactions</HelpLink>,{" "}
            <HelpLink href="/expenses">Expenses</HelpLink> or{" "}
            <HelpLink href="/invoices">Invoices</HelpLink>. If a page you expect
            is missing from the menu, you can turn it on under{" "}
            <HelpLink href="/settings/menu">Your menu</HelpLink>.
          </p>
        </section>

        <section aria-labelledby="queries">
          <SectionHeading id="queries">Raising a query</SectionHeading>
          <StepList
            items={[
              <>
                Select the question mark icon at the start of a row in a record
                list, or use <strong>Raise a query</strong> on a record&apos;s
                page. For a general question, use the button on{" "}
                <HelpLink href="/queries">Queries</HelpLink>.
              </>,
              <>
                Add a subject and your question. The company&apos;s
                administrators and co-founders are notified, and by default
                they get an email with your subject, your question and a link.
                Replies happen in Alfa.
              </>,
              <>
                You are notified when they reply (choose how in{" "}
                <HelpLink href="/settings/notifications">Notifications</HelpLink>
                ), and the query shows as <strong>Answered</strong>. If you reply, it goes back to{" "}
                <strong>Waiting for the team</strong>.
              </>,
              <>
                Close the query when you have what you need. You can reopen it
                later.
              </>,
            ]}
          />
          <p className="mt-3 text-sm text-foreground/90">
            The icon on each row shows where things stand: grey outline for no
            query, amber for waiting for the team, navy for answered, and a tick
            for closed. Select it to open the query, or to see the list if the
            record has several, where you can also raise another.
          </p>
        </section>

        <section aria-labelledby="reports">
          <SectionHeading id="reports">
            Reports &amp; the accountant pack
          </SectionHeading>
          <BulletList
            items={[
              <>
                <HelpLink href="/reports">Reports</HelpLink> are on an accruals
                basis: income is what was invoiced, net of VAT, rather than cash
                received.
              </>,
              <>
                To download a pack, set the dates, choose{" "}
                <strong>Update period</strong>, then choose{" "}
                <strong>Download accountant pack</strong>. It uses the period
                currently shown.
              </>,
              <>
                The pack is a zip of CSVs, summaries, invoice and credit note
                PDFs, and receipt files. Its README.txt lists the contents and
                any warnings, so read that first.
              </>,
            ]}
          />
        </section>

        {isLtd ? (
          <section aria-labelledby="tax">
            <SectionHeading id="tax">
              Tax, reserves &amp; director&apos;s loans
            </SectionHeading>
            <BulletList
              items={[
                <>
                  <HelpLink href="/reserves">Tax &amp; reserves</HelpLink> shows
                  the company&apos;s reserves position. If it traded before its
                  records in Alfa, enter the figures from the last filed
                  accounts under <strong>Opening balances</strong>, or reserves
                  will be understated.
                </>,
                <>
                  <HelpLink href="/directors-loans">
                    Director&apos;s loans
                  </HelpLink>{" "}
                  shows what each director owes the company, or is owed by it.
                </>,
                <>
                  <HelpLink href="/dividends">Dividends</HelpLink> and{" "}
                  <HelpLink href="/shareholders">Shareholders</HelpLink> show
                  declarations and the share register.
                </>,
              ]}
            />
          </section>
        ) : null}

        <section aria-labelledby="lock">
          <SectionHeading id="lock">Locking the books</SectionHeading>
          <p className="mt-3 text-sm text-foreground/90">
            Once you have filed, lock the period on{" "}
            <HelpLink href="/reports">Reports</HelpLink>. Nothing dated on or
            before the lock date can then be added or changed. You or an
            administrator can move or remove the lock, and each change is
            recorded in the company&apos;s audit log, which administrators can
            see.
          </p>
        </section>

        <section aria-labelledby="limits">
          <SectionHeading id="limits">What you can&apos;t do here</SectionHeading>
          <BulletList
            items={[
              <>
                Change records. If something looks wrong, raise a query and the
                team will correct it.
              </>,
              <>
                Open day-to-day pages such as clients, quotes and the
                team&apos;s overview dashboard.
              </>,
              <>File with HMRC or Companies House. You do that outside Alfa.</>,
            ]}
          />
        </section>
      </div>
    </div>
  );
}
