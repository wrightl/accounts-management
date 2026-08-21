import { NextResponse } from "next/server";
import { and, eq, lt, ne } from "drizzle-orm";
import { getDb } from "@/db";
import { clients, invoices } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { formatGBP } from "@/lib/money";
import { todayIsoDate } from "@/lib/invoices/status";
import { getOrCreateCompanySettings } from "@/lib/invoices/queries";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Vercel Cron: send overdue invoice reminder emails.
 * Secured by CRON_SECRET (Authorization: Bearer …).
 */
export async function GET(request: Request) {
  const auth = request.headers.get("authorization");
  const secret = process.env.CRON_SECRET;
  if (secret && auth !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  if (!process.env.DATABASE_URL) {
    return NextResponse.json({ ok: true, skipped: "no database" });
  }

  const db = getDb();
  const today = todayIsoDate();
  const overdue = await db
    .select({
      invoice: invoices,
      clientEmail: clients.email,
      clientName: clients.name,
    })
    .from(invoices)
    .innerJoin(clients, eq(invoices.clientId, clients.id))
    .where(
      and(
        eq(invoices.status, "sent"),
        lt(invoices.dueDate, today),
        ne(invoices.status, "void"),
      ),
    );

  const company = await getOrCreateCompanySettings();
  let sent = 0;

  for (const row of overdue) {
    // Persist overdue status
    await db
      .update(invoices)
      .set({ status: "overdue" })
      .where(eq(invoices.id, row.invoice.id));

    if (!row.clientEmail) continue;

    await sendEmail({
      to: row.clientEmail,
      subject: `Reminder: invoice ${row.invoice.number} is overdue`,
      html: `<p>Hi ${row.clientName},</p><p>Invoice <strong>${row.invoice.number}</strong> for ${formatGBP(row.invoice.grossPence)} was due on ${row.invoice.dueDate} and remains unpaid.</p><p>Kind regards,<br/>${company.name}</p>`,
      text: `Invoice ${row.invoice.number} for ${formatGBP(row.invoice.grossPence)} is overdue (due ${row.invoice.dueDate}).`,
    });
    sent++;
  }

  console.info(
    JSON.stringify({ level: "info", msg: "cron.reminders", overdue: overdue.length, sent }),
  );

  return NextResponse.json({ ok: true, overdue: overdue.length, sent });
}
