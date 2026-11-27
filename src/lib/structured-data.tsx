/**
 * Structured data (JSON-LD) generation for AI discoverability and SEO.
 * Provides schema.org markup for organization, software, FAQs, and pricing.
 */

import { PRODUCT_NAME, PRODUCT_LOCKUP, MAKER_LEGAL, MAKER_DISPLAY } from "./product";
import {
  FEATURE_GROUPS,
  ONE_LINE_SUMMARY,
  PLANS,
  SITE_URL,
  SUPPORT_EMAIL,
} from "./marketing/facts";

export interface StructuredDataProps {
  type: "organization" | "softwareApplication" | "faq" | "breadcrumb" | "pricing";
  data?: Record<string, unknown>;
}

const BASE_URL = SITE_URL;
const ORG_ID = `${BASE_URL}/#organization`;
const APP_ID = `${BASE_URL}/#software`;

function planSummary(id: "essentials" | "premium"): string {
  return PLANS.find((p) => p.id === id)!.summary;
}

/**
 * Generate Organization schema
 */
export function generateOrganizationSchema() {
  return {
    "@context": "https://schema.org",
    "@type": "Organization",
    "@id": ORG_ID,
    name: MAKER_LEGAL,
    alternateName: MAKER_DISPLAY,
    url: BASE_URL,
    logo: `${BASE_URL}/brand/logo.png`,
    description: "Developer of Alfa, accounting software for UK limited companies and sole traders",
    foundingDate: "2024",
    address: {
      "@type": "PostalAddress",
      addressCountry: "GB",
    },
    contactPoint: {
      "@type": "ContactPoint",
      contactType: "customer support",
      email: SUPPORT_EMAIL,
      availableLanguage: ["English"],
    },
  };
}

export type CatalogOfferAmounts = {
  essentials: string;
  premium: string;
  essentialsName?: string;
  premiumName?: string;
  essentialsDescription?: string | null;
  premiumDescription?: string | null;
};

/**
 * Generate SoftwareApplication schema
 */
export function generateSoftwareApplicationSchema(
  amounts?: CatalogOfferAmounts | null,
) {
  const essentialsPrice = amounts?.essentials ?? "19";
  const premiumPrice = amounts?.premium ?? "29";
  const essentialsName = amounts?.essentialsName ?? "Essentials";
  const premiumName = amounts?.premiumName ?? "Premium";
  const essentialsDescription =
    amounts?.essentialsDescription ?? planSummary("essentials");
  const premiumDescription =
    amounts?.premiumDescription ?? planSummary("premium");

  return {
    "@context": "https://schema.org",
    "@type": "SoftwareApplication",
    "@id": APP_ID,
    url: BASE_URL,
    name: PRODUCT_NAME,
    alternateName: PRODUCT_LOCKUP,
    applicationCategory: "BusinessApplication",
    applicationSubCategory: "Accounting Software",
    operatingSystem: "Web Browser",
    offers: {
      "@type": "AggregateOffer",
      priceCurrency: "GBP",
      lowPrice: "0",
      highPrice: premiumPrice,
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
          price: essentialsPrice,
          priceCurrency: "GBP",
          name: essentialsName,
          description: essentialsDescription,
          billingDuration: "P1M",
        },
        {
          "@type": "UnitPriceSpecification",
          price: premiumPrice,
          priceCurrency: "GBP",
          name: premiumName,
          description: premiumDescription,
          billingDuration: "P1M",
        },
      ],
    },
    description: ONE_LINE_SUMMARY,
    featureList: FEATURE_GROUPS.flatMap((g) => g.items),
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
    publisher: { "@id": ORG_ID, "@type": "Organization", name: MAKER_LEGAL },
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
export function generatePricingSchema(amounts?: CatalogOfferAmounts | null) {
  const essentialsPrice = amounts?.essentials ?? "19";
  const premiumPrice = amounts?.premium ?? "29";
  const essentialsName = amounts?.essentialsName ?? "Essentials";
  const premiumName = amounts?.premiumName ?? "Premium";
  const essentialsDescription =
    amounts?.essentialsDescription ?? planSummary("essentials");
  const premiumDescription =
    amounts?.premiumDescription ?? planSummary("premium");

  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "Product",
        "@id": `${BASE_URL}/pricing#trial`,
        name: `${PRODUCT_NAME} Trial`,
        description: "30-day free trial with every core feature. No card required.",
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
        name: `${PRODUCT_NAME} ${essentialsName}`,
        description: essentialsDescription,
        brand: {
          "@type": "Brand",
          name: PRODUCT_NAME,
        },
        offers: {
          "@type": "Offer",
          price: essentialsPrice,
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
        name: `${PRODUCT_NAME} ${premiumName}`,
        description: premiumDescription,
        brand: {
          "@type": "Brand",
          name: PRODUCT_NAME,
        },
        offers: {
          "@type": "Offer",
          price: premiumPrice,
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
 * Must be used in server components only
 */
export function StructuredData({ data }: { data: Record<string, unknown> | Array<Record<string, unknown>> }) {
  const jsonLd = JSON.stringify(data);
  
  return (
    <script
      type="application/ld+json"
      dangerouslySetInnerHTML={{ __html: jsonLd }}
      suppressHydrationWarning
    />
  );
}
