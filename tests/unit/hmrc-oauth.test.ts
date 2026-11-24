import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { exchangeHmrcCode, hmrcAuthorizeUrl, HmrcOAuthError, refreshHmrcTokens } = await import("@/lib/hmrc/oauth");

const config = {
  environment: "sandbox" as const,
  apiBase: "https://test-api.service.hmrc.gov.uk",
  clientId: "client-id",
  clientSecret: "client-secret",
  redirectUri: "https://alfa.example/api/hmrc/callback",
};

function tokenFetch(status: number, body: unknown) {
  return vi.fn(async (_url: URL | RequestInfo, _init?: RequestInit) =>
    new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } }),
  );
}

describe("HMRC OAuth", () => {
  it("builds the authorise URL with the VAT scopes, state and redirect", () => {
    const url = new URL(hmrcAuthorizeUrl(config, "state-123"));
    expect(url.origin + url.pathname).toBe("https://test-api.service.hmrc.gov.uk/oauth/authorize");
    expect(Object.fromEntries(url.searchParams)).toEqual({
      response_type: "code",
      client_id: "client-id",
      scope: "read:vat write:vat",
      state: "state-123",
      redirect_uri: "https://alfa.example/api/hmrc/callback",
    });
  });

  it("exchanges a code for tokens with a form post", async () => {
    const fetchImpl = tokenFetch(200, {
      access_token: "access",
      refresh_token: "refresh",
      expires_in: 14400,
      scope: "read:vat write:vat",
      token_type: "bearer",
    });
    const tokens = await exchangeHmrcCode(config, "the-code", fetchImpl);
    expect(tokens).toEqual({ accessToken: "access", refreshToken: "refresh", expiresIn: 14400, scopes: "read:vat write:vat" });
    const [url, init] = fetchImpl.mock.calls[0]!;
    expect(String(url)).toBe("https://test-api.service.hmrc.gov.uk/oauth/token");
    expect(init!.method).toBe("POST");
    expect(Object.fromEntries(new URLSearchParams(String(init!.body)))).toEqual({
      client_id: "client-id",
      client_secret: "client-secret",
      grant_type: "authorization_code",
      code: "the-code",
      redirect_uri: "https://alfa.example/api/hmrc/callback",
    });
  });

  it("refreshes with the refresh token", async () => {
    const fetchImpl = tokenFetch(200, { access_token: "a2", refresh_token: "r2", expires_in: 14400 });
    await expect(refreshHmrcTokens(config, "r1", fetchImpl)).resolves.toMatchObject({ accessToken: "a2", refreshToken: "r2" });
    const body = new URLSearchParams(String(fetchImpl.mock.calls[0]![1]!.body));
    expect(body.get("grant_type")).toBe("refresh_token");
    expect(body.get("refresh_token")).toBe("r1");
  });

  it("reports a revoked or expired grant as needing a reconnect", async () => {
    const error = await refreshHmrcTokens(config, "r1", tokenFetch(400, { error: "invalid_grant" })).catch((e) => e);
    expect(error).toBeInstanceOf(HmrcOAuthError);
    expect(error).toMatchObject({ status: 400, code: "invalid_grant", needsReconnect: true });
  });

  it("refuses a response it can't read, and a network failure", async () => {
    await expect(exchangeHmrcCode(config, "c", tokenFetch(200, { nope: true }))).rejects.toThrow("couldn't read");
    const down = vi.fn(async () => {
      throw new TypeError("fetch failed");
    });
    await expect(exchangeHmrcCode(config, "c", down)).rejects.toThrow("couldn't be reached");
  });
});
