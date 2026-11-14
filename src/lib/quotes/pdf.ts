import "server-only";
import { renderQuoteTemplatePdf } from "@/lib/pdf/templates/render";
import type { TemplateKey } from "@/lib/pdf/templates/registry";
import type { PdfClient, PdfCompany, PdfLine, PdfQuote } from "@/lib/pdf/templates/types";

export type { PdfQuote };

/** Quote PDF in a library template (the default when none is given). */
export async function renderQuotePdf(params: {
  quote: PdfQuote;
  client: PdfClient;
  lines: PdfLine[];
  company: PdfCompany;
  templateKey?: TemplateKey;
}): Promise<Uint8Array> {
  return renderQuoteTemplatePdf(params);
}
