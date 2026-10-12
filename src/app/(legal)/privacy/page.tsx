import type { Metadata } from "next";
import Link from "next/link";
import { GuideLayout } from "@/components/guides/guide-layout";
import {
  GuideSection,
  GuideSubsection,
  GuideParagraph,
  GuideBulletList,
} from "@/components/guides/guide-section";
import { SubProcessorTable } from "@/components/legal/sub-processor-table";
import { StructuredData, generateBreadcrumbSchema } from "@/lib/structured-data";
import {
  LEGAL_COMPANY_NUMBER,
  LEGAL_CONTACT_EMAIL,
  LEGAL_ENTITY,
  LEGAL_JURISDICTION,
  LEGAL_LAST_UPDATED,
  LEGAL_REGISTERED_OFFICE,
} from "@/lib/legal";

export const metadata: Metadata = {
  title: "Privacy Notice",
  description:
    "How Alfa by Dot+Dash collects, uses, stores and protects personal and financial data, who we share it with, and your rights under UK GDPR.",
  alternates: {
    canonical: "https://alfa.dotanddashconsulting.com/privacy",
  },
};

const sections = [
  { id: "who-we-are", title: "Who we are" },
  { id: "two-roles", title: "Your data and your customers' data" },
  { id: "what-we-collect", title: "What we collect" },
  { id: "how-we-use", title: "How we use it and why" },
  { id: "ai", title: "AI and receipt reading" },
  { id: "sharing", title: "Who we share it with" },
  { id: "transfers", title: "International transfers" },
  { id: "retention", title: "How long we keep it" },
  { id: "security", title: "Security" },
  { id: "cookies", title: "Cookies and analytics" },
  { id: "rights", title: "Your rights" },
  { id: "changes", title: "Changes and contact" },
];

const mail = (
  <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-navy underline">
    {LEGAL_CONTACT_EMAIL}
  </a>
);

