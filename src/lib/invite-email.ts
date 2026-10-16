import "server-only";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies, users } from "@/db/schema";
import { getEmailProvider, sendEmail } from "@/lib/email";
import { escapeHtml } from "@/lib/html";
import { PRODUCT_LOCKUP, PRODUCT_NAME, PRODUCT_TAGLINE } from "@/lib/product";

/**
 * Invitation email sent through our own provider (Resend) instead of Clerk's
 * built-in mailer, so it goes out from our warmed domain with a link to the
 * app rather than Clerk's Frontend API.
 */

export interface InviteContext {
  /** Company the invitee is joining; omitted for platform operator invites. */
  companyId?: string | null;
  /** Local user who sent the invite. */
  invitedByUserId?: string | null;
}

interface InviteDetails {
  companyName: string | null;
  inviterName: string | null;
  inviterEmail: string | null;
}

async function resolveInviteDetails(context: InviteContext): Promise<InviteDetails> {
  const db = getDb();
  const [company] = context.companyId
    ? await db
        .select({ name: companies.name })
        .from(companies)
        .where(eq(companies.id, context.companyId))
        .limit(1)
    : [];
  const [inviter] = context.invitedByUserId
    ? await db
        .select({ name: users.name, email: users.email })
        .from(users)
        .where(eq(users.id, context.invitedByUserId))
        .limit(1)
    : [];
  return {
    companyName: company?.name ?? null,
    inviterName: inviter?.name ?? null,
    inviterEmail: inviter?.email ?? null,
  };
}

export function buildInviteEmail(params: {
  acceptUrl: string;
  expiresInDays: number;
  companyName: string | null;
  inviterName: string | null;
}): { subject: string; html: string; text: string } {
  const { acceptUrl, expiresInDays, companyName, inviterName } = params;
  const target = companyName ? `${companyName} on ${PRODUCT_NAME}` : PRODUCT_NAME;
  const subject = inviterName
    ? `${inviterName} invited you to ${target}`
    : `You're invited to ${target}`;
  const lead = inviterName
    ? `${inviterName} has invited you to join ${target}`
    : `You've been invited to join ${target}`;
  const expiry = `This invitation expires in ${expiresInDays} ${expiresInDays === 1 ? "day" : "days"}.`;
  const about = `${PRODUCT_NAME} is ${PRODUCT_TAGLINE}: quotes, invoices, expenses and bank matching in one place.`;
  const ignore =
    "If you weren't expecting this invitation, you can ignore this email and no account will be created.";

  const url = escapeHtml(acceptUrl);
  const html = `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a;line-height:1.5">
  <h1 style="font-size:20px;font-weight:600">${escapeHtml(lead)}</h1>
  <p>${escapeHtml(about)}</p>
  <p>Accept the invitation to create your account and set a password.</p>
  <p style="margin-top:24px"><a href="${url}" style="display:inline-block;background:#0f766e;color:#ffffff;padding:10px 18px;border-radius:999px;text-decoration:none">Accept invitation</a></p>
  <p>Or copy this link into your browser:<br/><a href="${url}" style="color:#0f766e;word-break:break-all">${url}</a></p>
  <p>${escapeHtml(expiry)} ${escapeHtml(ignore)}</p>
  <p style="margin-top:24px;font-size:12px;color:#4a4a4a">${escapeHtml(PRODUCT_LOCKUP)} · dotanddashconsulting.com</p>
</div>`;

  const text = [
    `${lead}.`,
    "",
    about,
    "",
    "Accept the invitation to create your account and set a password:",
    acceptUrl,
    "",
    `${expiry} ${ignore}`,
    "",
    `${PRODUCT_LOCKUP} · dotanddashconsulting.com`,
  ].join("\n");

  return { subject, html, text };
}

export async function sendInviteEmail(params: {
  to: string;
  acceptUrl: string;
  expiresInDays: number;
  context?: InviteContext;
}): Promise<void> {
  const details = await resolveInviteDetails(params.context ?? {});
  const message = buildInviteEmail({
    acceptUrl: params.acceptUrl,
    expiresInDays: params.expiresInDays,
    companyName: details.companyName,
    inviterName: details.inviterName,
  });
  if (getEmailProvider().name === "console") {
    console.info(`[invite] accept link for ${params.to}: ${params.acceptUrl}`);
  }
  await sendEmail({
    to: params.to,
    ...message,
    ...(details.inviterEmail ? { replyTo: details.inviterEmail } : {}),
  });
}
