import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
import { Logo } from "@/components/brand/logo";
import { buttonClasses } from "@/components/ui/button";
import { GuideLayout } from "@/components/guides/guide-layout";
import {
  GuideSection,
  GuideSubsection,
  GuideParagraph,
  GuideBulletList,
  GuideWarning,
} from "@/components/guides/guide-section";
import { HmrcLink } from "@/components/guides/hmrc-link";

export const metadata: Metadata = {
  title: "Sole Trader Financial Requirements Guide",
  description:
    "Comprehensive guide to UK sole trader financial requirements, including Self Assessment, record keeping, Income Tax, National Insurance, and tax obligations.",
  openGraph: {
    title: "Sole Trader Financial Requirements Guide",
    description:
      "Comprehensive guide to UK sole trader financial requirements, including Self Assessment, record keeping, Income Tax, National Insurance, and tax obligations.",
  },
};

const sections = [
  { id: "overview", title: "Overview" },
  { id: "record-keeping", title: "Record Keeping Requirements" },
  { id: "filing-deadlines", title: "Filing Deadlines & Requirements" },
  { id: "accounting-tax", title: "Accounting & Tax Obligations" },
  { id: "penalties", title: "Penalties for Non-Compliance" },
  { id: "getting-help", title: "Getting Professional Help" },
];

