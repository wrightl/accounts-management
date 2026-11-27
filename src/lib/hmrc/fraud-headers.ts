import { z } from "zod";

/**
 * HMRC's fraud prevention headers (roadmap item 17, PR 6). Every call to a
 * Making Tax Digital API must say how it reached HMRC and carry details of
 * the person's device and network. This module is pure: it validates the
 * details the browser or app sent and turns them into headers. Reading the
 * request, cookies and Clerk session happens in request-context.ts.
 *
 * Values follow HMRC's spec: key=value pairs joined with "&", lists joined
 * with ",", and every key and value percent-encoded.
 */

export type HmrcConnectionMethod =
  | "WEB_APP_VIA_SERVER"
  | "MOBILE_APP_VIA_SERVER"
  | "BATCH_PROCESS_DIRECT";

const dimension = z.number().int().min(1).max(100_000);

const screenSchema = z.object({
  width: dimension,
  height: dimension,
  scalingFactor: z.number().positive().max(20),
  colourDepth: z.number().int().min(1).max(64),
});

const windowSchema = z.object({ width: dimension, height: dimension });

/** Minutes east of UTC, so UTC+01:00 is 60 (the opposite sign to getTimezoneOffset). */
const utcOffsetSchema = z.number().int().min(-14 * 60).max(14 * 60);

const deviceIdSchema = z.string().uuid();

const ipSchema = z.union([z.ipv4(), z.ipv6()]);

/**
 * The device's local IP addresses. One the server can't read as an address
 * is dropped rather than refusing the whole header.
 */
const localIpsSchema = z
  .array(z.string().max(64))
  .max(16)
  .transform((ips) => ips.filter((ip) => ipSchema.safeParse(ip).success));

/** What the web page's script stores in the client details cookie. */
export const webClientDetailsSchema = z.object({
  screens: z.array(screenSchema).min(1).max(8),
  window: windowSchema,
  utcOffsetMinutes: utcOffsetSchema,
  userAgent: z.string().min(1).max(1024),
});
export type WebClientDetails = z.infer<typeof webClientDetailsSchema>;

/** What the mobile app sends in the X-Alfa-Device header. */
export const mobileClientDetailsSchema = z.object({
  deviceId: deviceIdSchema,
  screens: z.array(screenSchema).min(1).max(8),
  window: windowSchema,
  utcOffsetMinutes: utcOffsetSchema,
  osFamily: z.string().min(1).max(64),
  osVersion: z.string().min(1).max(256),
  deviceManufacturer: z.string().max(128).optional(),
  deviceModel: z.string().max(128).optional(),
  localIps: localIpsSchema.optional(),
  /** When the app read its local IPs, e.g. 2026-11-27T21:00:00.123Z. */
  localIpsAt: z.iso.datetime().optional(),
  /** The app's version and build number, e.g. 1.0.0+4. */
  appVersion: z.string().min(1).max(64).optional(),
});
export type MobileClientDetails = z.infer<typeof mobileClientDetailsSchema>;

export { deviceIdSchema };

export interface MultiFactor {
  type: "TOTP" | "AUTH_CODE" | "OTHER";
  verifiedAt: Date;
  /** A hashed identifier for the factor, the same each time it is used. */
  uniqueReference: string;
}

export interface VendorDetails {
  productName: string;
  version: string;
  /** Alfa's public IP address, when known. */
  publicIp: string | null;
  /** Hashed licence keys; Alfa has none, so this is usually empty. */
  licenseIds: Record<string, string>;
}

/** A call made because a person used the web app or the mobile app. */
export interface ClientCallContext {
  method: "WEB_APP_VIA_SERVER" | "MOBILE_APP_VIA_SERVER";
  /** Alfa's users.id for the person, or null when unknown. */
  userId: string | null;
  deviceId: string | null;
  /** Null when the browser hasn't sent its details yet. */
  web?: WebClientDetails | null;
  mobile?: MobileClientDetails | null;
  publicIp: string | null;
  publicPort: number | null;
  /** When the server read the client's IP address. */
  publicIpAt: Date;
  multiFactor: MultiFactor[];
}

/** A call Alfa makes on its own, such as a scheduled job. */
export interface BatchCallContext {
  method: "BATCH_PROCESS_DIRECT";
  /** The person the job acts for, when there is one. */
  userId: string | null;
  /** The company the job acts for. HMRC requires a user ID, so this is always sent. */
  companyId: string;
  deviceId: string;
  localIps: string[];
  localIpsAt: Date;
  macAddresses: string[];
  utcOffsetMinutes: number;
  osFamily: string;
  osVersion: string;
  deviceManufacturer: string | null;
  deviceModel: string | null;
}

export type HmrcFraudContext = ClientCallContext | BatchCallContext;

const enc = encodeURIComponent;

function pairs(entries: Array<[string, string | number | null | undefined]>): string {
  return entries
    .filter((e): e is [string, string | number] => e[1] !== null && e[1] !== undefined && e[1] !== "")
    .map(([k, v]) => `${enc(k)}=${enc(String(v))}`)
    .join("&");
}

/** "UTC+01:00" from minutes east of UTC. */
export function formatUtcOffset(minutesEast: number): string {
  const sign = minutesEast < 0 ? "-" : "+";
  const abs = Math.abs(minutesEast);
  const hh = String(Math.floor(abs / 60)).padStart(2, "0");
  const mm = String(abs % 60).padStart(2, "0");
  return `UTC${sign}${hh}:${mm}`;
}

function formatScreens(screens: WebClientDetails["screens"]): string {
  return screens
    .map((s) =>
      pairs([
        ["width", s.width],
        ["height", s.height],
        ["scaling-factor", s.scalingFactor],
        ["colour-depth", s.colourDepth],
      ]),
    )
    .join(",");
}

