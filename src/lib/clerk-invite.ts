/**
 * Shared Clerk invitation helpers (invite flows + platform seed).
 * Uses `@clerk/backend` with an explicit secret so invites work outside
 * Next.js request context (e.g. install-time data migrations).
 */
import { createClerkClient } from "@clerk/backend";
import type { InviteContext } from "@/lib/invite-email";

export function inviteRedirectUrl(): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL?.replace(/\/$/, "") ||
    "http://localhost:3001";
  return `${base}/sign-up`;
}

export function clerkErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (err as { errors?: { message?: string }[] }).errors;
    const msg = errors?.[0]?.message;
    if (msg) return msg;
  }
  if (err instanceof Error) {
    if (err.message === "fetch failed") {
      return "Could not reach Clerk. Check your connection and try again.";
    }
    return err.message;
  }
  return "Clerk request failed";
}

export function isExistingInviteError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("already") || lower.includes("exists");
}

function getClerkClient() {
  const secretKey = process.env.CLERK_SECRET_KEY;
  if (!secretKey) {
    throw new Error(
      "Missing Clerk Secret Key. Go to https://dashboard.clerk.com and get your key for your instance.",
    );
  }
  return createClerkClient({ secretKey });
}

export const INVITE_EXPIRES_IN_DAYS = 7;

/**
 * App URL that signs the invitee up with the invitation ticket. Clerk's
 * `<SignUp />` reads `__clerk_ticket` from the URL, so the email can link to
 * our own domain instead of Clerk's Frontend API accept endpoint.
 */
export function inviteAcceptUrl(clerkInvitationUrl: string | undefined): string | null {
  if (!clerkInvitationUrl) return null;
  const ticket = new URL(clerkInvitationUrl).searchParams.get("ticket");
  if (!ticket) return null;
  return `${inviteRedirectUrl()}?__clerk_ticket=${encodeURIComponent(ticket)}`;
}

type InviteEmailModule = typeof import("@/lib/invite-email");

/**
 * The invite email module is server-only (it uses the app's email provider).
 * Outside the Next.js runtime, e.g. install-time data migrations run by tsx,
 * the import throws and we fall back to Clerk's own invitation email.
 */
async function loadInviteEmail(): Promise<InviteEmailModule | null> {
  try {
    return await import("@/lib/invite-email");
  } catch {
    return null;
  }
}

/**
 * Create a Clerk invitation and email it so the recipient can set a password
 * on first login. Returns ok when sent or when the invite/user already exists.
 */
export async function sendClerkInvitation(
  email: string,
  context?: InviteContext,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const emailAddress = email.trim().toLowerCase();
  const inviteEmail = await loadInviteEmail();
  try {
    const client = getClerkClient();
    const invitation = await client.invitations.createInvitation({
      emailAddress,
      redirectUrl: inviteRedirectUrl(),
      expiresInDays: INVITE_EXPIRES_IN_DAYS,
      notify: inviteEmail === null,
    });
    if (!inviteEmail) return { ok: true };

    const acceptUrl = inviteAcceptUrl(invitation.url);
    try {
      if (!acceptUrl) throw new Error("Clerk did not return an invitation link");
      await inviteEmail.sendInviteEmail({
        to: emailAddress,
        acceptUrl,
        expiresInDays: INVITE_EXPIRES_IN_DAYS,
        context,
      });
    } catch (sendErr) {
      // Revoke so a retry creates a fresh invite instead of hitting "already invited".
      await client.invitations.revokeInvitation(invitation.id).catch(() => undefined);
      const reason = sendErr instanceof Error ? sendErr.message : "unknown error";
      return { ok: false, error: `Could not send the invitation email: ${reason}` };
    }
    return { ok: true };
  } catch (err) {
    const message = clerkErrorMessage(err);
    if (isExistingInviteError(message)) return { ok: true };
    return { ok: false, error: message };
  }
}
