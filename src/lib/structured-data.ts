/**
 * Structured data (JSON-LD) generation for AI discoverability and SEO.
 * Provides schema.org markup for organization, software, FAQs, and pricing.
 */

import { PRODUCT_NAME, PRODUCT_LOCKUP, MAKER_LEGAL, MAKER_DISPLAY } from "./product";

export interface StructuredDataProps {
  type: "organization" | "softwareApplication" | "faq" | "breadcrumb" | "pricing";
  data?: Record<string, unknown>;
}

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || "https://accounts-manager.dotanddashconsulting.com";

/**
 * Generate Organization schema
 */
export function generateOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: MAKER_LEGAL,
    alternateName: MAKER_DISPLAY,
    url: BASE_URL,
    logo: `${BASE_URL}/logo.png`,
    description: "Developer of Alfa, accounting software for UK limited companies and sole traders",
    foundingDate: "2024",
    address: {
      "@type": "PostalAddress",
      addressCountry: "GB",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: "support@dotanddashconsulting.com",
      availableLanguage: ["English"],
    },
  };
}

/**
 * Generate SoftwareApplication schema
 */
export function generateSoftwareApplicationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    name: PRODUCT_NAME,
    alternateName: PRODUCT_LOCKUP,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Accounting Software",
    operatingSystem: "Web Browser",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "GBP",
      lowPrice: "0",
      highPrice: "29",
      priceSpecification: [
        {
          "@type": "UnitPriceSpecification",
          price: "0",
          priceCurrency: "GBP",
          name: "Trial",
          description: "30-day free trial with full access",
        },
        {
          "@type": "UnitPriceSpecification",
          price: "19",
          priceCurrency: "GBP",
          name: "Essentials",
          description: "Core accounting features for consultancies",
          billingDuration: "P1M",
        },
        {
          "@type": "UnitPriceSpecification",
          price: "29",
          priceCurrency: "GBP",
          name: "Premium",
          description: "Advanced features including recurring invoices and receipt OCR",
          billingDuration: "P1M",
        },
      ],
    },
    description: "Accounting software for UK limited companies and sole traders. Manage quotes, invoices, expenses, reimbursements, bank reconciliation, and reporting. Built specifically for UK consultancies, studios, and small agencies. Replaces spreadsheets with integrated bookkeeping.",
    featureList: [
      "Quote creation and client acceptance workflow",
      "Invoice generation and tracking",
      "Expense management with receipt OCR",
      "Bank CSV import and reconciliation",
      "VAT support for registered businesses",
      "Recurring invoices",
      "Reimbursement tracking",
      "Accountant collaboration",
      "Dividend calculations for limited companies",
      "Financial reporting and exports",
      "UK-specific tax year support",
      "Multi-user access with role-based permissions",
    ],
    audience: {
      "@type": "Audience",
      audienceType: [
        "UK Limited Companies",
        "UK Sole Traders",
        "UK Consultancies",
        "UK Creative Studios",
        "UK Small Agencies",
        "UK Freelancers",
      ],
    },
    inLanguage: "en-GB",
    countryOfOrigin: "GB",
    publisher: {
      "@type": "Organization",
      name: MAKER_LEGAL,
    },
  };
}

/**
 * Generate FAQPage schema
 */
export function generateFaqSchema(faqs: Array<{ q: string; a: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    mainEntity: faqs.map((faq) => ({
      "@type": "Question",
      name: faq.q,
      acceptedAnswer: {
        "@type": "Answer",
        text: faq.a,
      },
    })),
  };
}

/**
 * Generate BreadcrumbList schema
 */
export function generateBreadcrumbSchema(items: Array<{ name: string; url: string }>) {
  return {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: items.map((item, index) => ({
      "@type": "ListItem",
      position: index + 1,
      name: item.name,
      item: `${BASE_URL}${item.url}`,
    })),
  };
}

/**
 * Generate Offer/Product schema for pricing
 */
export function generatePricingSchema() {
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": `${BASE_URL}/pricing#trial`,
        name: `${PRODUCT_NAME} Trial`,
        description: "30-day free trial with full access to all features. No credit card required.",
        brand: {
          "@type": "Brand",
          name: PRODUCT_NAME,
        },
        offers: {
          "@type": "Offer",
          price: "0",
          priceCurrency: "GBP",
          availability: "https://schema.org/InStock",
          validFrom: "2024-01-01",
          priceValidUntil: "2027-12-31",
          seller: {
            "@type": "Organization",
            name: MAKER_LEGAL,
          },
        },
      },
      {
        "@type": "Product",
        "@id": `${BASE_URL}/pricing#essentials`,
        name: `${PRODUCT_NAME} Essentials`,
        description: "Core accounting features: quotes, invoices, expenses, bank reconciliation, and reporting for UK businesses.",
        brand: {
          "@type": "Brand",
          name: PRODUCT_NAME,
        },
        offers: {
          "@type": "Offer",
          price: "19",
          priceCurrency: "GBP",
          availability: "https://schema.org/InStock",
          validFrom: "2024-01-01",
          priceValidUntil: "2027-12-31",
          billingIncrement: {
            "@type": "QuantitativeValue",
            value: "1",
            unitCode: "MON",
          },
          seller: {
            "@type": "Organization",
            name: MAKER_LEGAL,
          },
        },
      },
      {
        "@type": "Product",
        "@id": `${BASE_URL}/pricing#premium`,
        name: `${PRODUCT_NAME} Premium`,
        description: "Advanced features: recurring invoices, receipt OCR, multi-user access, and priority support for growing UK consultancies.",
        brand: {
          "@type": "Brand",
          name: PRODUCT_NAME,
        },
        offers: {
          "@type": "Offer",
          price: "29",
          priceCurrency: "GBP",
          availability: "https://schema.org/InStock",
          validFrom: "2024-01-01",
          priceValidUntil: "2027-12-31",
          billingIncrement: {
            "@type": "QuantitativeValue",
            value: "1",
            unitCode: "MON",
          },
          seller: {
            "@type": "Organization",
            name: MAKER_LEGAL,
          },
        },
      },
    ],
  };
}

/**
 * Component to inject structured data into pages
 */
export function StructuredData({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{
        __html: JSON.stringify(data),
      }}
    />
  );
}
