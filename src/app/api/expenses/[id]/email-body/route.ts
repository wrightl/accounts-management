import { NextResponse } from "next/server";
import { unframeableJsonError } from "@/lib/frameable-route";
import { requirePermission, ForbiddenError } from "@/lib/auth";
import { getExpenseEmailBody } from "@/lib/expenses/inbound-email";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * The HTML is the sender's, unsanitised, so it is never trusted: `sandbox`
 * stops scripts, forms and navigation, and `default-src 'none'` blocks remote
 * images and requests (tracking pixels). Inline images arrive as data: URIs.
 * Only our own pages may frame it.
 */
const EMAIL_BODY_CSP = [
  "sandbox",
  "default-src 'none'",
  "img-src data:",
  "style-src 'unsafe-inline'",
  "font-src data:",
  "frame-ancestors 'self'",
].join("; ");

/** The body of the email an expense came from, exactly as it was sent. */
export async function GET(
  request: Request,
  context: { params: Promise<{ id: string }> },
) {
  let user;
  try {
    user = await requirePermission("accounts:read");
  } catch (e) {
    if (e instanceof ForbiddenError) {
      return unframeableJsonError(e.message, 403);
    }
    throw e;
  }
  if (!user.companyId) {
    return unframeableJsonError("Complete onboarding first", 403);
  }

  const { id } = await context.params;
  const body = await getExpenseEmailBody(user.companyId, id);
  const wantText = new URL(request.url).searchParams.get("format") === "text";
  const html = wantText && body?.text != null ? null : (body?.html ?? null);
  const text = body?.text ?? null;

  if (html == null && text == null) {
    return unframeableJsonError("Not found", 404);
  }

  return new NextResponse(html ?? text, {
    status: 200,
    headers: {
      "Content-Type": html != null ? "text/html; charset=utf-8" : "text/plain; charset=utf-8",
      "Content-Security-Policy": EMAIL_BODY_CSP,
      "X-Frame-Options": "SAMEORIGIN",
      "Cache-Control": "private, no-store",
    },
  });
}
