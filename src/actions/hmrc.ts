"use server";

import { mutate, mutateWide } from "@/lib/mutate";
import { hmrcConnectEnabled, HmrcNotConfiguredError } from "@/lib/hmrc/config";
import { disconnectHmrc, startHmrcConnect } from "@/lib/hmrc/connections";

/**
 * Begin connecting the company to HMRC. Returns the HMRC address to send the
 * admin to; the browser goes there and HMRC sends them back to
 * /api/hmrc/callback.
 */
export async function connectHmrc(): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  return mutateWide("tax:connect", async ({ companyId, localUserId }) => {
    if (!hmrcConnectEnabled()) return { ok: false, error: new HmrcNotConfiguredError().message };
    const url = await startHmrcConnect({ companyId, userId: localUserId });
    return { ok: true, url };
  });
}

/** Forget the company's HMRC tokens. */
export async function disconnectHmrcAction() {
  return mutate(
    "tax:connect",
    async ({ companyId, localUserId }) => {
      const done = await disconnectHmrc({ companyId, userId: localUserId });
      return done ? { ok: true } : { ok: false, error: "This company isn't connected to HMRC." };
    },
    { paths: ["/settings/hmrc"] },
  );
}
