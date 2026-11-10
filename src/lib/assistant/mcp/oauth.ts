import "server-only";
import { createHash } from "node:crypto";
import { clerkClient } from "@clerk/nextjs/server";
import {
  OAuthError,
  getOAuthProtectedResourceMetadataUrl,
  oauthMetadataResponse,
  requireBearerAuth,
  type AuthInfo,
  type AuthMetadataOptions,
  type OAuthMetadata,
  type OAuthTokenVerifier,
} from "@modelcontextprotocol/server";
import { clerkFrontendApiHost } from "@/lib/clerk-frontend-api";

/** Where the MCP endpoint lives; the resource assistants are granted access to. */
export const MCP_PATH = "/api/mcp";

export function mcpResourceUrl(origin: string): URL {
  return new URL(MCP_PATH, origin);
}

/**
 * The origin assistants reached us on. Behind a proxy or tunnel the request
 * URL can say localhost, which an assistant can't reach.
 */
export function publicOrigin(headers: Headers, fallback: string): string {
  const host = headers.get("x-forwarded-host")?.split(",")[0]?.trim() || headers.get("host");
  if (!host) return fallback;
  const proto =
    headers.get("x-forwarded-proto")?.split(",")[0]?.trim() ||
    (/^(localhost|127\.0\.0\.1)(:|$)/.test(host) ? "http" : "https");
  return `${proto}://${host}`;
}

/** Clerk's verify API can answer in seconds or milliseconds; the SDK wants seconds. */
function toUnixSeconds(timestamp: number): number {
  return timestamp > 1e12 ? Math.floor(timestamp / 1000) : timestamp;
}

/**
 * Clerk is the authorization server: assistants identify themselves (client ID
 * metadata documents), the person signs in to Alfa as usual and approves.
 */
async function verifyWithClerk(token: string): Promise<AuthInfo> {
  let verified;
  try {
    verified = await (await clerkClient()).idPOAuthAccessToken.verify(token);
  } catch {
    throw new OAuthError("invalid_token", "The access token is not valid.");
  }
  if (verified.revoked || verified.expired || verified.expiration == null) {
    throw new OAuthError("invalid_token", "The access token has expired or been revoked.");
  }
  return {
    token,
    clientId: verified.clientId,
    scopes: verified.scopes,
    expiresAt: toUnixSeconds(verified.expiration),
    extra: { clerkUserId: verified.subject },
  };
}

/**
 * How long a token Clerk has accepted is trusted without asking Clerk again.
 * Assistants send many calls in a burst on the same token, so this saves a
 * round trip to Clerk on each. A token revoked at Clerk stops working within
 * this time; disconnecting an assistant in Alfa still takes effect at once.
 */
export const TOKEN_CACHE_MS = 60_000;
const TOKEN_CACHE_MAX = 500;

type CachedVerification = { result: Promise<AuthInfo>; until: number };

/** Per instance, keyed by a hash of the token. Only accepted tokens stay. */
const verifiedTokens = new Map<string, CachedVerification>();

/** For tests: start each one with no remembered tokens. */
export function forgetVerifiedTokens(): void {
  verifiedTokens.clear();
}

const verifier: OAuthTokenVerifier = {
  verifyAccessToken(token: string): Promise<AuthInfo> {
    const key = createHash("sha256").update(token).digest("hex");
    const now = Date.now();
    const cached = verifiedTokens.get(key);
    if (cached && cached.until > now) return cached.result;
    verifiedTokens.delete(key);

    // Cached while in flight too, so calls arriving together share one check.
    const entry: CachedVerification = { result: verifyWithClerk(token), until: now + TOKEN_CACHE_MS };
    if (verifiedTokens.size >= TOKEN_CACHE_MAX) {
      const oldest = verifiedTokens.keys().next().value;
      if (oldest !== undefined) verifiedTokens.delete(oldest);
    }
    verifiedTokens.set(key, entry);
    entry.result.then(
      (auth) => {
        if (auth.expiresAt != null) entry.until = Math.min(entry.until, auth.expiresAt * 1000);
      },
      () => {
        if (verifiedTokens.get(key) === entry) verifiedTokens.delete(key);
      },
    );
    return entry.result;
  },
};

/** Verify the bearer token, or answer with the 401 that points to our metadata. */
export function verifyAssistantRequest(request: Request, origin: string): Promise<AuthInfo | Response> {
  return requireBearerAuth({
    verifier,
    resourceMetadataUrl: getOAuthProtectedResourceMetadataUrl(mcpResourceUrl(origin)),
  })(request);
}

let clerkMetadata: Promise<OAuthMetadata> | null = null;

/** Clerk's authorization server metadata, fetched once per instance. */
function loadClerkMetadata(): Promise<OAuthMetadata> {
  const host = clerkFrontendApiHost();
  if (!host) return Promise.reject(new Error("Clerk publishable key is not set"));
  clerkMetadata ??= fetch(`https://${host}/.well-known/oauth-authorization-server`)
    .then((res) => {
      if (!res.ok) throw new Error(`Clerk metadata: HTTP ${res.status}`);
      return res.json() as Promise<OAuthMetadata>;
    })
    .catch((error: unknown) => {
      clerkMetadata = null;
      throw error;
    });
  return clerkMetadata;
}

/**
 * Serve the discovery documents an assistant reads before signing in: our
 * protected resource metadata, and Clerk's authorization server metadata
 * for clients that look for it on our origin.
 */
export async function oauthDiscoveryResponse(request: Request, origin: string): Promise<Response> {
  const options: AuthMetadataOptions = {
    oauthMetadata: await loadClerkMetadata(),
    resourceServerUrl: mcpResourceUrl(origin),
    resourceName: "Alfa",
    serviceDocumentationUrl: new URL("/guides", origin),
  };
  return oauthMetadataResponse(request, options) ?? new Response("Not found", { status: 404 });
}
