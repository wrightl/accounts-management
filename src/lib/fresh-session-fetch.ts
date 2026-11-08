/**
 * Clerk's session token lives about 60 seconds and is renewed by a timer in
 * the browser. Background tabs and sleeping laptops delay that timer, so a
 * click can reach the server with an expired token and look signed out. This
 * wraps `fetch` so server actions and in-app navigations wait for a fresh
 * token first. `getToken()` returns the cached token straight away while it is
 * still valid, so the usual cost is nothing.
 */

/** Longest a request waits for Clerk before going ahead anyway. */
export const RENEW_TIMEOUT_MS = 3000;

/** Headers Next.js sets on server action and RSC (navigation) requests. */
const NEXT_SERVER_HEADERS = ["next-action", "rsc"];

/** Whether this request is a Next.js server action or RSC fetch. */
export function isNextServerRequest(
  input: RequestInfo | URL,
  init?: RequestInit,
): boolean {
  const headers = new Headers(
    init?.headers ?? (input instanceof Request ? input.headers : undefined),
  );
  return NEXT_SERVER_HEADERS.some((name) => headers.has(name));
}

/**
 * Wrap `fetchImpl` so Next.js server requests first call `renew`. A failed or
 * slow renewal never blocks the request: the server then answers as signed
 * out, which actions report as a message rather than a redirect.
 */
export function withFreshSession(
  fetchImpl: typeof fetch,
  renew: () => Promise<unknown>,
  timeoutMs: number = RENEW_TIMEOUT_MS,
): typeof fetch {
  return async (input, init) => {
    if (isNextServerRequest(input, init)) {
      let timer: ReturnType<typeof setTimeout> | undefined;
      await Promise.race([
        renew().catch(() => {}),
        new Promise((resolve) => {
          timer = setTimeout(resolve, timeoutMs);
        }),
      ]);
      clearTimeout(timer);
    }
    return fetchImpl(input, init);
  };
}
