import type { NextRequest } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { appBaseUrl } from "@/lib/billing/stripe";
import { reportError } from "@/lib/errors/report";
import { hmrcConnectEnabled } from "@/lib/hmrc/config";
import { completeHmrcConnect, HmrcConnectError } from "@/lib/hmrc/connections";
import { HmrcOAuthError } from "@/lib/hmrc/oauth";
import { can } from "@/lib/roles";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/** Back to the HMRC settings page with an outcome the page explains. */
function backToSettings(outcome: "connected" | "denied" | "expired" | "failed" | "forbidden" | "unavailable") {
  return Response.redirect(`${appBaseUrl()}/settings/hmrc?hmrc=${outcome}`, 303);
}

/**
 * HMRC sends the admin back here after they grant (or refuse) Alfa access.
 * The admin must still be signed in as the person who started, in the same
 * company; the state ties the two together and can only be used once.
 */
export async function GET(request: NextRequest) {
  if (!hmrcConnectEnabled()) return backToSettings("unavailable");

  const user = await getCurrentUser();
  if (!user) return Response.redirect(`${appBaseUrl()}/sign-in`, 303);
  if (!user.companyId || !user.localUserId || !can(user.role, "tax:connect")) return backToSettings("forbidden");

  const params = request.nextUrl.searchParams;
  // HMRC sends error=access_denied when the admin chooses not to grant access.
  if (params.get("error")) return backToSettings("denied");
  const code = params.get("code");
  const state = params.get("state");
  if (!code || !state) return backToSettings("failed");

  try {
    await completeHmrcConnect({ companyId: user.companyId, userId: user.localUserId, state, code });
    return backToSettings("connected");
  } catch (e) {
    if (e instanceof HmrcConnectError) return backToSettings("expired");
    await reportError({
      source: "hmrc.callback",
      error: e,
      companyId: user.companyId,
      actorUserId: user.localUserId,
      meta: e instanceof HmrcOAuthError ? { status: e.status, code: e.code } : undefined,
    });
    return backToSettings("failed");
  }
}
