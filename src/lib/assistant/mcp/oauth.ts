import "server-only";
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
const verifier: OAuthTokenVerifier = {
  async verifyAccessToken(token: string): Promise<AuthInfo> {
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
