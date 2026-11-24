import "server-only";
import { serverEnv } from "@/env";
import { appBaseUrl } from "@/lib/billing/stripe";
import { secretBoxConfigured } from "@/lib/crypto/secret-box";

export type HmrcEnvironment = "sandbox" | "production";

/** HMRC's API hosts. OAuth authorise and token endpoints live on the same host. */
const API_BASE: Record<HmrcEnvironment, string> = {
  sandbox: "https://test-api.service.hmrc.gov.uk",
  production: "https://api.service.hmrc.gov.uk",
};

/**
 * Scopes asked for when a company connects. VAT only for now; Income Tax
 * (item 19) adds its scopes and asks the company to connect again.
 */
export const HMRC_SCOPES = ["read:vat", "write:vat"] as const;

/** HMRC refresh tokens last 18 months from when the company granted access. */
export const HMRC_GRANT_MONTHS = 18;

export interface HmrcConfig {
  environment: HmrcEnvironment;
  apiBase: string;
  clientId: string;
  clientSecret: string;
  /** Must match a redirect URI registered on the HMRC Developer Hub application. */
  redirectUri: string;
}

export function hmrcEnvironment(): HmrcEnvironment {
  return serverEnv().HMRC_ENV;
}

export function hmrcApiBase(environment: HmrcEnvironment = hmrcEnvironment()): string {
  return API_BASE[environment];
}

export function hmrcRedirectUri(): string {
  return `${appBaseUrl()}/api/hmrc/callback`;
}

/**
 * Whether companies can connect to HMRC: switched on, with client credentials
 * and an encryption key for the tokens. Until then the HMRC card stays hidden.
 */
export function hmrcConnectEnabled(): boolean {
  const env = serverEnv();
  return (
    env.HMRC_CONNECT_ENABLED === "true" &&
    Boolean(env.HMRC_CLIENT_ID) &&
    Boolean(env.HMRC_CLIENT_SECRET) &&
    secretBoxConfigured()
  );
}

export class HmrcNotConfiguredError extends Error {
  constructor() {
    super("The HMRC connection isn't set up on this server yet.");
    this.name = "HmrcNotConfiguredError";
  }
}

export function hmrcConfig(): HmrcConfig {
  if (!hmrcConnectEnabled()) throw new HmrcNotConfiguredError();
  const env = serverEnv();
  const environment = env.HMRC_ENV;
  return {
    environment,
    apiBase: API_BASE[environment],
    clientId: env.HMRC_CLIENT_ID!,
    clientSecret: env.HMRC_CLIENT_SECRET!,
    redirectUri: hmrcRedirectUri(),
  };
}
