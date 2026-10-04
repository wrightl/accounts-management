import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { users } from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { clientEnv, serverEnv } from "@/env";
import { PRODUCT_LOCKUP } from "@/lib/product";

export async function sendNotificationEmail(opts: {
  userId: string;
  companyId: string;
  title: string;
  body: string;
  href?: string | null;
}): Promise<void> {
  const db = getDb();
  const [user] = await db
    .select({ email: users.email, name: users.name })
    .from(users)
    .where(eq(users.id, opts.userId))
    .limit(1);
  if (!user?.email) return;

  const base =
    clientEnv.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ??
    "http://localhost:3001";
  const link = opts.href
    ? opts.href.startsWith("http")
      ? opts.href
      : `${base}${opts.href.startsWith("/") ? "" : "/"}${opts.href}`
    : `${base}/inbox`;

  const greeting = user.name?.trim()
    ? `Hi ${user.name.trim().split(/\s+/)[0]},`
    : "Hi,";

  const text = [
    greeting,
    "",
    opts.title,
    opts.body,
    "",
    `Open in ${PRODUCT_LOCKUP}: ${link}`,
  ].join("\n");

  const html = `
    <p>${escapeHtml(greeting)}</p>
    <p><strong>${escapeHtml(opts.title)}</strong></p>
    <p>${escapeHtml(opts.body)}</p>
    <p><a href="${escapeHtml(link)}">View in ${escapeHtml(PRODUCT_LOCKUP)}</a></p>
  `.trim();

  await sendEmail({
    to: user.email,
    subject: opts.title,
    html,
    text,
    from: serverEnv().EMAIL_FROM,
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}