function formatWindow(w: WebClientDetails["window"]): string {
  return pairs([
    ["width", w.width],
    ["height", w.height],
  ]);
}

/** Multi-factor timestamps are to the minute: 2017-04-21T13:23Z. */
function formatMultiFactor(factors: MultiFactor[]): string {
  return factors
    .map((f) =>
      pairs([
        ["type", f.type],
        ["timestamp", `${f.verifiedAt.toISOString().slice(0, 16)}Z`],
        ["unique-reference", f.uniqueReference],
      ]),
    )
    .join(",");
}

function formatUserIds(userId: string | null, companyId?: string): string {
  return pairs([
    ["alfa", userId],
    ["alfa-company", companyId],
  ]);
}

/** HMRC's timestamp format: 2026-11-27T21:00:00.123Z. */
function formatTimestamp(value: string): string | null {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function formatUserAgent(parts: {
  osFamily: string;
  osVersion: string;
  deviceManufacturer?: string | null;
  deviceModel?: string | null;
}): string {
  return pairs([
    ["os-family", parts.osFamily],
    ["os-version", parts.osVersion],
    ["device-manufacturer", parts.deviceManufacturer],
    ["device-model", parts.deviceModel],
  ]);
}

/**
 * The vendor headers. With a client app version (the mobile app), HMRC asks
 * for the client's version and the server's, as two named entries.
 */
function vendorHeaders(vendor: VendorDetails, clientVersion?: string | null): Record<string, string> {
  const licence = Object.entries(vendor.licenseIds)
    .map(([k, v]) => `${enc(k)}=${enc(v)}`)
    .join("&");
  const versions: Array<[string, string]> = clientVersion
    ? [
        [`${vendor.productName} mobile`, clientVersion],
        [`${vendor.productName} server`, vendor.version],
      ]
    : [[vendor.productName, vendor.version]];
  return {
    "Gov-Vendor-Product-Name": enc(vendor.productName),
    "Gov-Vendor-Version": pairs(versions),
    "Gov-Vendor-License-IDs": licence,
  };
}

/** Drop headers with no value: HMRC treats an empty header as an error. */
function compact(headers: Record<string, string | null | undefined>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) if (v) out[k] = v;
  return out;
}

/** The fraud prevention headers for one call to HMRC. */
export function buildFraudHeaders(context: HmrcFraudContext, vendor: VendorDetails): Record<string, string> {
  if (context.method === "BATCH_PROCESS_DIRECT") {
    return compact({
      "Gov-Client-Connection-Method": context.method,
      "Gov-Client-Device-ID": context.deviceId,
      "Gov-Client-Local-IPs": context.localIps.map(enc).join(","),
      "Gov-Client-Local-IPs-Timestamp": context.localIps.length ? context.localIpsAt.toISOString() : null,
      "Gov-Client-MAC-Addresses": context.macAddresses.map(enc).join(","),
      "Gov-Client-Timezone": formatUtcOffset(context.utcOffsetMinutes),
      "Gov-Client-User-Agent": formatUserAgent(context),
      "Gov-Client-User-IDs": formatUserIds(context.userId, context.companyId),
      ...vendorHeaders(vendor),
    });
  }

  const details = context.method === "WEB_APP_VIA_SERVER" ? context.web : context.mobile;
  const localIps = context.method === "MOBILE_APP_VIA_SERVER" ? (context.mobile?.localIps ?? []) : [];
  const localIpsAt =
    localIps.length && context.mobile?.localIpsAt ? formatTimestamp(context.mobile.localIpsAt) : null;
  const forwarded =
    vendor.publicIp && context.publicIp ? pairs([["by", vendor.publicIp], ["for", context.publicIp]]) : null;

  return compact({
    "Gov-Client-Connection-Method": context.method,
    "Gov-Client-Device-ID": context.deviceId,
    "Gov-Client-Local-IPs": localIpsAt ? localIps.map(enc).join(",") : null,
    "Gov-Client-Local-IPs-Timestamp": localIpsAt,
    "Gov-Client-Multi-Factor": formatMultiFactor(context.multiFactor),
    "Gov-Client-Public-IP": context.publicIp,
    "Gov-Client-Public-IP-Timestamp": context.publicIp ? context.publicIpAt.toISOString() : null,
    "Gov-Client-Public-Port": context.publicPort ? String(context.publicPort) : null,
    "Gov-Client-Screens": details ? formatScreens(details.screens) : null,
    "Gov-Client-Timezone": details ? formatUtcOffset(details.utcOffsetMinutes) : null,
    "Gov-Client-User-IDs": formatUserIds(context.userId),
    "Gov-Client-Window-Size": details ? formatWindow(details.window) : null,
    ...(context.method === "WEB_APP_VIA_SERVER"
      ? { "Gov-Client-Browser-JS-User-Agent": context.web?.userAgent ?? null }
      : { "Gov-Client-User-Agent": context.mobile ? formatUserAgent(context.mobile) : null }),
    "Gov-Vendor-Forwarded": forwarded,
    "Gov-Vendor-Public-IP": vendor.publicIp,
    ...vendorHeaders(vendor, context.method === "MOBILE_APP_VIA_SERVER" ? context.mobile?.appVersion : null),
  });
}

/** The first address in X-Forwarded-For, which the platform's proxy sets. */
export function clientIpFromForwardedFor(value: string | null): string | null {
  const first = value?.split(",")[0]?.trim();
  if (!first) return null;
  return ipSchema.safeParse(first).success ? first : null;
}

/** Parse details JSON (cookie or header), or null when missing or malformed. */
export function parseClientDetails<T>(schema: z.ZodType<T>, raw: string | null | undefined): T | null {
  if (!raw) return null;
  try {
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}
