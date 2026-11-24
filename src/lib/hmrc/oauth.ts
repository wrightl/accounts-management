import "server-only";
import { z } from "zod";
import { HMRC_SCOPES, type HmrcConfig } from "@/lib/hmrc/config";

/** What HMRC's token endpoint returns for a code exchange or a refresh. */
export interface HmrcTokens {
  accessToken: string;
  refreshToken: string;
  /** Seconds until the access token expires (HMRC issues four hours). */
  expiresIn: number;
  scopes: string;
}

const tokenResponse = z.object({
  access_token: z.string().min(1),
  refresh_token: z.string().min(1),
  expires_in: z.coerce.number().int().positive(),
  scope: z.string().optional(),
});

/** HMRC refused a code or a refresh, or answered with something unexpected. */
export class HmrcOAuthError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    /** HMRC's error code, e.g. "invalid_grant" when the grant was revoked or expired. */
    readonly code: string | null,
  ) {
    super(message);
    this.name = "HmrcOAuthError";
  }

  /** The company has to connect again: the grant was revoked, expired or never valid. */
  get needsReconnect(): boolean {
    return this.code === "invalid_grant" || this.code === "invalid_client";
  }
}

/** The URL to send an admin to so they can grant Alfa access on HMRC's site. */
export function hmrcAuthorizeUrl(config: HmrcConfig, state: string): string {
  const url = new URL("/oauth/authorize", config.apiBase);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("scope", HMRC_SCOPES.join(" "));
  url.searchParams.set("state", state);
  url.searchParams.set("redirect_uri", config.redirectUri);
  return url.toString();
}

async function tokenRequest(
  config: HmrcConfig,
  params: Record<string, string>,
  fetchImpl: typeof fetch,
): Promise<HmrcTokens> {
  const body = new URLSearchParams({
    client_id: config.clientId,
    client_secret: config.clientSecret,
    ...params,
  });
  let response: Response;
  try {
    response = await fetchImpl(new URL("/oauth/token", config.apiBase), {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded", Accept: "application/json" },
      body,
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new HmrcOAuthError("HMRC couldn't be reached. Try again in a minute.", null, null);
  }
  const json: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const code =
      json && typeof json === "object" && "error" in json && typeof json.error === "string" ? json.error : null;
    throw new HmrcOAuthError(`HMRC refused the request (${response.status}${code ? `, ${code}` : ""}).`, response.status, code);
  }
  const parsed = tokenResponse.safeParse(json);
  if (!parsed.success) throw new HmrcOAuthError("HMRC sent a token response Alfa couldn't read.", response.status, null);
  return {
    accessToken: parsed.data.access_token,
    refreshToken: parsed.data.refresh_token,
    expiresIn: parsed.data.expires_in,
    scopes: parsed.data.scope ?? HMRC_SCOPES.join(" "),
  };
}

/** Swap the code HMRC sent back to the callback for tokens. */
export function exchangeHmrcCode(config: HmrcConfig, code: string, fetchImpl: typeof fetch = fetch): Promise<HmrcTokens> {
  return tokenRequest(
    config,
    { grant_type: "authorization_code", code, redirect_uri: config.redirectUri },
    fetchImpl,
  );
}

/**
 * Get a new access token. HMRC refresh tokens are single use: the response
 * carries a new one, which must be stored before the old one is lost.
 */
export function refreshHmrcTokens(
  config: HmrcConfig,
  refreshToken: string,
  fetchImpl: typeof fetch = fetch,
): Promise<HmrcTokens> {
  return tokenRequest(config, { grant_type: "refresh_token", refresh_token: refreshToken }, fetchImpl);
}