export default function PrivacyPage() {
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Privacy", url: "/privacy" },
  ];

  return (
    <>
      <StructuredData data={generateBreadcrumbSchema(breadcrumbs)} />
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col bg-background">
        <GuideLayout
          title="Privacy Notice"
          description={`How we look after the personal and financial information you keep in Alfa. Last updated ${LEGAL_LAST_UPDATED}.`}
          sections={sections}
        >
          <GuideSection id="who-we-are" title="Who we are">
            <GuideParagraph>
              Alfa is accounting software made by {LEGAL_ENTITY} (&ldquo;we&rdquo;,
              &ldquo;us&rdquo;). This notice explains what personal data we
              collect when you use Alfa, the Alfa mobile app and this website,
              what we do with it, and the rights you have under the UK General
              Data Protection Regulation (UK GDPR) and the Data Protection Act
              2018.
            </GuideParagraph>
            <GuideParagraph>
              {LEGAL_ENTITY} is registered in {LEGAL_JURISDICTION}, company
              no. {LEGAL_COMPANY_NUMBER}. Registered office:{" "}
              {LEGAL_REGISTERED_OFFICE}.
            </GuideParagraph>
            <GuideParagraph>
              Questions or requests about your data: {mail}.
            </GuideParagraph>
          </GuideSection>

          <GuideSection id="two-roles" title="Your data and your customers' data">
            <GuideParagraph>
              We handle personal data in two different roles:
            </GuideParagraph>
            <GuideBulletList
              items={[
                <>
                  <strong>As a controller</strong> for information about you as
                  an Alfa user: your account, sign-in details, subscription and
                  how you use the service. This notice covers that.
                </>,
                <>
                  <strong>As a processor</strong> for the records your business
                  keeps in Alfa: clients and their contacts, invoices, expenses,
                  bank transactions, receipts, shareholders and team members.
                  Your business is the controller of that data and decides what
                  goes in. We only process it to run Alfa for you, under the
                  data processing terms in our{" "}
                  <Link href="/terms#data-processing" className="text-navy underline">
                    Terms of Service
                  </Link>
                  . If you are one of our customers&rsquo; clients or staff,
                  contact that business first about your data.
                </>,
              ]}
            />
          </GuideSection>

          <GuideSection id="what-we-collect" title="What we collect">
            <GuideSubsection title="Information you give us">
              <GuideBulletList
                items={[
                  "Account details: name, email address, profile photo, and the Google account details you sign in with.",
                  "Company details: company name, registration number, registered address, VAT number, financial year, bank account details shown on invoices, and logo.",
                  "Financial records you enter, import or forward: quotes, orders, invoices, credit notes, expenses, mileage, reimbursements, receipts, bank statement CSVs, dividends, director's loans and shareholder details.",
                  "Contact details of your clients, team members and accountants you invite.",
                  "Questions you ask the AI bookkeeper.",
                  "Messages you send us for support.",
                ]}
              />
            </GuideSubsection>
            <GuideSubsection title="Information collected automatically">
              <GuideBulletList
                items={[
                  "Sign-in and session data, such as IP address, browser and device, handled by our sign-in provider.",
                  "An audit log of changes made in your company's books, including who made them and when.",
                  "Error and service logs used to keep Alfa running.",
                  "Aggregated, cookie-free page analytics and performance measurements.",
                  "Push notification tokens, if you turn on notifications.",
                ]}
              />
            </GuideSubsection>
            <GuideSubsection title="Information from others">
              <GuideBulletList
                items={[
                  "Public company records from Companies House, when you look up your company during set-up.",
                  "Payment and subscription status from Stripe. We never see or store your full card number.",
                  "Emails and attachments forwarded to your company's receipt inbox.",
                ]}
              />
            </GuideSubsection>
          </GuideSection>

          <GuideSection id="how-we-use" title="How we use it and why">
            <GuideBulletList
              items={[
                <>
                  <strong>To provide Alfa</strong> — storing your books,
                  producing PDFs and reports, sending emails you ask us to send,
                  reading receipts, and matching bank payments. Lawful basis:
                  performance of our contract with you.
                </>,
                <>
                  <strong>To take payment</strong> for your subscription.
                  Lawful basis: contract.
                </>,
                <>
                  <strong>To keep Alfa secure and working</strong> — audit
                  logs, error logs, fraud and abuse prevention. Lawful basis:
                  our legitimate interest in running a secure service.
                </>,
                <>
                  <strong>To improve Alfa</strong> using aggregated,
                  cookie-free analytics that do not identify you. Lawful basis:
                  legitimate interests.
                </>,
                <>
                  <strong>To contact you</strong> about your account, billing,
                  trial ending and important service changes. Lawful basis:
                  contract and legitimate interests.
                </>,
                <>
                  <strong>To meet legal obligations</strong>, such as keeping
                  our own tax and accounting records. Lawful basis: legal
                  obligation.
                </>,
              ]}
            />
            <GuideParagraph>
              We do not sell your data, use it for advertising, or share it
              with data brokers.
            </GuideParagraph>
          </GuideSection>

          <GuideSection id="ai" title="AI and receipt reading">
            <GuideParagraph>
              Some Alfa features use an AI model (Anthropic&rsquo;s Claude),
              reached through Vercel AI Gateway:
            </GuideParagraph>
            <GuideBulletList
              items={[
                "The AI bookkeeper: when you ask a question, your question and the figures needed to answer it (for example totals, client names, payments and categories from your books) are sent to the model.",
                "Suggested categories and receipt matching: bank payment descriptions, amounts and dates, and expense details are sent to the model.",
                "AI receipt reading, when your company uses it: receipt images and PDFs are sent to the model to read the supplier, date and amount. Otherwise receipts are read on our own servers without AI.",
              ]}
            />
            <GuideParagraph>
              Only the data needed for that request is sent. The AI can read
              your books but cannot change them: nothing is saved until someone
              in your company accepts a suggestion. Under their commercial
              terms, our AI providers do not use this data to train their
              models. They may keep it for a short time to detect misuse.
            </GuideParagraph>
          </GuideSection>

          <GuideSection id="sharing" title="Who we share it with">
            <GuideParagraph>
              We use these providers (sub-processors) to run Alfa. Each is bound
              by a contract that limits what they can do with your data.
            </GuideParagraph>
            <SubProcessorTable />
            <GuideParagraph>
              We also share data when you ask us to — for example emailing an
              invoice to your client, or giving your accountant access — and
              where the law requires it. Company look-ups go to Companies House,
              which only receives the name or number you search for.
            </GuideParagraph>
          </GuideSection>

          <GuideSection id="transfers" title="International transfers">
            <GuideParagraph>
              Your books are stored in a database in the UK (London). Some of
              our providers are based in, or process data in, the United States.
              Where personal data leaves the UK, we rely on the UK Extension to
              the EU–US Data Privacy Framework where the provider is certified,
              or on the UK International Data Transfer Addendum to the EU
              Standard Contractual Clauses.
            </GuideParagraph>
          </GuideSection>

          <GuideSection id="retention" title="How long we keep it">
            <GuideBulletList
              items={[
                "Your books are kept for as long as your company has an Alfa account.",
                "When a company owner deletes the company in Settings, its records, files and member accounts are deleted straight away. Copies in encrypted backups are overwritten within a short period afterwards.",
                "UK law requires businesses to keep financial records for at least six years (companies) or five years after the Self Assessment deadline (sole traders). Download your accountant pack from Reports before deleting your company — once deleted, we cannot recover it.",
                "Service and error logs are deleted after 90 days.",
                "We keep our own billing records for as long as UK tax law requires.",
              ]}
            />
          </GuideSection>

          <GuideSection id="security" title="Security">
            <GuideBulletList
              items={[
                "All traffic is encrypted in transit (HTTPS), and data is encrypted at rest by our hosting and database providers.",
                "Receipts and documents are kept in private storage and only served to signed-in members of your company.",
                "Each company's books are kept separate, and every request checks that you belong to the company and have the right role.",
                "Changes to the books are recorded in an audit log.",
              ]}
            />
            <GuideParagraph>
              If a data breach is likely to put your rights at risk, we will
              tell you and the Information Commissioner&rsquo;s Office (ICO) as
              the law requires.
            </GuideParagraph>
          </GuideSection>

          <GuideSection id="cookies" title="Cookies and analytics">
            <GuideParagraph>
              Alfa only uses cookies that are needed for it to work:
            </GuideParagraph>
            <GuideBulletList
              items={[
                "Sign-in session cookies set by our sign-in provider, Clerk.",
                "alfa_ui_prefs — remembers your display settings, such as text size and contrast, for one year.",
                "alfa_signup_plan — remembers the plan you chose while you finish signing up.",
              ]}
            />
            <GuideParagraph>
              Our analytics (Vercel Web Analytics and Speed Insights) do not use
              cookies and do not track you across other websites. We do not use
              advertising or third-party tracking cookies.
            </GuideParagraph>
          </GuideSection>

          <GuideSection id="rights" title="Your rights">
            <GuideParagraph>Under UK GDPR you have the right to:</GuideParagraph>
            <GuideBulletList
              items={[
                "access a copy of your personal data;",
                "have inaccurate data corrected;",
                "have your data deleted;",
                "restrict or object to how we use it;",
                "receive your data in a portable format;",
                "withdraw consent where we rely on it.",
              ]}
            />
            <GuideParagraph>
              Email {mail} and we will respond within one month. Owners, team
              members and accountants can also download the accountant pack
              (CSVs, PDFs and receipts) from Reports on every plan. If you are unhappy with
              how we handle your data, you can complain to the{" "}
              <a
                href="https://ico.org.uk/make-a-complaint/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-navy underline"
              >
                Information Commissioner&rsquo;s Office
              </a>
              .
            </GuideParagraph>
          </GuideSection>

          <GuideSection id="changes" title="Changes and contact">
            <GuideParagraph>
              We will update this notice when how we handle data changes, and
              tell you by email or in the app about significant changes. The
              date at the top shows when it last changed.
            </GuideParagraph>
            <GuideParagraph>
              {LEGAL_ENTITY} — {mail}
            </GuideParagraph>
          </GuideSection>
        </GuideLayout>
      </main>
    </>
  );
}
