import type { Metadata } from "next";
import Link from "next/link";
import { ChevronLeft } from "lucide-react";
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
  title: "Limited Company Financial Requirements Guide",
  description:
    "Comprehensive guide to UK limited company financial requirements, including record keeping, Companies House filings, Corporation Tax, and statutory accounts.",
  openGraph: {
    title: "Limited Company Financial Requirements Guide",
    description:
      "Comprehensive guide to UK limited company financial requirements, including record keeping, Companies House filings, Corporation Tax, and statutory accounts.",
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

export default function LimitedCompaniesGuidePage() {
  return (
    <main className="flex flex-1 flex-col bg-background">
      <Link
        href="/guides"
        className="mx-auto flex w-full max-w-7xl items-center gap-1 px-6 pt-8 text-sm text-navy hover:underline"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to guides
      </Link>

      <GuideLayout
        title="Limited Company Financial Requirements"
        description="A comprehensive guide to understanding and meeting your financial obligations as a UK limited company director."
        sections={sections}
      >
        <GuideSection id="overview" title="Overview">
          <GuideParagraph>
            Running a limited company in the UK comes with specific financial
            responsibilities. As a director, you must ensure your company keeps
            accurate records, files returns on time, and pays the correct amount
            of tax. This guide covers the key requirements you need to know.
          </GuideParagraph>
          <GuideParagraph>
            Limited companies are separate legal entities from their directors
            and shareholders, which means they have their own legal obligations.
            Understanding these requirements is essential for staying compliant
            and avoiding penalties.
          </GuideParagraph>
          <GuideWarning>
            This guide is for informational purposes only and does not
            constitute professional advice. Always consult with a qualified
            accountant or tax advisor for guidance specific to your company.
          </GuideWarning>
        </GuideSection>

        <GuideSection id="record-keeping" title="Record Keeping Requirements">
          <GuideParagraph>
            Limited companies must keep detailed financial records for all
            business transactions. These records form the basis of your
            statutory accounts and tax returns, and HMRC or Companies House may
            request to see them.
          </GuideParagraph>

          <GuideSubsection title="What Records Must Be Kept">
            <GuideBulletList
              items={[
                "All money received and spent by the company",
                "Details of assets owned by the company",
                "Debts the company owes and debts owed to the company",
                "Stock the company owns at the end of each financial year",
                "Invoices, receipts, and other financial documents",
                "Bank statements and correspondence",
                "Records of shareholders and share transactions",
                "Details of directors and company secretaries",
                "Minutes of board meetings and resolutions",
              ]}
            />
            <GuideParagraph>
              Read more about{" "}
              <HmrcLink href="https://www.gov.uk/running-a-limited-company/company-records">
                company record keeping requirements on GOV.UK
              </HmrcLink>
              .
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="How Long to Keep Records">
            <GuideParagraph>
              You must keep company records for at least 6 years from the end of
              the last financial year they relate to. This applies to both
              physical and digital records. Many companies choose to keep
              records for longer as a precaution.
            </GuideParagraph>
            <GuideParagraph>
              If you don&apos;t keep records for long enough, you may face penalties
              or difficulties if HMRC investigates your company&apos;s tax affairs.
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Digital vs Paper Records">
            <GuideParagraph>
              You can keep your records in paper form, digitally, or a
              combination of both. Digital records are increasingly popular as
              they&apos;re easier to store, search, and share with your accountant.
              However, you must ensure digital records are securely backed up
              and protected.
            </GuideParagraph>
            <GuideParagraph>
              If you use accounting software, make sure you can export and store
              your data in a format that will remain accessible for the full
              6-year retention period.
            </GuideParagraph>
          </GuideSubsection>
        </GuideSection>

        <GuideSection
          id="filing-deadlines"
          title="Filing Deadlines & Requirements"
        >
          <GuideParagraph>
            Limited companies must file several documents with both Companies
            House and HMRC throughout the year. Missing these deadlines can
            result in automatic penalties.
          </GuideParagraph>

          <GuideSubsection title="Companies House Annual Accounts">
            <GuideParagraph>
              You must file your company&apos;s annual accounts with Companies House
              every year. The deadline is 9 months after your company&apos;s
              financial year end. For example, if your year end is 31 March,
              your accounts must be filed by 31 December.
            </GuideParagraph>
            <GuideParagraph>
              These accounts must be prepared according to UK accounting
              standards and include a balance sheet, profit and loss statement,
              and various notes. Most companies use an accountant to prepare
              these.
            </GuideParagraph>
            <GuideParagraph>
              Learn more about{" "}
              <HmrcLink href="https://www.gov.uk/annual-accounts">
                filing annual accounts
              </HmrcLink>
              .
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Confirmation Statement">
            <GuideParagraph>
              Every company must file a confirmation statement at least once a
              year. This confirms that the information Companies House holds
              about your company is correct, including details of directors,
              shareholders, and the registered office address.
            </GuideParagraph>
            <GuideParagraph>
              The deadline is 14 days after the anniversary of either your
              incorporation date or the date of your last confirmation
              statement.
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Corporation Tax Return">
            <GuideParagraph>
              You must file a Company Tax Return (CT600) with HMRC for each
              accounting period. The deadline is 12 months after the end of the
              accounting period. For example, if your accounting period ends on
              31 March 2026, your CT600 must be filed by 31 March 2027.
            </GuideParagraph>
            <GuideParagraph>
              The CT600 includes detailed information about your company&apos;s
              profits, losses, and tax calculation. Most accountants file this
              electronically on your behalf.
            </GuideParagraph>
            <GuideParagraph>
              Find out more about{" "}
              <HmrcLink href="https://www.gov.uk/corporation-tax">
                Corporation Tax
              </HmrcLink>{" "}
              and{" "}
              <HmrcLink href="https://www.gov.uk/government/publications/corporation-tax-company-tax-return-ct600-2024-version-3">
                completing a CT600 return
              </HmrcLink>
              .
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Corporation Tax Payment">
            <GuideParagraph>
              Corporation Tax must be paid 9 months and 1 day after the end of
              your accounting period. This deadline is earlier than the filing
              deadline for your tax return. For example, if your accounting
              period ends on 31 March 2026, your Corporation Tax must be paid by
              1 January 2027.
            </GuideParagraph>
            <GuideParagraph>
              Very large companies (profits over £1.5 million) must pay
              Corporation Tax in quarterly instalments.
            </GuideParagraph>
          </GuideSubsection>
        </GuideSection>

        <GuideSection id="accounting-tax" title="Accounting & Tax Obligations">
          <GuideSubsection title="Statutory Accounts">
            <GuideParagraph>
              All limited companies must prepare statutory accounts in
              accordance with UK Generally Accepted Accounting Practice (UK
              GAAP) or International Financial Reporting Standards (IFRS). These
              accounts must give a &quot;true and fair view&quot; of the company&apos;s
              financial position.
            </GuideParagraph>
            <GuideParagraph>
              Micro-entities and small companies may be able to use simplified
              accounting requirements. Your accountant can advise on which
              category applies to your company.
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Corporation Tax Rates">
            <GuideParagraph>
              Corporation Tax rates for the 2026/27 tax year are:
            </GuideParagraph>
            <GuideBulletList
              items={[
                "19% for profits up to £50,000 (small profits rate)",
                "25% for profits over £250,000 (main rate)",
                "Marginal rate of 26.5% for profits between £50,000 and £250,000",
              ]}
            />
            <GuideParagraph>
              These thresholds are proportionally reduced if you have associated
              companies or your accounting period is shorter than 12 months.
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Directors&apos; Responsibilities">
            <GuideParagraph>
              As a company director, you have legal responsibilities for your
              company&apos;s financial affairs:
            </GuideParagraph>
            <GuideBulletList
              items={[
                "Ensure the company keeps adequate accounting records",
                "Approve and sign the annual accounts",
                "Ensure all returns and payments are made on time",
                "Act in the best interests of the company",
                "Declare any conflicts of interest",
                "Not trade while insolvent",
              ]}
            />
            <GuideParagraph>
              Directors who fail to meet their responsibilities can face
              personal liability, disqualification, or prosecution in serious
              cases.
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Dividends vs Salary">
            <GuideParagraph>
              Many directors pay themselves through a combination of salary and
              dividends. Dividends are paid from company profits after
              Corporation Tax and have different tax treatment than salary:
            </GuideParagraph>
            <GuideBulletList
              items={[
                "Dividends don&apos;t attract National Insurance contributions",
                "Dividends have a £500 tax-free allowance (2026/27)",
                "Dividend tax rates are 8.75%, 33.75%, and 39.35% depending on your income tax band",
                "Salaries are deductible against Corporation Tax; dividends are not",
              ]}
            />
            <GuideParagraph>
              The most tax-efficient remuneration strategy depends on your
              personal circumstances. An accountant can help you optimize this.
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="VAT Registration">
            <GuideParagraph>
              You must register for VAT if your company&apos;s VAT taxable turnover
              is more than £90,000 (2026/27 threshold). You can also register
              voluntarily if your turnover is below this level.
            </GuideParagraph>
            <GuideParagraph>
              Once registered, you must charge VAT on eligible sales, submit VAT
              returns (usually quarterly), and comply with Making Tax Digital
              (MTD) requirements.
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
            Failing to meet your financial obligations can result in significant
            penalties. It&apos;s important to understand the consequences and ensure
            you meet all deadlines.
          </GuideParagraph>

          <GuideSubsection title="Late Filing Penalties (Companies House)">
            <GuideParagraph>
              Companies House imposes automatic penalties for late accounts:
            </GuideParagraph>
            <GuideBulletList
              items={[
                "Up to 1 month late: £150",
                "1 to 3 months late: £375",
                "3 to 6 months late: £750",
                "Over 6 months late: £1,500",
              ]}
            />
            <GuideParagraph>
              These penalties double for repeat offences within 12 months.
              Persistent late filing can also lead to the company being struck
              off the register.
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Late Filing Penalties (HMRC)">
            <GuideParagraph>
              HMRC charges penalties for late Corporation Tax returns:
            </GuideParagraph>
            <GuideBulletList
              items={[
                "1 day late: £100",
                "3 months late: Another £100",
                "6 months late: HMRC estimate your tax and add 10% of the unpaid tax",
                "12 months late: Another 10% of the unpaid tax (or £3,000 if greater)",
              ]}
            />
            <GuideParagraph>
              Learn more about{" "}
              <HmrcLink href="https://www.gov.uk/government/publications/rates-and-allowances-penalties-for-late-filing-and-late-payment">
                penalties for late filing and payment
              </HmrcLink>
              .
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Late Payment Interest">
            <GuideParagraph>
              If you pay your Corporation Tax late, HMRC charges interest on the
              outstanding amount from the due date until you pay. The interest
              rate varies but is typically around 7-8%. Interest is charged
              daily, so paying even a few days late can be costly.
            </GuideParagraph>
          </GuideSubsection>

          <GuideSubsection title="Director Disqualification">
            <GuideParagraph>
              In serious cases of non-compliance, directors can be disqualified
              from acting as a company director for up to 15 years. This can
              happen if you:
            </GuideParagraph>
            <GuideBulletList
              items={[
                "Repeatedly fail to file accounts or returns",
                "Trade while your company is insolvent",
                "Fail to pay Corporation Tax or VAT",
                "Commit fraud or other criminal offences",
              ]}
            />
            <GuideParagraph>
              Director disqualification is a serious matter and can have
              long-lasting effects on your ability to run a business.
            </GuideParagraph>
          </GuideSubsection>
        </GuideSection>

        <GuideSection id="getting-help" title="Getting Professional Help">
          <GuideParagraph>
            While it&apos;s possible to manage your company&apos;s finances yourself,
            most directors work with professional accountants. An accountant can:
          </GuideParagraph>
          <GuideBulletList
            items={[
              "Prepare your statutory accounts and Corporation Tax return",
              "Advise on tax-efficient remuneration strategies",
              "Ensure you meet all filing deadlines",
              "Help with tax planning and forecasting",
              "Represent you in dealings with HMRC",
              "Provide peace of mind that your finances are compliant",
            ]}
          />
          <GuideParagraph>
            The cost of an accountant is tax-deductible and often saves more
            than it costs through better tax planning and avoiding penalties.
          </GuideParagraph>

          <GuideSubsection title="HMRC Resources">
            <GuideParagraph>
              HMRC provides extensive guidance and support for limited companies:
            </GuideParagraph>
            <GuideBulletList
              items={[
                <>
                  <HmrcLink href="https://www.gov.uk/corporation-tax">
                    Corporation Tax overview
                  </HmrcLink>
                </>,
                <>
                  <HmrcLink href="https://www.gov.uk/running-a-limited-company">
                    Running a limited company
                  </HmrcLink>
                </>,
                <>
                  <HmrcLink href="https://www.gov.uk/annual-accounts">
                    Annual accounts guidance
                  </HmrcLink>
                </>,
                <>
                  HMRC helpline: 0300 200 3410 (Corporation Tax enquiries)
                </>,
              ]}
            />
          </GuideSubsection>
        </GuideSection>

        <section className="mt-12 rounded-lg border border-border bg-surface p-6">
          <p className="text-sm text-muted">
            <strong className="text-foreground">Remember:</strong> This guide
            provides general information about UK limited company financial
            requirements as of September 2026. Tax laws and rates change
            regularly. Always verify current requirements with HMRC or consult a
            qualified professional for advice specific to your company.
          </p>
        </section>
      </GuideLayout>
    </main>
  );
}
