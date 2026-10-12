import type { Metadata } from "next";
import Link from "next/link";
import { GuideLayout } from "@/components/guides/guide-layout";
import {
  GuideSection,
  GuideSubsection,
  GuideParagraph,
  GuideBulletList,
} from "@/components/guides/guide-section";
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
  title: "Terms of Service",
  description:
    "The terms for using Alfa by Dot+Dash, including subscriptions, your responsibilities, and our data processing terms under UK GDPR.",
  alternates: {
    canonical: "https://alfa.dotanddashconsulting.com/terms",
  },
};

const sections = [
  { id: "agreement", title: "About these terms" },
  { id: "service", title: "What Alfa does and doesn't do" },
  { id: "accounts", title: "Accounts and access" },
  { id: "billing", title: "Trial, plans and billing" },
  { id: "your-data", title: "Your data" },
  { id: "acceptable-use", title: "Acceptable use" },
  { id: "availability", title: "Availability and changes" },
  { id: "liability", title: "Liability" },
  { id: "ending", title: "Ending your account" },
  { id: "data-processing", title: "Data processing terms" },
  { id: "general", title: "General" },
];

const privacyLink = (
  <Link href="/privacy" className="text-navy underline">
    Privacy Notice
  </Link>
);

export default function TermsPage() {
  const breadcrumbs = [
    { name: "Home", url: "/" },
    { name: "Terms", url: "/terms" },
  ];

  return (
    <>
      <StructuredData data={generateBreadcrumbSchema(breadcrumbs)} />
      <main id="main-content" tabIndex={-1} className="flex flex-1 flex-col bg-background">
        <GuideLayout
          title="Terms of Service"
          description={`The agreement between your business and ${LEGAL_ENTITY} for using Alfa. Last updated ${LEGAL_LAST_UPDATED}.`}
          sections={sections}
        >
          <GuideSection id="agreement" title="About these terms">
            <GuideParagraph>
              These terms are between {LEGAL_ENTITY}, registered in{" "}
              {LEGAL_JURISDICTION} (company no. {LEGAL_COMPANY_NUMBER}), whose
              registered office is {LEGAL_REGISTERED_OFFICE} (&ldquo;we&rdquo;,
              &ldquo;us&rdquo;), and the business that signs up for Alfa
              (&ldquo;you&rdquo;). By creating an account or using Alfa you
              agree to them on behalf of that business, and confirm you have
              authority to do so. Alfa is for business use; it is not offered to
              consumers.
            </GuideParagraph>
            <GuideParagraph>
              Our {privacyLink} explains how we handle personal data.
            </GuideParagraph>
          </GuideSection>

          <GuideSection id="service" title="What Alfa does and doesn't do">
            <GuideParagraph>
              Alfa is bookkeeping software for UK limited companies and sole
              traders: quotes, orders, invoices, expenses, bank matching,
              reports and related tools.
            </GuideParagraph>
            <GuideBulletList
              items={[
                "Alfa is a tool, not an accountant or tax adviser. Figures such as tax estimates, safe-to-pay amounts, reserves checks, deadlines and forecasts are guides only. You remain responsible for your records, tax returns and filings.",
                "Alfa does not file anything with HMRC or Companies House on your behalf.",
                "AI suggestions (categories, receipt matches and answers from the AI bookkeeper) can be wrong. Check them before you accept or rely on them.",
                "Books are kept in pounds sterling (GBP) only.",
              ]}
            />
          </GuideSection>

          <GuideSection id="accounts" title="Accounts and access">
            <GuideBulletList
              items={[
                "Keep your sign-in details secure and tell us straight away if you think someone else has accessed your account.",
                "You decide who to invite to your company and what role they have. You are responsible for what your users and invited accountants do in Alfa.",
                "The information you give us when signing up must be accurate.",
              ]}
            />
          </GuideSection>

          <GuideSection id="billing" title="Trial, plans and billing">
            <GuideBulletList
              items={[
                <>
                  New companies get a free 30-day trial. Prices and what each
                  plan includes are shown on our{" "}
                  <Link href="/pricing" className="text-navy underline">
                    pricing page
                  </Link>
                  .
                </>,
                "Paid plans are billed in advance, monthly or yearly, through Stripe, and renew automatically until cancelled. Prices are shown excluding VAT, which is added where applicable.",
                "You can cancel at any time. Your plan continues until the end of the period you have paid for. Fees already paid are not refundable, except where the law requires.",
                "If a payment fails, we may limit access to paid features until it is resolved.",
                "We will give you at least 30 days' notice of any price change, which takes effect at your next renewal.",
              ]}
            />
          </GuideSection>

          <GuideSection id="your-data" title="Your data">
            <GuideBulletList
              items={[
                "You own the records you put into Alfa. You give us permission to store and process them only to provide Alfa to you, as set out in the data processing terms below.",
                "You are responsible for having the right to put personal data about your clients, staff and others into Alfa.",
                "You are responsible for keeping your own copies of records you are legally required to keep. Download your accountant pack from Reports before you delete your company.",
              ]}
            />
          </GuideSection>

          <GuideSection id="acceptable-use" title="Acceptable use">
            <GuideParagraph>You must not:</GuideParagraph>
            <GuideBulletList
              items={[
                "use Alfa for anything unlawful, including fraud, money laundering or tax evasion;",
                "send spam or misleading emails through Alfa;",
                "upload malware, or try to break, overload or get around the security of Alfa;",
                "try to access another company's data;",
                "copy, resell or reverse engineer Alfa, except where the law allows.",
              ]}
            />
            <GuideParagraph>
              We may suspend accounts that break these rules. Where we can, we
              will tell you first and give you a chance to put things right.
            </GuideParagraph>
          </GuideSection>

          <GuideSection id="availability" title="Availability and changes">
            <GuideParagraph>
              We work to keep Alfa available and your data safe, but we cannot
              promise uninterrupted service. We may change or improve features
              over time. If we remove a significant feature from a paid plan, we
              will tell you in advance.
            </GuideParagraph>
          </GuideSection>

          <GuideSection id="liability" title="Liability">
            <GuideBulletList
              items={[
                "Nothing in these terms limits liability for death or personal injury caused by negligence, for fraud, or for anything else that cannot be limited by law.",
                "We are not liable for loss of profits, revenue, business or goodwill, or for any indirect or consequential loss.",
                "We are not liable for losses caused by relying on figures, estimates or AI suggestions without checking them, or by tax and filing decisions you make.",
                "Otherwise, our total liability in any 12-month period is limited to the fees you paid us in that period.",
              ]}
            />
          </GuideSection>

          <GuideSection id="ending" title="Ending your account">
            <GuideBulletList
              items={[
                "A company owner can delete the company at any time in Settings. This permanently deletes its records, files and member accounts straight away.",
                "We may end these terms with 30 days' notice, or straight away if you seriously break them. If we end them without cause, we will refund fees for the unused period and help you export your data.",
              ]}
            />
          </GuideSection>

          <GuideSection id="data-processing" title="Data processing terms">
            <GuideParagraph>
              This section forms the data processing agreement required by
              Article 28 of the UK GDPR. It applies to personal data in the
              records you keep in Alfa (&ldquo;Customer Personal Data&rdquo;).
              You are the controller and we are the processor.
            </GuideParagraph>
            <GuideSubsection title="Scope">
              <GuideBulletList
                items={[
                  "Subject matter and duration: providing Alfa for as long as you have an account.",
                  "Nature and purpose: storing, organising, displaying, emailing and analysing your business records as you instruct through Alfa.",
                  "Types of data: names, contact details, addresses, bank details, transaction and payment details, expense and receipt details, shareholder and dividend details, and similar business records.",
                  "Data subjects: your clients and their contacts, suppliers, staff, directors, shareholders, and users you invite.",
                ]}
              />
            </GuideSubsection>
            <GuideSubsection title="Our commitments">
              <GuideBulletList
                items={[
                  "We process Customer Personal Data only on your documented instructions — which are these terms and your use of Alfa — unless the law requires otherwise, in which case we will tell you unless the law forbids it.",
                  "Everyone who can access Customer Personal Data on our behalf is bound by confidentiality.",
                  "We take appropriate technical and organisational security measures, as described in our Privacy Notice.",
                  "We will help you respond to requests from data subjects exercising their rights, and with security, breach notification, and data protection impact assessments, taking into account the information available to us.",
                  "We will tell you without undue delay after becoming aware of a personal data breach affecting Customer Personal Data.",
                  "When your account ends, we delete Customer Personal Data, unless the law requires us to keep it.",
                  "We will make available the information you reasonably need to show compliance with Article 28, and allow for and contribute to reasonable audits, on reasonable notice and at your cost.",
                ]}
              />
            </GuideSubsection>
            <GuideSubsection title="Sub-processors">
              <GuideParagraph>
                You give general authorisation for us to use the sub-processors
                listed in our{" "}
                <Link href="/privacy#sharing" className="text-navy underline">
                  Privacy Notice
                </Link>
                . We will update that list and give you at least 14 days&rsquo;
                notice before adding or replacing a sub-processor, so you can
                object. If you object on reasonable data protection grounds and
                we cannot address it, you may end your subscription and receive
                a refund for the unused period. We put data protection terms in
                place with each sub-processor that are no less protective than
                these, and remain responsible for their performance.
              </GuideParagraph>
            </GuideSubsection>
            <GuideSubsection title="International transfers">
              <GuideParagraph>
                Where Customer Personal Data is transferred outside the UK, we
                make sure an appropriate safeguard is in place, such as the UK
                Extension to the EU–US Data Privacy Framework or the UK
                International Data Transfer Addendum.
              </GuideParagraph>
            </GuideSubsection>
          </GuideSection>

          <GuideSection id="general" title="General">
            <GuideBulletList
              items={[
                "We may update these terms. We will tell you about significant changes at least 30 days before they take effect. If you keep using Alfa after that, the new terms apply.",
                "If any part of these terms is found to be unenforceable, the rest stays in force.",
                "These terms are governed by the law of England and Wales, and the courts of England and Wales have exclusive jurisdiction.",
                <>
                  Contact:{" "}
                  <a href={`mailto:${LEGAL_CONTACT_EMAIL}`} className="text-navy underline">
                    {LEGAL_CONTACT_EMAIL}
                  </a>
                </>,
              ]}
            />
          </GuideSection>
        </GuideLayout>
      </main>
    </>
  );
}
