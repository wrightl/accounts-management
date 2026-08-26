import "server-only";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, quotes } from "@/db/schema";
import {
  getQuoteDetail,
  getQuoteVersionSnapshot,
} from "@/lib/quotes/queries";
import { renderQuotePdf } from "@/lib/quotes/pdf";
import { quotePdfFilename } from "@/lib/quotes/status";
import { getCompanySettings } from "@/lib/settings/queries";
import { getStorage } from "@/lib/storage";

async function renderFromSnapshot(
  companyId: string,
  quoteId: string,
  number: string,
  version: number,
) {
  const snapshot = await getQuoteVersionSnapshot(quoteId, version);
  if (!snapshot) throw new Error("Quote version not found");

  const db = getDb();
  const [client] = await db
    .select()
    .from(clients)
    .where(and(eq(clients.id, snapshot.clientId), eq(clients.companyId, companyId)))
    .limit(1);
  if (!client) throw new Error("Client not found");

  const company = await getCompanySettings(companyId);
  const filename = quotePdfFilename(number, version);
  const cachePath = `quotes/${quoteId}/${filename}`;

  try {
    const stored = await getStorage().get(cachePath);
    return { bytes: new Uint8Array(stored.body), filename };
  } catch {
    // Fall through to render.
  }

  const bytes = await renderQuotePdf({
    quote: {
      number,
      version,
      issueDate: snapshot.issueDate,
      validUntil: snapshot.validUntil,
      notes: snapshot.notes,
      grossPence: snapshot.grossPence,
    },
    client: {
      name: client.name,
      companyName: client.companyName,
      email: client.email,
      addressLines: client.addressLines,
    },
    lines: snapshot.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPricePence: l.unitPricePence,
    })),
    company,
  });

  try {
    await getStorage().put(cachePath, Buffer.from(bytes), "application/pdf");
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "quote_pdf_blob_cache_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  return { bytes, filename };
}

export async function loadOrRenderQuotePdf(
  companyId: string,
  quoteId: string,
  options?: { version?: number },
): Promise<{ bytes: Uint8Array; filename: string }> {
  const detail = await getQuoteDetail(companyId, quoteId);
  if (!detail) throw new Error("Quote not found");

  const version = options?.version ?? detail.quote.version;
  if (version !== detail.quote.version) {
    return renderFromSnapshot(companyId, quoteId, detail.quote.number, version);
  }

  const filename = quotePdfFilename(detail.quote.number, detail.quote.version);
  const cachePath = `quotes/${quoteId}/${filename}`;

  if (detail.quote.pdfBlobPath) {
    try {
      const stored = await getStorage().get(detail.quote.pdfBlobPath);
      return { bytes: new Uint8Array(stored.body), filename };
    } catch {
      // Fall through to render.
    }
  }

  const company = await getCompanySettings(companyId);
  const bytes = await renderQuotePdf({
    quote: {
      number: detail.quote.number,
      version: detail.quote.version,
      issueDate: detail.quote.issueDate,
      validUntil: detail.quote.validUntil,
      notes: detail.quote.notes,
      grossPence: detail.quote.grossPence,
    },
    client: {
      name: detail.client.name,
      companyName: detail.client.companyName,
      email: detail.client.email,
      addressLines: detail.client.addressLines,
    },
    lines: detail.lines.map((l) => ({
      description: l.description,
      quantity: l.quantity,
      unitPricePence: l.unitPricePence,
    })),
    company,
  });

  try {
    const stored = await getStorage().put(cachePath, Buffer.from(bytes), "application/pdf");
    const db = getDb();
    await db
      .update(quotes)
      .set({ pdfBlobPath: stored.path })
      .where(eq(quotes.id, quoteId));
  } catch (err) {
    console.warn(
      JSON.stringify({
        level: "warn",
        msg: "quote_pdf_blob_cache_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }

  return { bytes, filename };
}
