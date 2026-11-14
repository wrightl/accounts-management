import "server-only";
import {
  renderCreditNoteTemplatePdf,
  renderInvoiceTemplatePdf,
} from "@/lib/pdf/templates/render";
import type { TemplateKey } from "@/lib/pdf/templates/registry";
import type {
  PdfClient,
  PdfCompany,
  PdfInvoice,
  PdfLine,
} from "@/lib/pdf/templates/types";

export type { PdfCreditNoteDetails } from "@/lib/pdf/templates/types";

/** Invoice PDF in a library template (the default when none is given). */
export async function renderInvoicePdfV2(params: {
  invoice: PdfInvoice;
  client: PdfClient;
  lines: PdfLine[];
  company: PdfCompany;
  templateKey?: TemplateKey;
}): Promise<Uint8Array> {
  return renderInvoiceTemplatePdf(params);
}

/** Credit note PDF: the same template as the invoice, with credit wording and the reason. */
export async function renderCreditNotePdf(params: {
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
  company: PdfCompany;
  templateKey?: TemplateKey;
}): Promise<Uint8Array> {
  return renderCreditNoteTemplatePdf({
    creditNote: params.creditNote,
    details: { invoiceNumber: params.invoiceNumber, reason: params.creditNote.reason },
    client: params.client,
    lines: params.lines,
    company: params.company,
    templateKey: params.templateKey,
  });
}
