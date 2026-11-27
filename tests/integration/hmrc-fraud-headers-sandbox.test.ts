/**
 * Checks Alfa's fraud prevention headers with HMRC's Test Fraud Prevention
 * Headers API in the sandbox (roadmap item 17, risk R7). Needs a sandbox
 * application subscribed to that API, with its credentials in
 * HMRC_SANDBOX_CLIENT_ID and HMRC_SANDBOX_CLIENT_SECRET (GitHub Actions
 * secrets in CI). Skipped without them.
 *
 * One error is expected: Gov-Client-Public-Port. Vercel doesn't pass on the
 * port the client connected from, and HMRC asks vendors who can't send it
 * to tell them why. Any other error fails the test.
 */
import { describe, expect, it } from "vitest";
import {
  buildFraudHeaders,
  type HmrcFraudContext,
  type VendorDetails,
} from "@/lib/hmrc/fraud-headers";
import pkg from "../../package.json";

const clientId = process.env.HMRC_SANDBOX_CLIENT_ID;
const clientSecret = process.env.HMRC_SANDBOX_CLIENT_SECRET;
const API = "https://test-api.service.hmrc.gov.uk";

interface ValidatorResult {
  code: string;
  message?: string;
  errors?: Array<{ code: string; message: string; headers?: string[] }>;
  warnings?: Array<{ code: string; message: string; headers?: string[] }>;
}

async function applicationToken(): Promise<string> {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId!,
      client_secret: clientSecret!,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  expect(res.status, await res.clone().text()).toBe(200);
  return ((await res.json()) as { access_token: string }).access_token;
}

async function validate(context: HmrcFraudContext): Promise<ValidatorResult> {
  const vendor: VendorDetails = {
    productName: "Alfa",
    version: pkg.version,
    publicIp: "185.199.108.153",
    licenseIds: {},
  };
  const res = await fetch(`${API}/test/fraud-prevention-headers/validate`, {
    headers: {
      Accept: "application/vnd.hmrc.1.0+json",
      Authorization: `Bearer ${await applicationToken()}`,
      ...buildFraudHeaders(context, vendor),
    },
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json()) as ValidatorResult;
  if (body.warnings?.length) console.warn(context.method, JSON.stringify(body.warnings, null, 2));
  return body;
}

/** HMRC's errors, less the one Alfa can't fix in code (see above). */
function unexpectedErrors(result: ValidatorResult) {
  return (result.errors ?? []).filter(
    (e) => !(e.code === "MISSING_HEADER" && e.headers?.length === 1 && e.headers[0] === "gov-client-public-port"),
  );
}

const now = new Date();
const DEVICE = "beec798b-b366-47fa-b1f8-92cede14a1ce";
const person = {
  userId: "5b0f3f7e-2c39-4d0e-9a51-1f2f8f0c6a11",
  deviceId: DEVICE,
  publicIp: "81.2.69.142",
  publicPort: null,
  publicIpAt: now,
  multiFactor: [
    { type: "TOTP" as const, verifiedAt: new Date(now.getTime() - 10 * 60_000), uniqueReference: "c0ffee" },
  ],
};

describe.skipIf(!clientId || !clientSecret)("HMRC's fraud prevention header validator", () => {
  it("accepts the web app's headers", async () => {
    const result = await validate({
      ...person,
      method: "WEB_APP_VIA_SERVER",
      web: {
        screens: [{ width: 1920, height: 1080, scalingFactor: 1, colourDepth: 24 }],
        window: { width: 1256, height: 803 },
        utcOffsetMinutes: 0,
        userAgent:
          "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36",
      },
    });
    expect(unexpectedErrors(result), JSON.stringify(result)).toEqual([]);
  });

  it("accepts the mobile app's headers", async () => {
    const result = await validate({
      ...person,
      method: "MOBILE_APP_VIA_SERVER",
      mobile: {
        deviceId: DEVICE,
        screens: [{ width: 1179, height: 2556, scalingFactor: 3, colourDepth: 24 }],
        window: { width: 393, height: 852 },
        utcOffsetMinutes: 0,
        osFamily: "iOS",
        osVersion: "18.1",
        deviceManufacturer: "Apple",
        deviceModel: "iPhone15,2",
        localIps: ["192.168.1.20", "fd00::5"],
        localIpsAt: now.toISOString(),
        appVersion: "1.0.0+4",
      },
    });
    expect(unexpectedErrors(result), JSON.stringify(result)).toEqual([]);
  });

  it("accepts the headers for scheduled work", async () => {
    const result = await validate({
      method: "BATCH_PROCESS_DIRECT",
      userId: null,
      companyId: "9d1f3b2a-6c4e-4f8a-b0d2-7e5a1c3f9b40",
      deviceId: DEVICE,
      localIps: ["10.1.2.3"],
      localIpsAt: now,
      macAddresses: ["02:42:ac:11:00:02"],
      utcOffsetMinutes: 0,
      osFamily: "Linux",
      osVersion: "6.1.0",
      deviceManufacturer: null,
      deviceModel: "x86_64",
    });
    expect(unexpectedErrors(result), JSON.stringify(result)).toEqual([]);
  });
});
