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
  { id: "migration", title: "Migration from spreadsheets" },
  { id: "picture", title: "The picture of money" },
  { id: "getting-paid", title: "Getting paid" },
  { id: "spend", title: "Tracking spend" },
  { id: "reimbursements", title: "Paying yourselves back" },
  { id: "bank", title: "Matching the bank" },
  { id: "bookkeeper", title: "AI bookkeeper" },
  { id: "ltd", title: "Shareholders & dividends", ltdOnly: true },
  { id: "paying-yourself", title: "What you can take out", ltdOnly: true },
  { id: "looking-ahead", title: "Cash forecast & profitability" },
  { id: "deadlines", title: "Deadlines & paperwork" },
  { id: "accountant", title: "Year-end & your accountant" },
  { id: "roles", title: "Who can do what" },
  { id: "rhythm", title: "A simple rhythm" },
  { id: "easier", title: "Make the app easier to use" },
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
            Alfa replaces the usual pile of spreadsheets, Drive
            folders, and emailed receipts. You record what you billed, what you
            spent, and what hit the bank — in one place.
          </p>
          <BulletList
            items={[
              <>
                Books are <strong>GBP only</strong>.
              </>,
              <>
                If you are VAT registered, turn it on in Settings — invoices,
                quotes, and expenses then use VAT rates, and Reports can export
                a period summary for your accountant.
              </>,
              <>
                This is not a tax filing tool. Your accountant still files your
                returns (no HMRC/MTD submit from the app).
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
                    <HelpLink href="/settings/business">Business settings</HelpLink>
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

        <section aria-labelledby="migration">
          <SectionHeading id="migration">
            Migration from spreadsheets
          </SectionHeading>
          <p className="mt-3 text-sm text-muted">
            Moving from a spreadsheet? Bring across open work and the current
            financial year — not a full balance sheet. Pick a cutover date and
            follow this order.
          </p>
          <StepList
            items={[
              <>
                Import clients from CSV on{" "}
                <HelpLink href="/clients">Clients</HelpLink> (use the template
                on the Import CSV dialog). Matching email updates an existing
                client.
              </>,
              <>
                Import invoices from CSV on{" "}
                <HelpLink href="/invoices">Invoices</HelpLink>: unpaid or partly
                paid invoices (any issue date), plus fully paid invoices issued
                in the <strong>current financial year</strong>. Older paid
                history stays in your spreadsheet archive.
              </>,
              <>
                Optionally set <strong>opening cash</strong> (bank balance
                brought forward) and as-at date in{" "}
                {isAdmin ? (
                  <HelpLink href="/settings/business">Business settings</HelpLink>
                ) : (
                  <span>Settings</span>
                )}
                . This is context for cutover only — it does not change P&amp;L.
              </>,
              <>
                Import your bank CSV on{" "}
                <HelpLink href="/transactions">Transactions</HelpLink>, then
                match credits to imported invoices (or explain other income /
                transfers).
              </>,
              <>
                Import expenses from CSV on{" "}
                <HelpLink href="/expenses">Expenses</HelpLink> if you still need
                open reimbursable spend or current-year cost history.
              </>,
            ]}
          />
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
                {isSoleTrader
                  ? null
                  : " The Safe to pay card shows how much the company can pay out today."}
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
                Create a <HelpLink href="/quotes">quote</HelpLink>. Quantities
                can be part units (1.5 days, 7.5 hours) and each line can have
                a percentage discount. Download or email the PDF. The email
                includes Accept / Decline links so the client can respond
                without signing in. Each save creates a new version; you can
                restore an older one if needed.
              </>,
              <>
                To take a deposit, add a payment schedule and tick{" "}
                <strong>Take the first payment when the client accepts</strong>
                . Accepting online then invoices the first milestone straight
                away and takes the client to pay it.
              </>,
              <>
                When they accept (via the link or you click{" "}
                <strong>Accept &amp; create order</strong>), an order is
                created. If they decline, a reason is stored for your pipeline
                reporting. The quote page shows Sent / Viewed / Accepted times.
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
                The email links to an online copy of the invoice. If you have
                set up{" "}
                {isAdmin ? (
                  <HelpLink href="/settings/payments">Online payments</HelpLink>
                ) : (
                  <span>Online payments</span>
                )}
                , the client can pay there by card, Apple Pay or Google Pay and
                the invoice is marked paid for you.
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
            <p className="mt-2 text-sm text-foreground/90">
              For retainers, set up a monthly schedule under{" "}
              <HelpLink href="/recurring-invoices">Recurring</HelpLink> — leave
              as draft or email automatically each month.
            </p>
          </Card>
          <Card className="mt-4">
            <p className="text-sm font-medium text-foreground">
              Chasing late payers
            </p>
            <p className="mt-2 text-sm text-foreground/90">
              Reminders go out on a schedule (by default 3 days before the due
              date, then 1, 7 and 14 days after). Admins can change the steps
              in{" "}
              {isAdmin ? (
                <HelpLink href="/settings/reminders">Payment reminders</HelpLink>
              ) : (
                <span>Payment reminders</span>
              )}{" "}
              and choose to add statutory interest and compensation under the
              Late Payment Act. On an overdue invoice,{" "}
              <strong>Raise late payment invoice</strong> bills that amount.
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
          <p className="mt-4 text-sm text-foreground/90">
            <strong>Got an invoice wrong after sending it?</strong> Open it and
            choose <strong>Raise credit note</strong> to credit all or part of
            it, with a refund if they have already paid. HMRC expects a credit
            note rather than a void once a VAT invoice has gone out. Credit
            notes are listed on{" "}
            <HelpLink href="/credit-notes">Credit notes</HelpLink> and come off
            your income and VAT figures.
          </p>
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
                approve it. Attach several receipts to one email and each
                becomes its own expense.
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
          <p className="mt-2 text-sm text-foreground/90">
            Spent money on a client project? Pick the client or order on the
            expense so it counts against that project&apos;s margin. Tick{" "}
            <strong>Rebillable</strong> and it is offered as a line on the
            client&apos;s next invoice. Each cost can only be billed once.
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
              <>
                Export a CSV from your bank (Settings shows how for the bank you
                picked).
              </>,
              <>
                Open <HelpLink href="/transactions">Transactions</HelpLink> and
                import the file.
              </>,
              <>
                If the file matches another supported bank, import still works
                for that file without changing Settings. Unknown formats open a
                guided column mapper (saved for next time when you use Other).
              </>,
              <>
                Duplicates from a re-import are skipped automatically.
              </>,
              <>
                Accept suggested matches to invoice payments, expenses, or
                reimbursements.
              </>,
              <>
                For credits that are not client payments, use{" "}
                <strong>Explain</strong> — other income (counts in profit), a
                transfer, or tax or loan. Administrators can add extra income
                categories in <HelpLink href="/settings/business">Business settings</HelpLink>.
              </>,
            ]}
          />
          <p className="mt-4 text-sm text-foreground/90">
            <HelpLink href="/spending">Spending</HelpLink> is a picture of cash
            out from those imported rows. It stays empty until you import a
            statement.
          </p>
        </section>

        <section aria-labelledby="bookkeeper">
          <SectionHeading id="bookkeeper">AI bookkeeper</SectionHeading>
          <p className="mt-3 text-sm text-foreground/90">
            The <HelpLink href="/bookkeeper">AI bookkeeper</HelpLink> does the
            fiddly parts of matching the bank. It only suggests: nothing
            changes until someone accepts it.
          </p>
          <BulletList
            items={[
              <>
                Suggests a category for each bank row, from your own history
                first. Every correction you make improves the next round.
              </>,
              <>
                Pairs receipts with card payments that differ by a tip, fee or
                exchange rate.
              </>,
              <>Explains each suggested bank match in one line.</>,
              <>
                Answers plain-English questions such as &ldquo;what did we spend
                on software in Q2?&rdquo; from your reports, and lists where
                each figure came from. Each company can ask 40 questions a day.
              </>,
            ]}
          />
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
            <BulletList
              items={[
                <>
                  Alfa checks the dividend against the company&apos;s
                  distributable reserves. If it is more than the reserves, you
                  can only go ahead by confirming your accountant has checked
                  it.
                </>,
                <>
                  Each dividend has a <strong>Minutes and vouchers</strong> PDF:
                  board minutes recording the reserves check, and a voucher
                  for each shareholder. Sign them and keep them with your
                  records.
                </>,
              ]}
            />
            <p className="mt-2 text-sm text-muted">
              This is a record for your accountant — it does not move money in
              the bank.
            </p>
          </section>
        ) : null}

        {!isSoleTrader ? (
          <section aria-labelledby="paying-yourself">
            <SectionHeading id="paying-yourself">
              What you can take out
            </SectionHeading>
            <p className="mt-3 text-sm text-muted">
              Three pages answer &ldquo;how much can we pay ourselves?&rdquo;
              Set the opening balances on Tax &amp; reserves first so the
              figures are right.
            </p>
            <div className="mt-4 space-y-2">
              <Term name="Safe to pay">
                <HelpLink href="/safe-to-pay">one figure</HelpLink>: cash at
                the bank less VAT and corporation tax owed, reimbursements due
                and a buffer, capped at distributable reserves. A second figure
                adds money expected in the next 30 days. From there you can
                start a dividend with the amount filled in.
              </Term>
              <Term name="Tax & reserves">
                <HelpLink href="/reserves">retained earnings</HelpLink> year by
                year and an estimate of corporation tax, including marginal
                relief. An estimate only — your accountant works out the final
                figure.
              </Term>
              <Term name="Director's loans">
                a <HelpLink href="/directors-loans">running balance</HelpLink>{" "}
                for each director: money taken out, money paid in, personal
                spending and reimbursements. Alfa warns you if a loan is
                overdrawn near the year end, when s455 tax or a benefit in kind
                may apply.
              </Term>
            </div>
          </section>
        ) : null}

        <section aria-labelledby="looking-ahead">
          <SectionHeading id="looking-ahead">
            Cash forecast &amp; profitability
          </SectionHeading>
          <BulletList
            items={[
              <>
                The <HelpLink href="/forecast">Cash forecast</HelpLink> shows
                your bank balance week by week for the next 13 weeks, from
                invoices due, milestones, recurring invoices, tax
                {isSoleTrader ? "" : ", dividends"} and your usual spending. It
                warns you if cash runs low. Try what-ifs such as a client
                paying late or a new monthly cost.
              </>,
              <>
                <HelpLink href="/profitability">Profitability</HelpLink> shows
                the margin on each order (so far, and projected) and on each
                client by financial year, plus rebillable costs you have not
                invoiced yet. It uses the expenses you tagged to a client or
                order.
              </>,
            ]}
          />
        </section>

        <section aria-labelledby="deadlines">
          <SectionHeading id="deadlines">Deadlines &amp; paperwork</SectionHeading>
          <p className="mt-3 text-sm text-foreground/90">
            <HelpLink href="/deadlines">Deadlines</HelpLink> lists your filing
            and payment dates:{" "}
            {isSoleTrader
              ? "Self Assessment and VAT returns"
              : "confirmation statement, annual accounts, CT600, corporation tax payment and VAT returns"}
            . Choose <strong>Mark done</strong> when each one is dealt with.
            Reminders go out 14 and 3 days before, and anything due within two
            weeks appears in the Weekly close.
          </p>
          {isSoleTrader ? null : (
            <p className="mt-2 text-sm text-foreground/90">
              The dates come from Companies House. Alfa fills in your
              registered name, office, year end, incorporation date and
              directors when you set up, and admins can refresh them in{" "}
              {isAdmin ? (
                <HelpLink href="/settings/business">Business settings</HelpLink>
              ) : (
                <span>Settings</span>
              )}
              .
            </p>
          )}
          <p className="mt-2 text-sm text-muted">
            Alfa reminds you. It does not file anything for you.
          </p>
        </section>

        <section aria-labelledby="accountant">
          <SectionHeading id="accountant">
            Year-end &amp; your accountant
          </SectionHeading>
          <BulletList
            items={[
              <>
                <HelpLink href="/reports">Reports</HelpLink> show{" "}
                <strong>invoiced</strong> income for the period (ex-VAT) — not
                cash collected in the bank. If you are VAT registered, download
                the VAT CSV from the same page for your accountant.
              </>,
              <>
                Download the <strong>accountant pack</strong> for a date range:
                company profile, CSVs, invoice PDFs, receipts, bank rows,
                dividends, share register, recurring schedules, and VAT summary
                when registered.
              </>,
              <>
                Once your accountant has filed, lock the books on{" "}
                <HelpLink href="/reports">Reports</HelpLink>. Nothing dated on
                or before the lock date can be added or changed. Admins and
                accountants can move or remove the lock, and each change is
                recorded in the audit log.
              </>,
              <>
                Reports also show the date your books are up to date to: the
                latest date your bank rows are all matched.
              </>,
              <>
                Accountants can open the read-only{" "}
                <HelpLink href="/company">Company</HelpLink> page for UTR, VAT,
                year-end month, and invoice bank details without editing Settings.
              </>,
              <>
                Invite them as an <strong>Accountant</strong> so they can read
                and export, and lock the books, but not change them.
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
            <Term name="Accountant">
              look and export, and lock the books once they have filed.
            </Term>
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
                same day. Add #personal or #company to the email subject to say
                how you paid; if you don&apos;t, we&apos;ll email to ask.
              </>,
              <>
                <strong>Once a week (~15 min):</strong> import the bank CSV,
                then work through the{" "}
                <HelpLink href="/close">Weekly close</HelpLink>: bank rows to
                match, receipts to review, overdue invoices, milestones ready
                to bill, reimbursements owed and deadlines coming up. Choose{" "}
                <strong>Close the week</strong> when you are done. A Monday
                digest reminds you.
              </>,
              <>
                <strong>When you pay a founder back:</strong> reimbursement run,
                then mark paid.
              </>,
              <>
                <strong>Year-end:</strong> download the accountant pack, then
                lock the books once they have filed.
              </>,
            ]}
          />
        </section>

        <section aria-labelledby="easier">
          <SectionHeading id="easier">Make the app easier to use</SectionHeading>
          <p className="mt-3 text-sm text-foreground/90">
            You can change how Alfa looks and moves without changing your
            company settings. These controls live on your{" "}
            <HelpLink href="/profile">Profile</HelpLink> under{" "}
            <strong>Display and focus</strong>.
          </p>
          <BulletList
            items={[
              <>
                <strong>Motion</strong> — reduce animations, or follow your
                device setting.
              </>,
              <>
                <strong>Text size</strong> and <strong>contrast</strong> — larger
                type and stronger borders when you need them.
              </>,
              <>
                <strong>Readable font</strong> — Atkinson Hyperlegible for
                clearer letter shapes.
              </>,
              <>
                <strong>Success messages</strong> — keep them on screen until you
                dismiss them.
              </>,
            ]}
          />
          <p className="mt-4 text-sm text-foreground/90">
            <strong>A shorter menu.</strong> Choose which pages show in your
            sidebar in <HelpLink href="/settings/menu">Your menu</HelpLink>, or
            answer a few yes/no questions there and let Alfa choose. Hidden
            pages keep working and you can still find them with search (⌘K).
            When your books suggest a hidden page would help, such as repeat
            invoices to the same client, the Overview offers to add it.
          </p>
          <p className="mt-4 text-sm text-foreground/90">
            Alfa works with the accessibility tools already on your phone or
            computer — VoiceOver, TalkBack, magnification, and dictation. We do
            not replace those apps; we aim to stay out of their way.
          </p>
        </section>

        <section aria-labelledby="limits">
          <SectionHeading id="limits">What this app does not do</SectionHeading>
          <p className="mt-3 text-sm text-foreground/90">
            On purpose, so you do not hunt for features that are not here yet:
          </p>
          <BulletList
            items={[
              <>Live bank feed (CSV import only — no Open Banking yet).</>,
              <>
                Making Tax Digital or submitting VAT returns to HMRC (export for
                your accountant only).
              </>,
              <>Multi-currency books.</>,
              <>Filing company or personal tax returns with HMRC.</>,
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
