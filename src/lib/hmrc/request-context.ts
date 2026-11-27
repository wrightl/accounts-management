import "server-only";
import { createHash } from "node:crypto";
import os from "node:os";
import { auth } from "@clerk/nextjs/server";
import { cookies, headers } from "next/headers";
import { safeCurrentUser } from "@/lib/auth";
import {
  CLIENT_DETAILS_COOKIE,
  DEVICE_ID_COOKIE,
  MOBILE_DEVICE_HEADER,
} from "@/lib/hmrc/device-cookies";
import {
  type BatchCallContext,
  type ClientCallContext,
  type MultiFactor,
  clientIpFromForwardedFor,
  deviceIdSchema,
  mobileClientDetailsSchema,
  parseClientDetails,
  webClientDetailsSchema,
} from "@/lib/hmrc/fraud-headers";

function sha256(value: string): string {
  return createHash("sha256").update(value).digest("hex");
}

/**
 * The second factor the person used when they signed in, from Clerk. Clerk
 * gives how many minutes ago it was verified; a negative age means none was.
 */
async function multiFactorFromClerk(now: Date): Promise<MultiFactor[]> {
  const session = await auth();
  const secondFactorAge = session.factorVerificationAge?.[1] ?? -1;
  if (!session.userId || secondFactorAge < 0) return [];
  const clerkUser = await safeCurrentUser();
  const type: MultiFactor["type"] = clerkUser?.totpEnabled
    ? "TOTP"
    : clerkUser?.twoFactorEnabled
      ? "AUTH_CODE"
      : "OTHER";
  return [
    {
      type,
      verifiedAt: new Date(now.getTime() - secondFactorAge * 60_000),
      uniqueReference: sha256(`alfa-mfa:${session.userId}:${type}`),
    },
  ];
}

function decodeBase64UrlJson(value: string | null): string | null {
  if (!value) return null;
  try {
    return Buffer.from(value, "base64url").toString("utf8");
  } catch {
    return null;
  }
}

/**
 * Fraud prevention details for an HMRC call made while handling a person's
 * request: the mobile app's header when present, otherwise the web page's
 * cookies. Details that are missing are left out rather than invented.
 */
export async function hmrcClientContext(
  userId: string | null,
  now: Date = new Date(),
): Promise<ClientCallContext> {
  const headerList = await headers();
  const publicIp =
    clientIpFromForwardedFor(headerList.get("x-forwarded-for")) ??
    clientIpFromForwardedFor(headerList.get("x-real-ip"));
  const multiFactor = await multiFactorFromClerk(now);
  // Vercel doesn't pass on the port the client connected from, so
  // Gov-Client-Public-Port can't be sent. HMRC asks vendors in that position
  // to tell them why (docs/SETUP.md, section 5c).
  const base = { userId, publicIp, publicPort: null, publicIpAt: now, multiFactor };

  const mobile = parseClientDetails(
    mobileClientDetailsSchema,
    decodeBase64UrlJson(headerList.get(MOBILE_DEVICE_HEADER)),
  );
  if (mobile) {
    return { ...base, method: "MOBILE_APP_VIA_SERVER", deviceId: mobile.deviceId, mobile };
  }

  const jar = await cookies();
  const deviceId = deviceIdSchema.safeParse(jar.get(DEVICE_ID_COOKIE)?.value);
  const web = parseClientDetails(webClientDetailsSchema, jar.get(CLIENT_DETAILS_COOKIE)?.value);
  if (!web) {
    console.warn(JSON.stringify({ level: "warn", msg: "hmrc.client_details_missing" }));
  }
  return {
    ...base,
    method: "WEB_APP_VIA_SERVER",
    deviceId: deviceId.success ? deviceId.data : null,
    web,
  };
}

/** The operating system user running this process. */
function osUserName(): string {
  try {
    const name = os.userInfo().username;
    if (name) return name;
  } catch {
    // No passwd entry for the process's user, as on some serverless hosts.
  }
  return `uid-${process.getuid?.() ?? "unknown"}`;
}

/** A UUID-shaped ID that stays the same for this deployment. */
function stableServerDeviceId(): string {
  const seed = process.env.VERCEL_PROJECT_ID ?? os.hostname();
  const h = sha256(`alfa-batch-device:${seed}`);
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-a${h.slice(17, 20)}-${h.slice(20, 32)}`;
}

/**
 * Fraud prevention details for a call Alfa makes on its own, such as a cron
 * job. HMRC requires the operating system user, which is sent with the
 * company and, when the job acts for one, the person.
 */
export function hmrcBatchContext(
  { userId, companyId }: { userId: string | null; companyId: string },
  now: Date = new Date(),
): BatchCallContext {
  const interfaces = Object.values(os.networkInterfaces())
    .flat()
    .filter((i) => i && !i.internal);
  const localIps = [...new Set(interfaces.map((i) => i!.address))];
  const macAddresses = [
    ...new Set(interfaces.map((i) => i!.mac).filter((m) => m && m !== "00:00:00:00:00:00")),
  ];
  return {
    method: "BATCH_PROCESS_DIRECT",
    userId,
    companyId,
    osUser: osUserName(),
    deviceId: stableServerDeviceId(),
    localIps,
    localIpsAt: now,
    macAddresses,
    utcOffsetMinutes: -now.getTimezoneOffset(),
    osFamily: os.type(),
    osVersion: os.release(),
    deviceManufacturer: null,
    deviceModel: os.machine(),
  };
}
