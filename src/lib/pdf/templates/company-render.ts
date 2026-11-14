import "server-only";
import type { Company } from "@/db/schema";
import { renderCreditNotePdf } from "@/lib/invoices/pdf-v2";
import { resolvePdfCompanyEmail } from "@/lib/pdf/company-email";
import {
  creditNoteDesignData,
  invoiceDesignData,
  quoteDesignData,
} from "@/lib/pdf/designer/fields";
import { renderDesignPdf } from "@/lib/pdf/designer/render";
import { renderInvoiceTemplatePdf } from "@/lib/pdf/templates/render";
import { getCompanyTemplate } from "@/lib/pdf/templates/resolve";
import type { PdfClient, PdfInvoice, PdfLine, PdfQuote } from "@/lib/pdf/templates/types";
import { renderQuotePdf } from "@/lib/quotes/pdf";

/*
 * A document drawn in whatever the company has chosen for that kind: its own
 * design from the template designer, or else a library template.
 */

function parties(company: Company, client: PdfClient, lines: PdfLine[]) {
  return { company, client, lines, contactEmail: resolvePdfCompanyEmail(company.email) };
}

export async function renderCompanyInvoicePdf(
  company: Company,
  params: { invoice: PdfInvoice; client: PdfClient; lines: PdfLine[] },
): Promise<Uint8Array> {
  const template = await getCompanyTemplate(company, "invoice");
  // A record of an invoice issued elsewhere keeps the library layout, which marks it as one.
  if (template.design && params.invoice.source !== "import") {
    return renderDesignPdf({
      companyId: company.id,
      design: template.design,
      data: invoiceDesignData(params.invoice, parties(company, params.client, params.lines)),
    });
  }
  return renderInvoiceTemplatePdf({ ...params, company, templateKey: template.key });
}

export async function renderCompanyCreditNotePdf(
  company: Company,
  params: {
    creditNote: {
      number: string;
      issueDate: string;
      netPence: number;
      vatPence: number;
      grossPence: number;
      reason: string;
    };
    invoiceNumber: string;
    client: PdfClient;
    lines: PdfLine[];
  },
): Promise<Uint8Array> {
  const template = await getCompanyTemplate(company, "credit-note");
  if (template.design) {
    return renderDesignPdf({
      companyId: company.id,
      design: template.design,
      data: creditNoteDesignData(
        params.creditNote,
        { invoiceNumber: params.invoiceNumber, reason: params.creditNote.reason },
        parties(company, params.client, params.lines),
      ),
    });
  }
  return renderCreditNotePdf({ ...params, company, templateKey: template.key });
}

export async function renderCompanyQuotePdf(
  company: Company,
  params: { quote: PdfQuote; client: PdfClient; lines: PdfLine[] },
): Promise<Uint8Array> {
  const template = await getCompanyTemplate(company, "quote");
  if (template.design) {
    return renderDesignPdf({
      companyId: company.id,
      design: template.design,
      data: quoteDesignData(params.quote, parties(company, params.client, params.lines)),
    });
  }
  return renderQuotePdf({ ...params, company, templateKey: template.key });
}
