/**
 * Shared Clerk invitation helpers (invite flows + platform seed).
 * Uses `@clerk/backend` with an explicit secret so invites work outside
 * Next.js request context (e.g. install-time data migrations).
 */
import { createClerkClient } from "@clerk/backend";

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

/**
 * Send a Clerk invitation so the recipient can set a password on first login.
 * Returns ok when sent or when the invite/user already exists.
 */
export async function sendClerkInvitation(
  email: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  try {
    const client = getClerkClient();
    await client.invitations.createInvitation({
      emailAddress: email.trim().toLowerCase(),
      redirectUrl: inviteRedirectUrl(),
    });
    return { ok: true };
  } catch (err) {
    const message = clerkErrorMessage(err);
    if (isExistingInviteError(message)) return { ok: true };
    return { ok: false, error: message };
  }
}
