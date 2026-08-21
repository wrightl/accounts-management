import { NextResponse } from "next/server";
import { and, eq, gte, lte, ne } from "drizzle-orm";
import { getDb } from "@/db";
import {
  clients,
  expenseReceipts,
  expenses,
  invoices,
  payments,
} from "@/db/schema";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import { defaultReportPeriod } from "@/lib/reports/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Accountant pack: zip of CSVs for a period (invoices, payments, expenses, receipts index).
 * Uses a lightweight ZIP writer (store-only) so we avoid an extra dependency.
 */
export async function GET(request: Request) {
  try {
    await requirePermission("reports:export");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return NextResponse.json({ error: e.message }, { status: 403 });
    }
    throw e;
  }

  const url = new URL(request.url);
  const defaults = defaultReportPeriod();
  const from = url.searchParams.get("from") ?? defaults.from;
  const to = url.searchParams.get("to") ?? defaults.to;

  const db = getDb();

  const invRows = await db
    .select({
      id: invoices.id,
      number: invoices.number,
      status: invoices.status,
      issueDate: invoices.issueDate,
      dueDate: invoices.dueDate,
      netPence: invoices.netPence,
      vatPence: invoices.vatPence,
      grossPence: invoices.grossPence,
      clientName: clients.name,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(
      and(
        ne(invoices.status, "draft"),
        gte(invoices.issueDate, from),
        lte(invoices.issueDate, to),
      ),
    );

  const payRows = await db
    .select({
      id: payments.id,
      invoiceId: payments.invoiceId,
      amountPence: payments.amountPence,
      method: payments.method,
      reference: payments.reference,
      receivedAt: payments.receivedAt,
    })
    .from(payments)
    .innerJoin(invoices, eq(payments.invoiceId, invoices.id))
    .where(and(gte(invoices.issueDate, from), lte(invoices.issueDate, to)));

  const expRows = await db
    .select()
    .from(expenses)
    .where(and(gte(expenses.spentAt, from), lte(expenses.spentAt, to)));

  const receiptRows =
    expRows.length === 0
      ? []
      : await db.select().from(expenseReceipts);

  const invoicesCsv = toCsv(
    ["id", "number", "client", "status", "issue_date", "due_date", "net_gbp", "vat_gbp", "gross_gbp"],
    invRows.map((r) => [
      r.id,
      r.number,
      r.clientName,
      r.status,
      r.issueDate ?? "",
      r.dueDate ?? "",
      gbp(r.netPence),
      gbp(r.vatPence),
      gbp(r.grossPence),
    ]),
  );

  const paymentsCsv = toCsv(
    ["id", "invoice_id", "amount_gbp", "method", "reference", "received_at"],
    payRows.map((r) => [
      r.id,
      r.invoiceId,
      gbp(r.amountPence),
      r.method ?? "",
      r.reference ?? "",
      r.receivedAt.toISOString(),
    ]),
  );

  const expensesCsv = toCsv(
    ["id", "description", "category", "spent_at", "amount_gbp", "status", "billable"],
    expRows.map((r) => [
      r.id,
      r.description,
      r.category ?? "",
      r.spentAt ?? "",
      gbp(r.amountPence),
      r.status,
      r.billable ? "yes" : "no",
    ]),
  );

  const expenseIds = new Set(expRows.map((e) => e.id));
  const receiptsCsv = toCsv(
    ["id", "expense_id", "filename", "content_type", "size_bytes", "uploaded_at"],
    receiptRows
      .filter((r) => expenseIds.has(r.expenseId))
      .map((r) => [
        r.id,
        r.expenseId,
        r.filename,
        r.contentType ?? "",
        String(r.sizeBytes ?? ""),
        r.uploadedAt.toISOString(),
      ]),
  );

  const files: Record<string, string> = {
    "invoices.csv": invoicesCsv,
    "payments.csv": paymentsCsv,
    "expenses.csv": expensesCsv,
    "receipts-index.csv": receiptsCsv,
    "README.txt": `Dot + Dash accountant pack\nPeriod: ${from} to ${to}\nGenerated: ${new Date().toISOString()}\n`,
  };

  const zip = buildStoreZip(files);
  return new NextResponse(Buffer.from(zip), {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="accountant-pack-${from}_${to}.zip"`,
      "Cache-Control": "private, no-store",
    },
  });
}

function gbp(pence: number) {
  return (pence / 100).toFixed(2);
}

function toCsv(headers: string[], rows: string[][]) {
  const esc = (v: string) =>
    /[",\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : v;
  return [headers.join(","), ...rows.map((r) => r.map(esc).join(","))].join("\n");
}

/** Minimal ZIP (store method, no compression) for small CSV packs. */
function buildStoreZip(files: Record<string, string>): Uint8Array {
  const encoder = new TextEncoder();
  const parts: Uint8Array[] = [];
  const central: Uint8Array[] = [];
  let offset = 0;

  for (const [name, content] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const data = encoder.encode(content);
    const crc = crc32(data);
    const local = new Uint8Array(30 + nameBytes.length);
    const view = new DataView(local.buffer);
    view.setUint32(0, 0x04034b50, true);
    view.setUint16(8, 0, true); // method store
    view.setUint32(14, crc, true);
    view.setUint32(18, data.length, true);
    view.setUint32(22, data.length, true);
    view.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    parts.push(local, data);

    const cen = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(cen.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(10, 0, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, data.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    cen.set(nameBytes, 46);
    central.push(cen);

    offset += local.length + data.length;
  }

  const centralSize = central.reduce((a, c) => a + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, central.length, true);
  ev.setUint16(10, central.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);

  const total =
    parts.reduce((a, p) => a + p.length, 0) + centralSize + end.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  for (const c of central) {
    out.set(c, o);
    o += c.length;
  }
  out.set(end, o);
  return out;
}

function crc32(buf: Uint8Array): number {
  let c = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    c ^= buf[i];
    for (let k = 0; k < 8; k++) {
      c = c & 1 ? (c >>> 1) ^ 0xedb88320 : c >>> 1;
    }
  }
  return (c ^ 0xffffffff) >>> 0;
}
