/**
 * Cookies the web app's script sets so that server actions calling HMRC can
 * send the fraud prevention headers (see fraud-headers.ts). Shared by the
 * script (a client component) and the server.
 */

/** A random ID for this browser, kept for two years. */
export const DEVICE_ID_COOKIE = "alfa_device_id";
export const DEVICE_ID_MAX_AGE_SECONDS = 2 * 365 * 24 * 60 * 60;

/** JSON of WebClientDetails, rewritten on load and when the window resizes. */
export const CLIENT_DETAILS_COOKIE = "alfa_client_details";

/** Header the mobile app sends: base64url JSON of MobileClientDetails. */
export const MOBILE_DEVICE_HEADER = "x-alfa-device";
