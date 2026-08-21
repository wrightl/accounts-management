import { NextResponse } from "next/server";
import { and, eq } from "drizzle-orm";
import { getDb } from "@/db";
import { invoiceLineItems, invoices, recurringInvoices } from "@/db/schema";
import { invoiceTotals } from "@/lib/money";
import { allocateInvoiceNumber } from "@/lib/invoices/allocate";
import { defaultDueDate, todayIsoDate } from "@/lib/invoices/status";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Vercel Cron: generate invoices from enabled recurring templates.
 * Behind RECURRING_INVOICES_ENABLED=true feature flag (foundation).
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (process.env.RECURRING_INVOICES_ENABLED !== "true") {
    return NextResponse.json({ ok: true, skipped: "feature flag off" });
  }
  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true, skipped: "no database" });
  }

  const db = getDb();
  const today = todayIsoDate();
  const day = Number(today.slice(8, 10));

  const templates = await db
    .select()
    .from(recurringInvoices)
    .where(
      and(eq(recurringInvoices.enabled, true), eq(recurringInvoices.dayOfMonth, day)),
    );

  let generated = 0;

  for (const tmpl of templates) {
    // Skip if already generated this month
    if (tmpl.lastGeneratedAt) {
      const last = tmpl.lastGeneratedAt.toISOString().slice(0, 7);
      if (last === today.slice(0, 7)) continue;
    }

    const lines = tmpl.lineTemplate as {
      description: string;
      quantity: number;
      unitPricePence: number;
    }[];
    if (!Array.isArray(lines) || lines.length === 0) continue;

    const totals = invoiceTotals(
      lines.map((l) => ({
        quantity: l.quantity,
        unitPricePence: l.unitPricePence,
        vatRate: 0,
      })),
    );

    await db.transaction(async (tx) => {
      const number = await allocateInvoiceNumber(tx, today);
      const [inv] = await tx
        .insert(invoices)
        .values({
          number,
          clientId: tmpl.clientId,
          status: "draft",
          issueDate: today,
          dueDate: defaultDueDate(today),
          notes: tmpl.notes,
          ...totals,
        })
        .returning({ id: invoices.id });

      await tx.insert(invoiceLineItems).values(
        lines.map((l, i) => ({
          invoiceId: inv.id,
          description: l.description,
          quantity: l.quantity,
          unitPricePence: l.unitPricePence,
          vatRate: 0,
          position: i,
        })),
      );

      await tx
        .update(recurringInvoices)
        .set({ lastGeneratedAt: new Date() })
        .where(eq(recurringInvoices.id, tmpl.id));
    });

    generated++;
  }

  console.info(
    JSON.stringify({ level: "info", msg: "cron.recurring", generated }),
  );

  return NextResponse.json({ ok: true, generated });
}