export default function SoleTradersGuidePage() {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <header className="border-b border-border bg-white px-6 py-4">
        <div className="mx-auto flex max-w-7xl items-center justify-between">
          <Link href="/">
            <Logo showConsulting size={44} />
          </Link>
          <Link
            href="/sign-in"
            className={buttonClasses("secondary", "text-sm")}
          >
            Sign in
          </Link>
        </div>
      </header>

      <Link
        href="/guides"
        className="mx-auto flex w-full max-w-7xl items-center gap-1 px-6 pt-8 text-sm text-navy hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to guides
      </Link>

      <GuideLayout
        title="Sole Trader Financial Requirements"
        description="A comprehensive guide to understanding and meeting your financial obligations as a self-employed sole trader in the UK."
        sections={sections}
      >
        <GuideSection id="overview" title="Overview">
          <GuideParagraph>
            As a sole trader in the UK, you are self-employed and run your
            business as an individual. Unlike a limited company, there is no
            legal distinction between you and your business, which means you are
            personally responsible for all business debts and obligations.
          </GuideParagraph>
          <GuideParagraph>
            Being a sole trader is often simpler and cheaper than running a
            limited company, but you still have important financial
            responsibilities including registering with HMRC, keeping accurate
            records, and filing annual Self Assessment tax returns.
          </GuideParagraph>
          <GuideWarning>
            This guide is for informational purposes only and does not
            constitute professional advice. Always consult with a qualified
            accountant or tax advisor for guidance specific to your business.
          </GuideWarning>
        </GuideSection>

        <GuideSection id="record-keeping" title="Record Keeping Requirements">
          <GuideParagraph>
            Keeping accurate records is essential for completing your Self
            Assessment tax return and can help you claim all the expenses you're
            entitled to. HMRC can check your records at any time to make sure
            you're paying the right amount of tax.
          </GuideParagraph>

          <GuideSubsection title="What Records Must Be Kept">
            <GuideParagraph>
              You must keep records of all your business income and expenses:
            </GuideParagraph>
            <GuideBulletList
              items={[
                "All sales and income, including cash transactions",
                "Business expenses and purchases",
                "VAT records (if registered for VAT)",
                "PAYE records (if you employ staff)",
                "Invoices, receipts, and proof of purchases",
                "Bank statements showing business transactions",
                "Mileage records if you claim vehicle expenses",
                "Records of goods taken for personal use",
              ]}
            />
            <GuideParagraph>
              Find detailed guidance on{" "}
              <HmrcLink href="https://www.gov.uk/self-employed-records">
                what records self-employed people must keep
              </HmrcLink>
              .
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="How Long to Keep Records">
            <GuideParagraph>
              You must keep your records for at least 5 years after the 31
              January Self Assessment deadline of the relevant tax year. For
              example, for the 2025/26 tax year, you must keep records until at
              least 31 January 2032.
            </GuideParagraph>
            <GuideParagraph>
              If you send your tax return late, you must keep your records for
              longer — until 5 years after the date you actually submit the
              return, or 15 months from the deadline date, whichever is later.
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Simplified vs Traditional Accounting">
            <GuideParagraph>
              You can choose between two methods for recording business income
              and expenses:
            </GuideParagraph>
            <GuideBulletList
              items={[
                <strong key="cash">Cash basis (simplified)</strong>,
                " — Record income when you receive it and expenses when you pay them. Available if your turnover is £150,000 or less.",
                <strong key="trad">Traditional accounting (accruals)</strong>,
                " — Record income when you invoice and expenses when you receive an invoice, regardless of when money changes hands. Required if turnover exceeds £150,000.",
              ]}
            />
            <GuideParagraph>
              Most small sole traders find the cash basis simpler, but
              traditional accounting may be better if you have significant
              outstanding invoices or stock.
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Mileage Records">
            <GuideParagraph>
              If you use your vehicle for business, you must keep detailed
              mileage records to claim vehicle expenses. Record the date,
              destination, purpose, and miles for each business journey. You
              cannot claim for commuting between home and your usual workplace.
            </GuideParagraph>
            <GuideParagraph>
              You can either claim simplified expenses using HMRC's mileage
              rates (45p per mile for the first 10,000 miles, then 25p per mile)
              or claim actual vehicle costs based on the proportion of business
              use.
            </GuideParagraph>
          </GuideSubsection>
        </GuideSection>

        <GuideSection
          id="filing-deadlines"
          title="Filing Deadlines & Requirements"
        >
          <GuideParagraph>
            As a sole trader, you must register with HMRC and file an annual
            Self Assessment tax return. Missing these deadlines results in
            automatic penalties.
          </GuideParagraph>

          <GuideSubsection title="Registering as Self-Employed">
            <GuideParagraph>
              You must register with HMRC as soon as possible after you start
              self-employment. The deadline is by 5 October after the end of the
              tax year in which you started trading. For example, if you started
              trading in July 2025, you must register by 5 October 2026.
            </GuideParagraph>
            <GuideParagraph>
              You can{" "}
              <HmrcLink href="https://www.gov.uk/set-up-sole-trader">
                register as a sole trader online
              </HmrcLink>
              . When you register, you'll be sent a Unique Taxpayer Reference
              (UTR) which you'll need for your tax returns.
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Self Assessment Deadlines">
            <GuideParagraph>
              Once registered, you must file a Self Assessment tax return each
              year. The key deadlines are:
            </GuideParagraph>
            <GuideBulletList
              items={[
                "5 October — Deadline to register if you're newly self-employed",
                "31 October — Paper tax return deadline (if filing on paper)",
                "31 January — Online tax return deadline and payment deadline for any tax owed",
                "31 July — Second payment on account deadline (if applicable)",
              ]}
            />
            <GuideParagraph>
              Most people file online as it gives you an extra 3 months. Learn
              more about{" "}
              <HmrcLink href="https://www.gov.uk/self-assessment-tax-returns">
                Self Assessment tax returns
              </HmrcLink>
              .
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Payment on Account">
            <GuideParagraph>
              If your last Self Assessment tax bill was more than £1,000, you'll
              usually need to make payments on account. These are advance
              payments towards your next tax bill:
            </GuideParagraph>
            <GuideBulletList
              items={[
                "First payment on account: 31 January (same day as your tax return)",
                "Second payment on account: 31 July",
                "Each payment is half of your previous year's tax bill",
              ]}
            />
            <GuideParagraph>
              If you know your income will be lower, you can apply to reduce
              your payments on account, but you'll face interest charges if you
              reduce them too much.
            </GuideParagraph>
          </GuideSubsection>
        </GuideSection>

        <GuideSection id="accounting-tax" title="Accounting & Tax Obligations">
          <GuideSubsection title="Income Tax">
            <GuideParagraph>
              As a sole trader, you pay Income Tax on your business profits. The
              rates for 2026/27 are:
            </GuideParagraph>
            <GuideBulletList
              items={[
                "Personal Allowance (0%): First £12,570 of income (tax-free)",
                "Basic rate (20%): £12,571 to £50,270",
                "Higher rate (40%): £50,271 to £125,140",
                "Additional rate (45%): Over £125,140",
              ]}
            />
            <GuideParagraph>
              Your Personal Allowance reduces by £1 for every £2 you earn over
              £100,000, disappearing completely at £125,140.
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="National Insurance Contributions">
            <GuideParagraph>
              Sole traders pay two types of National Insurance:
            </GuideParagraph>
            <GuideBulletList
              items={[
                <strong key="class2">Class 2 NI</strong>,
                " — £3.45 per week if profits are £12,570 or more (2026/27). Collected through Self Assessment.",
                <strong key="class4">Class 4 NI</strong>,
                " — 9% on profits between £12,570 and £50,270, then 2% on profits above £50,270 (2026/27).",
              ]}
            />
            <GuideParagraph>
              National Insurance contributions count towards your State Pension
              and certain benefits. If your profits are below £6,725, you can
              make voluntary Class 2 contributions to protect your entitlement.
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Trading Allowance">
            <GuideParagraph>
              If your trading income is £1,000 or less in a tax year, you can
              use the trading allowance instead of claiming actual expenses. If
              you use the trading allowance, you don't need to register as
              self-employed or file a tax return (unless you have other reasons
              to file).
            </GuideParagraph>
            <GuideParagraph>
              If your income is more than £1,000, you can either:
            </GuideParagraph>
            <GuideBulletList
              items={[
                "Claim actual expenses (if they're more than £1,000)",
                "Deduct the £1,000 trading allowance instead of actual expenses",
              ]}
            />
          </GuideSubsection>

          <GuideSubsection title="Allowable Expenses">
            <GuideParagraph>
              You can deduct business expenses from your income to reduce your
              tax bill. Expenses must be "wholly and exclusively" for business
              purposes. Common allowable expenses include:
            </GuideParagraph>
            <GuideBulletList
              items={[
                "Office supplies and equipment",
                "Business premises costs (if you don't work from home)",
                "Travel and vehicle costs (not commuting)",
                "Costs of goods for resale",
                "Professional fees (accountant, solicitor)",
                "Business insurance",
                "Marketing and advertising",
                "Training related to your business",
                "Use of home as office (using simplified flat rate or actual costs)",
              ]}
            />
            <GuideParagraph>
              You cannot claim for personal expenses, client entertainment, or
              costs not related to your trade.
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Basis Period Reform">
            <GuideParagraph>
              From April 2024, basis period reform changed how sole traders'
              profits are allocated to tax years. Instead of using your
              accounting year end, profits are now taxed based on the tax year
              (6 April to 5 April).
            </GuideParagraph>
            <GuideParagraph>
              If your accounting year doesn't match the tax year, you'll need to
              apportion profits. Most accountants recommend aligning your
              accounting year end with the tax year (31 March or 5 April) to
              simplify calculations.
            </GuideParagraph>
            <GuideParagraph>
              Learn more about{" "}
              <HmrcLink href="https://www.gov.uk/guidance/calculate-your-self-employed-income">
                calculating self-employed income
              </HmrcLink>
              .
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="VAT Registration">
            <GuideParagraph>
              You must register for VAT if your VAT taxable turnover is more
              than £90,000 (2026/27 threshold) over any rolling 12-month period.
              You can also register voluntarily if your turnover is below this
              level, which may be beneficial if you make sales to VAT-registered
              businesses.
            </GuideParagraph>
            <GuideParagraph>
              Once registered, you must charge VAT on your sales, submit VAT
              returns (usually quarterly), and comply with Making Tax Digital
              (MTD) requirements by using compatible software.
            </GuideParagraph>
            <GuideParagraph>
              Read about{" "}
              <HmrcLink href="https://www.gov.uk/vat-registration">
                VAT registration
              </HmrcLink>{" "}
              and{" "}
              <HmrcLink href="https://www.gov.uk/government/publications/making-tax-digital">
                Making Tax Digital
              </HmrcLink>
              .
            </GuideParagraph>
          </GuideSubsection>
        </GuideSection>

        <GuideSection id="penalties" title="Penalties for Non-Compliance">
          <GuideParagraph>
            Failing to register, file returns, or pay tax on time results in
            automatic penalties. It's important to understand the consequences
            and ensure you meet all deadlines.
          </GuideParagraph>

          <GuideSubsection title="Late Registration Penalties">
            <GuideParagraph>
              If you don't register with HMRC as self-employed by the deadline,
              you may face a penalty of up to £100, and potentially more if you
              delay further. However, HMRC will usually waive the penalty if you
              have a reasonable excuse and register as soon as you realise.
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Late Filing Penalties">
            <GuideParagraph>
              Penalties for late Self Assessment tax returns are:
            </GuideParagraph>
            <GuideBulletList
              items={[
                "1 day late: £100 (even if no tax is owed)",
                "3 months late: £10 per day for up to 90 days (maximum £900)",
                "6 months late: £300 or 5% of the tax due (whichever is greater)",
                "12 months late: £300 or 5% of the tax due (whichever is greater), plus potential tax-geared penalties up to 100% in serious cases",
              ]}
            />
            <GuideParagraph>
              Read more about{" "}
              <HmrcLink href="https://www.gov.uk/government/publications/self-assessment-penalties-for-late-filing-and-late-payment">
                Self Assessment penalties
              </HmrcLink>
              .
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Late Payment Penalties">
            <GuideParagraph>
              If you don't pay your tax bill on time, you'll be charged:
            </GuideParagraph>
            <GuideBulletList
              items={[
                "Interest on unpaid tax from the due date",
                "30 days late: 5% of the tax unpaid at that date",
                "6 months late: Another 5% of the tax unpaid at that date",
                "12 months late: Another 5% of the tax unpaid at that date",
              ]}
            />
            <GuideParagraph>
              If you're struggling to pay, contact HMRC as soon as possible to
              discuss a payment plan. They're often willing to help if you're
              proactive.
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Underpayment and Investigations">
            <GuideParagraph>
              If you understate your income or overclaim expenses, you may face:
            </GuideParagraph>
            <GuideBulletList
              items={[
                "Having to pay the correct tax plus interest",
                "Penalties of up to 100% of the tax owed (or more in serious cases)",
                "Criminal prosecution in cases of tax evasion",
              ]}
            />
            <GuideParagraph>
              If you make an honest mistake and tell HMRC as soon as you
              discover it, penalties are usually lower or waived entirely.
            </GuideParagraph>
          </GuideSubsection>
        </GuideSection>

        <GuideSection id="getting-help" title="Getting Professional Help">
          <GuideParagraph>
            Many sole traders manage their own tax affairs, especially when
            starting out. However, an accountant can help with:
          </GuideParagraph>
          <GuideBulletList
            items={[
              "Completing your Self Assessment tax return accurately",
              "Identifying all allowable expenses you can claim",
              "Advising on tax-efficient business structures",
              "Planning for tax payments and avoiding cash flow problems",
              "Dealing with HMRC enquiries or investigations",
              "Helping with VAT registration and returns",
            ]}
          />
          <GuideParagraph>
            The cost of an accountant is a deductible business expense. For many
            sole traders, the time saved and peace of mind justifies the cost.
          </GuideParagraph>

          <GuideSubsection title="HMRC Resources">
            <GuideParagraph>
              HMRC provides comprehensive support for sole traders:
            </GuideParagraph>
            <GuideBulletList
              items={[
                <>
                  <HmrcLink href="https://www.gov.uk/set-up-sole-trader">
                    Setting up as a sole trader
                  </HmrcLink>
                </>,
                <>
                  <HmrcLink href="https://www.gov.uk/self-assessment-tax-returns">
                    Self Assessment tax returns
                  </HmrcLink>
                </>,
                <>
                  <HmrcLink href="https://www.gov.uk/self-employed-records">
                    Record keeping for the self-employed
                  </HmrcLink>
                </>,
                <>
                  HMRC helpline: 0300 200 3310 (Self Assessment enquiries)
                </>,
                <>
                  Online tax account at{" "}
                  <HmrcLink href="https://www.gov.uk/personal-tax-account">
                    gov.uk/personal-tax-account
                  </HmrcLink>
                </>,
              ]}
            />
          </GuideSubsection>
        </GuideSection>

        <section className="mt-12 rounded-lg border border-border bg-surface p-6">
          <p className="text-sm text-muted">
            <strong className="text-foreground">Remember:</strong> This guide
            provides general information about UK sole trader financial
            requirements as of September 2026. Tax laws and rates change
            regularly. Always verify current requirements with HMRC or consult a
            qualified professional for advice specific to your business.
          </p>
        </section>
      </GuideLayout>
    </main>
  );
}
