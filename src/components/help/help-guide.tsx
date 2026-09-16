import Link from "next/link";
import type { EntityType } from "@/db/schema";
import type { Role } from "@/lib/roles";
import { Card } from "@/components/ui/card";
import { cn } from "@/lib/utils";

type HelpSection = {
  id: string;
  title: string;
  /** Hide for sole traders (Ltd-only topics). */
  ltdOnly?: boolean;
};

const SECTIONS: HelpSection[] = [
  { id: "what-for", title: "What this app is for" },
  { id: "first-hour", title: "First hour" },
  { id: "picture", title: "The picture of money" },
  { id: "getting-paid", title: "Getting paid" },
  { id: "spend", title: "Tracking spend" },
  { id: "reimbursements", title: "Paying yourselves back" },
  { id: "bank", title: "Matching the bank" },
  { id: "ltd", title: "Shareholders & dividends", ltdOnly: true },
  { id: "accountant", title: "Year-end & your accountant" },
  { id: "roles", title: "Who can do what" },
  { id: "rhythm", title: "A simple rhythm" },
  { id: "limits", title: "What this app does not do" },
];

function HelpLink({
  href,
  children,
}: {
  href: string;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className="font-medium text-navy underline decoration-navy/30 underline-offset-2 hover:decoration-navy"
    >
      {children}
    </Link>
  );
}

function SectionHeading({
  id,
  children,
}: {
  id: string;
  children: React.ReactNode;
}) {
  return (
    <h2
      id={id}
      className="scroll-mt-8 font-display text-xl font-semibold text-foreground"
    >
      {children}
    </h2>
  );
}

function StepList({ items }: { items: React.ReactNode[] }) {
  return (
    <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-foreground/90">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ol>
  );
}

function BulletList({ items }: { items: React.ReactNode[] }) {
  return (
    <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-foreground/90">
      {items.map((item, i) => (
        <li key={i}>{item}</li>
      ))}
    </ul>
  );
}

function Term({
  name,
  children,
}: {
  name: string;
  children: React.ReactNode;
}) {
  return (
    <p className="text-sm text-foreground/90">
      <span className="font-medium text-foreground">{name}</span> — {children}
    </p>
  );
}

