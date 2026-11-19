import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { sendEmail, type EmailMessage, type EmailResult } from "@/lib/email";

/** Whether the company is a demo company, whose clients are made up. */
export async function isDemoCompany(companyId: string): Promise<boolean> {
  const [row] = await getDb()
    .select({ isDemo: companies.isDemo })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  return row?.isDemo === true;
}

/**
 * Email a company's client (an invoice, reminder, quote or credit note).
 * A demo company's clients are fictional, so nothing is sent for it: the
 * screens behave exactly as if it had been.
 */
export async function sendClientEmail(
  companyId: string,
  message: EmailMessage,
): Promise<EmailResult & { suppressed?: true }> {
  if (await isDemoCompany(companyId)) {
    console.info(
      JSON.stringify({
        level: "info",
        msg: "email.client.demo_suppressed",
        companyId,
        subject: message.subject,
      }),
    );
    return { id: null, suppressed: true };
  }
  return sendEmail(message);
}
