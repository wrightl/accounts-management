import { describe, expect, it } from "vitest";
import { isWebPushEndpoint, isWebPushKey } from "@/lib/notifications/push-endpoint";

describe("isWebPushEndpoint", () => {
  it.each([
    "https://fcm.googleapis.com/fcm/send/abc:def",
    "https://updates.push.services.mozilla.com/wpush/v2/gAAAA",
    "https://wns2-db5p.notify.windows.com/w/?token=abc",
    "https://web.push.apple.com/QGx",
  ])("accepts %s", (endpoint) => {
    expect(isWebPushEndpoint(endpoint)).toBe(true);
  });

  it.each([
    "http://fcm.googleapis.com/fcm/send/abc",
    "https://169.254.169.254/latest/meta-data",
    "https://localhost/hook",
    "https://fcm.googleapis.com.evil.example/x",
    "https://evilnotify.windows.com/x",
    "https://fcm.googleapis.com:8443/x",
    "https://user:pass@fcm.googleapis.com/x",
    "not a url",
    42,
    undefined,
  ])("refuses %s", (endpoint) => {
    expect(isWebPushEndpoint(endpoint)).toBe(false);
  });
});

describe("isWebPushKey", () => {
  it("accepts base64url keys and refuses anything else", () => {
    expect(isWebPushKey("BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8QcYP7DkM")).toBe(true);
    expect(isWebPushKey("tBHItJI5svbpez7KI4CCXg==")).toBe(true);
    expect(isWebPushKey("<script>")).toBe(false);
    expect(isWebPushKey("a".repeat(201))).toBe(false);
    expect(isWebPushKey(null)).toBe(false);
  });
});
