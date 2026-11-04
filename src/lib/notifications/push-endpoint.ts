/**
 * The push services browsers subscribe through. The server POSTs every web
 * push to the endpoint a browser registered, so any other address would let
 * someone point those requests wherever they like.
 */
const PUSH_SERVICE_HOSTS = [
  "fcm.googleapis.com", // Chrome and other Chromium browsers
  "updates.push.services.mozilla.com", // Firefox
  ".notify.windows.com", // Edge on Windows
  ".push.apple.com", // Safari
];

/** An https endpoint on a browser push service, with nothing else in the address. */
export function isWebPushEndpoint(endpoint: unknown): endpoint is string {
  if (typeof endpoint !== "string" || endpoint.length > 2048) return false;
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password) return false;
  const host = url.hostname.toLowerCase();
  return PUSH_SERVICE_HOSTS.some((h) => (h.startsWith(".") ? host.endsWith(h) : host === h));
}

/** A subscription key as browsers send it: base64url, of a sane length. */
export function isWebPushKey(key: unknown): key is string {
  return typeof key === "string" && key.length <= 200 && /^[A-Za-z0-9_-]+={0,2}$/.test(key);
}
