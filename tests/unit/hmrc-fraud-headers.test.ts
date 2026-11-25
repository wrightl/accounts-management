import { describe, expect, it } from "vitest";
import {
  buildFraudHeaders,
  clientIpFromForwardedFor,
  formatUtcOffset,
  mobileClientDetailsSchema,
  parseClientDetails,
  webClientDetailsSchema,
  type BatchCallContext,
  type ClientCallContext,
  type VendorDetails,
} from "@/lib/hmrc/fraud-headers";

const AT = new Date("2026-11-25T09:15:30.123Z");
const VENDOR: VendorDetails = { productName: "Alfa", version: "0.1.0", publicIp: "203.0.113.6", licenseIds: {} };
const DEVICE = "beec798b-b366-47fa-b1f8-92cede14a1ce";

const web: ClientCallContext = {
  method: "WEB_APP_VIA_SERVER",
  userId: "u 1",
  deviceId: DEVICE,
  web: {
    screens: [{ width: 1920, height: 1080, scalingFactor: 1.5, colourDepth: 24 }],
    window: { width: 1256, height: 803 },
    utcOffsetMinutes: 60,
    userAgent: "Mozilla/5.0 (Macintosh)",
  },
  publicIp: "198.51.100.7",
  publicPort: 12345,
  publicIpAt: AT,
  multiFactor: [{ type: "TOTP", verifiedAt: AT, uniqueReference: "abc123" }],
};

describe("web app headers", () => {
  it("formats every header HMRC asks for", () => {
    expect(buildFraudHeaders(web, VENDOR)).toEqual({
      "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
      "Gov-Client-Device-ID": DEVICE,
      "Gov-Client-Multi-Factor": "type=TOTP&timestamp=2026-11-25T09%3A15Z&unique-reference=abc123",
      "Gov-Client-Public-IP": "198.51.100.7",
      "Gov-Client-Public-IP-Timestamp": "2026-11-25T09:15:30.123Z",
      "Gov-Client-Public-Port": "12345",
      "Gov-Client-Screens": "width=1920&height=1080&scaling-factor=1.5&colour-depth=24",
      "Gov-Client-Timezone": "UTC+01:00",
      "Gov-Client-User-IDs": "alfa=u%201",
      "Gov-Client-Window-Size": "width=1256&height=803",
      "Gov-Client-Browser-JS-User-Agent": "Mozilla/5.0 (Macintosh)",
      "Gov-Vendor-Forwarded": "by=203.0.113.6&for=198.51.100.7",
      "Gov-Vendor-Public-IP": "203.0.113.6",
      "Gov-Vendor-Product-Name": "Alfa",
      "Gov-Vendor-Version": "Alfa=0.1.0",
    });
  });

  it("leaves out what isn't known rather than sending empty headers", () => {
    const headers = buildFraudHeaders(
      { ...web, web: null, deviceId: null, publicIp: null, publicPort: null, multiFactor: [], userId: null },
      { ...VENDOR, publicIp: null },
    );
    expect(headers).toEqual({
      "Gov-Client-Connection-Method": "WEB_APP_VIA_SERVER",
      "Gov-Vendor-Product-Name": "Alfa",
      "Gov-Vendor-Version": "Alfa=0.1.0",
    });
  });

  it("encodes licence IDs when there are any", () => {
    const headers = buildFraudHeaders(web, { ...VENDOR, licenseIds: { "my licensed software": "8D7963490527D33716835EE7C195516D5E562E03B224E9B359836466EE40CDE1" } });
    expect(headers["Gov-Vendor-License-IDs"]).toBe(
      "my%20licensed%20software=8D7963490527D33716835EE7C195516D5E562E03B224E9B359836466EE40CDE1",
    );
  });
});

describe("mobile app headers", () => {
  it("sends the device's operating system and model instead of the browser", () => {
    const headers = buildFraudHeaders(
      {
        ...web,
        method: "MOBILE_APP_VIA_SERVER",
        web: undefined,
        mobile: {
          deviceId: DEVICE,
          screens: [{ width: 1179, height: 2556, scalingFactor: 3, colourDepth: 24 }],
          window: { width: 393, height: 852 },
          utcOffsetMinutes: -300,
          osFamily: "iOS",
          osVersion: "18.1",
          deviceManufacturer: "Apple",
          deviceModel: "iPhone15,2",
        },
      },
      VENDOR,
    );
    expect(headers["Gov-Client-Connection-Method"]).toBe("MOBILE_APP_VIA_SERVER");
    expect(headers["Gov-Client-User-Agent"]).toBe(
      "os-family=iOS&os-version=18.1&device-manufacturer=Apple&device-model=iPhone15%2C2",
    );
    expect(headers["Gov-Client-Timezone"]).toBe("UTC-05:00");
    expect(headers["Gov-Client-Browser-JS-User-Agent"]).toBeUndefined();
  });
});

describe("batch headers", () => {
  it("describes the server instead of a person's device", () => {
    const batch: BatchCallContext = {
      method: "BATCH_PROCESS_DIRECT",
      userId: null,
      deviceId: DEVICE,
      localIps: ["10.0.0.4", "fe80::1"],
      localIpsAt: AT,
      macAddresses: ["02:42:ac:11:00:02"],
      utcOffsetMinutes: 0,
      osFamily: "Linux",
      osVersion: "6.1.0",
      deviceManufacturer: null,
      deviceModel: "x86_64",
    };
    expect(buildFraudHeaders(batch, VENDOR)).toEqual({
      "Gov-Client-Connection-Method": "BATCH_PROCESS_DIRECT",
      "Gov-Client-Device-ID": DEVICE,
      "Gov-Client-Local-IPs": "10.0.0.4,fe80%3A%3A1",
      "Gov-Client-Local-IPs-Timestamp": "2026-11-25T09:15:30.123Z",
      "Gov-Client-MAC-Addresses": "02%3A42%3Aac%3A11%3A00%3A02",
      "Gov-Client-Timezone": "UTC+00:00",
      "Gov-Client-User-Agent": "os-family=Linux&os-version=6.1.0&device-model=x86_64",
      "Gov-Vendor-Product-Name": "Alfa",
      "Gov-Vendor-Version": "Alfa=0.1.0",
    });
  });
});

describe("helpers", () => {
  it("formats offsets with half hours", () => {
    expect(formatUtcOffset(330)).toBe("UTC+05:30");
    expect(formatUtcOffset(-570)).toBe("UTC-09:30");
  });

  it("takes the first forwarded address and ignores junk", () => {
    expect(clientIpFromForwardedFor("198.51.100.7, 10.0.0.1")).toBe("198.51.100.7");
    expect(clientIpFromForwardedFor("2001:db8::1")).toBe("2001:db8::1");
    expect(clientIpFromForwardedFor("not-an-ip")).toBeNull();
    expect(clientIpFromForwardedFor(null)).toBeNull();
  });

  it("rejects malformed details", () => {
    expect(parseClientDetails(webClientDetailsSchema, "{")).toBeNull();
    expect(parseClientDetails(webClientDetailsSchema, JSON.stringify({ screens: [] }))).toBeNull();
    expect(parseClientDetails(mobileClientDetailsSchema, JSON.stringify({ deviceId: "nope" }))).toBeNull();
    expect(parseClientDetails(webClientDetailsSchema, JSON.stringify(web.web))).toEqual(web.web);
  });
});