export function HelpGuide({
  entityType,
  role,
}: {
  entityType: EntityType | null;
  role: Role;
}) {
  const isSoleTrader = entityType === "sole_trader";
  const isAdmin = role === "admin";
  const visibleSections = SECTIONS.filter(
    (s) => !(s.ltdOnly && isSoleTrader),
  );

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
        <section aria-labelledby="what-for">
          <SectionHeading id="what-for">What this app is for</SectionHeading>
          <p className="mt-3 text-sm text-foreground/90">
            Dot + Dash Accounts replaces the usual pile of spreadsheets, Drive
            folders, and emailed receipts. You record what you billed, what you
            spent, and what hit the bank — in one place.
          </p>
          <BulletList
            items={[
              <>
                Books are <strong>GBP only</strong>.
              </>,
              <>VAT is not turned on in the app today.</>,
              <>
                This is not a tax filing tool. Your accountant still files your
                returns.
              </>,
            ]}
          />
        </section>

        <section aria-labelledby="first-hour">
          <SectionHeading id="first-hour">First hour</SectionHeading>
          <p className="mt-3 text-sm text-muted">
            Do these once when you set up the company. Then you can get on with
            selling and spending.
          </p>
          <Card className="mt-4 space-y-1">
            <StepList
              items={[
                <>
                  Finish company details in{" "}
                  {isAdmin ? (
                    <HelpLink href="/settings">Settings</HelpLink>
                  ) : (
                    <span>Settings</span>
                  )}{" "}
                  — trading name, address, logo, bank account, and invoice number
                  prefixes.
                  <span
                    className={cn(
                      "mt-1 block text-xs",
                      isAdmin ? "text-muted" : "font-medium text-muted",
                    )}
                  >
                    Admins only. Ask your admin if you cannot open Settings.
                  </span>
                </>,
                <>
                  Invite your co-founder and accountant from{" "}
                  {isAdmin ? (
                    <HelpLink href="/users">Users</HelpLink>
                  ) : (
                    <span>Users</span>
                  )}
                  .
                  <span className="mt-1 block text-xs text-muted">
                    Admins only.
                  </span>
                </>,
                <>
                  Add the people you invoice in{" "}
                  <HelpLink href="/clients">Clients</HelpLink>. Put an email on
                  each client if you will send invoices from this app.
                </>,
                ...(isSoleTrader
                  ? []
                  : [
                      <>
                        Add holders on{" "}
                        <HelpLink href="/shareholders">Shareholders</HelpLink>{" "}
                        so dividends can split correctly later. (Limited
                        companies only.)
                      </>,
                    ]),
              ]}
            />
          </Card>
        </section>

        <section aria-labelledby="picture">
          <SectionHeading id="picture">The picture of money</SectionHeading>
          <div className="mt-4 space-y-4">
            <Card>
              <p className="text-sm font-medium text-foreground">Money in</p>
              <p className="mt-2 text-sm text-foreground/90">
                Client → Quote (optional) → Order → Invoice → they pay → you
                record the payment or match it on the bank.
              </p>
            </Card>
            <Card>
              <p className="text-sm font-medium text-foreground">Money out</p>
              <p className="mt-2 text-sm text-foreground/90">
                You spend → log an Expense (or email a receipt) → if you paid
                personally, batch a Reimbursement → match the bank.
              </p>
            </Card>
            <Card>
              <p className="text-sm font-medium text-foreground">Dashboard</p>
              <p className="mt-2 text-sm text-foreground/90">
                Start on the <HelpLink href="/dashboard">Overview</HelpLink>{" "}
                each time you open the app.{" "}
                <strong>Needs attention</strong> is your to-do list: overdue
                invoices, quotes about to expire, unmatched bank rows, and
                receipts waiting for review.
              </p>
            </Card>
          </div>
        </section>

        <section aria-labelledby="getting-paid">
          <SectionHeading id="getting-paid">Getting paid</SectionHeading>
          <p className="mt-3 text-sm text-muted">
            Prefer this path when you quote work first. It keeps the numbers
            consistent from estimate to invoice.
          </p>
          <StepList
            items={[
              <>
                Add a <HelpLink href="/clients">client</HelpLink>.
              </>,
              <>
                Create a <HelpLink href="/quotes">quote</HelpLink>. Download or
                email the PDF. Each save creates a new version; you can restore
                an older one if needed.
              </>,
              <>
                When they say yes: <strong>Accept &amp; create order</strong>.
                If they say no: decline with a reason — that is for your
                pipeline reporting, not for the client.
              </>,
              <>
                On the <HelpLink href="/orders">order</HelpLink>, raise a{" "}
                <strong>draft invoice</strong> for a milestone, a part amount,
                or the remaining balance.
              </>,
              <>
                <strong>Send</strong> the{" "}
                <HelpLink href="/invoices">invoice</HelpLink> (the client needs
                an email). Or <strong>Download PDF</strong> and send it yourself.
              </>,
              <>
                When money arrives: <strong>Record payment</strong>, or match
                it after a bank import. The invoice becomes{" "}
                <strong>Paid</strong> when the balance is covered.
              </>,
            ]}
          />
          <Card className="mt-4">
            <p className="text-sm font-medium text-foreground">Shortcut</p>
            <p className="mt-2 text-sm text-foreground/90">
              Skip the quote and order when the work was never quoted. Create a
              standalone invoice against a client from{" "}
              <HelpLink href="/invoices">Invoices</HelpLink>.
            </p>
          </Card>
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-foreground">
              Invoice statuses, in plain words
            </p>
            <Term name="Draft">not sent yet; you can still edit.</Term>
            <Term name="Sent">waiting for the client to pay.</Term>
            <Term name="Overdue">
              still sent, but past the due date. You do not set this —
              the app shows it automatically.
            </Term>
            <Term name="Paid">settled in full.</Term>
            <Term name="Void">
              cancelled. The number is kept so your sequence stays tidy.
            </Term>
          </div>
        </section>

        <section aria-labelledby="spend">
          <SectionHeading id="spend">Tracking spend</SectionHeading>
          <p className="mt-3 text-sm text-muted">
            Three ways in — same destination on{" "}
            <HelpLink href="/expenses">Expenses</HelpLink>.
          </p>
          <BulletList
            items={[
              <>
                Type it in (upload a receipt first if you want details filled
                in from the image).
              </>,
              <>
                Email a photo or PDF to the personal expenses address shown on
                that page. It lands as <strong>pending</strong> until you
                approve it.
              </>,
              <>Import a CSV of past spend if you are catching up.</>,
            ]}
          />
          <div className="mt-4 space-y-2">
            <p className="text-sm font-medium text-foreground">
              Which status to pick
            </p>
            <Term name="Company paid">
              paid from the company card or account.
            </Term>
            <Term name="Reimbursable">
              you paid personally and the company owes you back.
            </Term>
            <Term name="Recorded">
              logged for the books, nothing owed to anyone.
            </Term>
          </div>
          <p className="mt-4 text-sm text-foreground/90">
            Foreign-currency receipts: confirm the sterling amount before you
            approve. The app does not convert currencies.
          </p>
          <p className="mt-2 text-sm text-foreground/90">
            Mileage: choose the Travel category, then log miles × the rate in
            Settings (default 45p per mile).
          </p>
        </section>

        <section aria-labelledby="reimbursements">
          <SectionHeading id="reimbursements">
            Paying yourselves back
          </SectionHeading>
          <p className="mt-3 text-sm text-foreground/90">
            On <HelpLink href="/reimbursements">Reimbursements</HelpLink>:
          </p>
          <StepList
            items={[
              <>Pick the person who is owed money.</>,
              <>Tick their reimbursable expenses.</>,
              <>
                Enter a bank payment reference (use the same one when you
                transfer from the business account).
              </>,
              <>
                Transfer the total, then <strong>Mark as paid</strong>.
              </>,
              <>Export a CSV if you want a paper trail.</>,
            ]}
          />
        </section>

        <section aria-labelledby="bank">
          <SectionHeading id="bank">Matching the bank</SectionHeading>
          <p className="mt-3 text-sm text-muted">
            Once a week is enough for most small companies.
          </p>
          <StepList
            items={[
              <>Export a CSV statement from your bank.</>,
              <>
                Open <HelpLink href="/transactions">Transactions</HelpLink> and
                import the file.
              </>,
              <>
                The bank chosen in Settings must match the file (Starling,
                Monzo, Revolut, Wise, Tide, Barclays, HSBC, Lloyds, NatWest, or
                Other with column mapping).
              </>,
              <>
                Duplicates from a re-import are skipped automatically.
              </>,
              <>
                Accept suggested matches to invoice payments, expenses, or
                reimbursements.
              </>,
            ]}
          />
          <p className="mt-4 text-sm text-foreground/90">
            <HelpLink href="/spending">Spending</HelpLink> is a picture of cash
            out from those imported rows. It stays empty until you import a
            statement.
          </p>
        </section>

        {!isSoleTrader ? (
          <section aria-labelledby="ltd">
            <SectionHeading id="ltd">Shareholders &amp; dividends</SectionHeading>
            <p className="mt-3 text-sm text-foreground/90">
              Keep the share register balanced on{" "}
              <HelpLink href="/shareholders">Shareholders</HelpLink>, then
              declare a total on <HelpLink href="/dividends">Dividends</HelpLink>
              . The app splits the amount across holders automatically.
            </p>
            <p className="mt-2 text-sm text-muted">
              This is a record for your accountant — it does not move money in
              the bank.
            </p>
          </section>
        ) : null}

        <section aria-labelledby="accountant">
          <SectionHeading id="accountant">
            Year-end &amp; your accountant
          </SectionHeading>
          <BulletList
            items={[
              <>
                <HelpLink href="/reports">Reports</HelpLink> show{" "}
                <strong>invoiced</strong> income for the period — not cash
                collected in the bank.
              </>,
              <>
                Download the <strong>accountant pack</strong> for a date range:
                CSVs, invoice PDFs, receipts, bank rows, and dividends.
              </>,
              <>
                Invite them as an <strong>Accountant</strong> so they can read
                and export, but not change the books.
              </>,
              <>
                Admins can review sensitive changes in the{" "}
                {isAdmin ? (
                  <HelpLink href="/audit">Audit log</HelpLink>
                ) : (
                  <span>Audit log</span>
                )}
                .
              </>,
            ]}
          />
        </section>

        <section aria-labelledby="roles">
          <SectionHeading id="roles">Who can do what</SectionHeading>
          <div className="mt-3 space-y-2">
            <Term name="Administrator">
              everything, including settings and users.
            </Term>
            <Term name="Co-founder">day-to-day books and reports.</Term>
            <Term name="Accountant">look and export only.</Term>
            <Term name="Pending access">
              signed in, waiting for an admin to assign a role.
            </Term>
          </div>
        </section>

        <section aria-labelledby="rhythm">
          <SectionHeading id="rhythm">A simple rhythm</SectionHeading>
          <BulletList
            items={[
              <>
                <strong>When you sell:</strong> quote → accept → invoice →
                send.
              </>,
              <>
                <strong>When you spend:</strong> photo or email the receipt the
                same day.
              </>,
              <>
                <strong>Once a week (~15 min):</strong> open the dashboard →
                send or chase overdue invoices → import the bank CSV → accept
                matches → approve pending receipts.
              </>,
              <>
                <strong>When you pay a founder back:</strong> reimbursement run,
                then mark paid.
              </>,
              <>
                <strong>Year-end:</strong> download the accountant pack.
              </>,
            ]}
          />
        </section>

        <section aria-labelledby="limits">
          <SectionHeading id="limits">What this app does not do</SectionHeading>
          <p className="mt-3 text-sm text-foreground/90">
            On purpose, so you do not hunt for features that are not here yet:
          </p>
          <BulletList
            items={[
              <>Live bank feed (CSV import only).</>,
              <>VAT registration or Making Tax Digital.</>,
              <>Multi-currency books.</>,
              <>Recurring invoices from the UI.</>,
              <>Filing returns with HMRC.</>,
            ]}
          />
          <p className="mt-4 text-sm text-muted">
            Your accountant still handles tax and Companies House filings.
          </p>
          <div className="mt-6 rounded-lg border border-periwinkle/30 bg-periwinkle/5 p-4">
            <p className="text-sm text-foreground/90">
              <strong className="text-foreground">
                Need detailed UK tax guidance?
              </strong>{" "}
              Our{" "}
              <HelpLink
                href={
                  entityType === "limited_company"
                    ? "/guides/limited-companies"
                    : "/guides/sole-traders"
                }
              >
                comprehensive financial requirements guide
              </HelpLink>{" "}
              covers record keeping, filing deadlines, tax obligations, and
              penalties for {entityType === "limited_company" ? "limited companies" : "sole traders"}.
            </p>
          </div>
        </section>
      </div>
    </div>
  );
}
