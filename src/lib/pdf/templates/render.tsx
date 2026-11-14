import "server-only";
import React from "react";
import { renderToBuffer, type Document } from "@react-pdf/renderer";
import { resolvePdfCompanyEmail } from "@/lib/pdf/company-email";
import { resolveCompanyPdfLogoSrc } from "@/lib/pdf/logo";
import { TEMPLATE_LAYOUTS } from "@/lib/pdf/templates/layouts";
import { DEFAULT_TEMPLATE_KEY, type TemplateKey } from "@/lib/pdf/templates/registry";
import {
  SAMPLE_CLIENT,
  SAMPLE_CREDIT_NOTE,
  SAMPLE_CREDIT_NOTE_DETAILS,
  SAMPLE_INVOICE,
  SAMPLE_LINES,
  SAMPLE_QUOTE,
} from "@/lib/pdf/templates/sample";
import type {
  DocumentView,
  PdfClient,
  PdfCompany,
  PdfCreditNoteDetails,
  PdfInvoice,
  PdfLine,
  PdfQuote,
} from "@/lib/pdf/templates/types";
import {
  creditNoteView,
  invoiceView,
  quoteView,
  type DocumentKind,
} from "@/lib/pdf/templates/views";

type DocumentElement = React.ReactElement<React.ComponentProps<typeof Document>>;

export async function renderElement(element: React.ReactElement): Promise<Uint8Array> {
  // Layouts render a <Document>; the cast satisfies @react-pdf's DocumentProps expectation.
  const buffer = await renderToBuffer(element as DocumentElement);
  return new Uint8Array(buffer);
}

/** Draw a prepared view in a named library template. */
export async function renderTemplatePdf(params: {
  templateKey?: TemplateKey;
  view: DocumentView;
  logoUrl: string | null | undefined;
  /** A ready-made logo to draw instead of loading `logoUrl` (sample pictures). */
  logoSrc?: string;
}): Promise<Uint8Array> {
  const Layout = TEMPLATE_LAYOUTS[params.templateKey ?? DEFAULT_TEMPLATE_KEY];
  const logoSrc = params.logoSrc ?? (await resolveCompanyPdfLogoSrc(params.logoUrl));
  return renderElement(<Layout view={params.view} logoSrc={logoSrc} />);
}

interface DocumentParams {
  client: PdfClient;
  lines: PdfLine[];
  company: PdfCompany;
  templateKey?: TemplateKey;
  logoSrc?: string;
}

export async function renderInvoiceTemplatePdf(
  params: DocumentParams & { invoice: PdfInvoice },
): Promise<Uint8Array> {
  const contactEmail = resolvePdfCompanyEmail(params.company.email);
  return renderTemplatePdf({
    templateKey: params.templateKey,
    view: invoiceView({ ...params, contactEmail }),
    logoUrl: params.company.logoUrl,
    logoSrc: params.logoSrc,
  });
}

export async function renderCreditNoteTemplatePdf(
  params: DocumentParams & {
    creditNote: {
      number: string;
      issueDate: string | null;
      netPence: number;
      vatPence: number;
      grossPence: number;
    };
    details: PdfCreditNoteDetails;
  },
): Promise<Uint8Array> {
  const contactEmail = resolvePdfCompanyEmail(params.company.email);
  return renderTemplatePdf({
    templateKey: params.templateKey,
    view: creditNoteView({ ...params, contactEmail }),
    logoUrl: params.company.logoUrl,
    logoSrc: params.logoSrc,
  });
}

export async function renderQuoteTemplatePdf(
  params: DocumentParams & { quote: PdfQuote },
): Promise<Uint8Array> {
  const contactEmail = resolvePdfCompanyEmail(params.company.email);
  return renderTemplatePdf({
    templateKey: params.templateKey,
    view: quoteView({ ...params, contactEmail }),
    logoUrl: params.company.logoUrl,
    logoSrc: params.logoSrc,
  });
}

/** A template drawn with made-up figures and the given company's details. */
export async function renderSampleTemplatePdf(params: {
  templateKey: TemplateKey;
  kind: DocumentKind;
  company: PdfCompany;
  logoSrc?: string;
}): Promise<Uint8Array> {
  const base = {
    client: SAMPLE_CLIENT,
    lines: SAMPLE_LINES,
    company: params.company,
    templateKey: params.templateKey,
    logoSrc: params.logoSrc,
  };
  if (params.kind === "credit-note") {
    return renderCreditNoteTemplatePdf({
      ...base,
      creditNote: SAMPLE_CREDIT_NOTE,
      details: SAMPLE_CREDIT_NOTE_DETAILS,
    });
  }
  if (params.kind === "quote") {
    return renderQuoteTemplatePdf({ ...base, quote: SAMPLE_QUOTE });
  }
  return renderInvoiceTemplatePdf({ ...base, invoice: SAMPLE_INVOICE });
}
