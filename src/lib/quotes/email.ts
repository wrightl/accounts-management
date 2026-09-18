import { brand } from "@/lib/brand";
import { escapeHtml } from "@/lib/html";

export function defaultQuoteEmailMessage(params: {
  number: string;
  version: number;
  grossFormatted: string;
  companyName: string;
  publicUrl?: string | null;
}): string {
  const reference = `${params.number} (v${params.version})`;
  const linkBlock = params.publicUrl
    ? `

View and respond online:
${params.publicUrl}

You can accept or decline the quote from that page, or reply to this email.`
    : "";

  return `Hi,

Please find attached quote ${reference} for ${params.grossFormatted}.
${linkBlock}

Kind regards,
${params.companyName}`;
}

/** HTML body: editable message + Accept / Decline buttons when publicUrl set. */
export function quoteEmailHtml(params: {
  message: string;
  publicUrl?: string | null;
}): string {
  const body = escapeHtml(params.message).replace(/\n/g, "<br/>");
  if (!params.publicUrl) return body;

  const url = escapeHtml(params.publicUrl);
  const btn = (label: string) =>
    `<a href="${url}" style="display:inline-block;padding:12px 20px;border-radius:999px;background:${brand.pink};color:${brand.navy};text-decoration:none;font-weight:600;margin-right:8px">${escapeHtml(label)}</a>`;

  return `${body}<br/><br/><p style="margin:16px 0">${btn("Accept quote")}${btn("Decline")}</p><p style="color:#5c6490;font-size:13px">Or open: <a href="${url}">${url}</a></p>`;
}
