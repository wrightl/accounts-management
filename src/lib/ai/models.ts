import { getVercelOidcTokenSync } from "@vercel/functions/oidc";
import { serverEnv } from "@/env";

/** Answers questions about the books with tool calls. */
export const ASSISTANT_MODEL = "anthropic/claude-sonnet-5.5";
/** Bulk categorising and matching, where speed and cost matter more. */
export const BULK_MODEL = "anthropic/claude-haiku-5.5";

/** Reads invoice PDFs, where accuracy matters more than speed. */
export const INVOICE_EXTRACT_MODEL = "anthropic/claude-sonnet-5.5";

/**
 * Whether calls to the AI Gateway can be made from this deployment: an API
 * key, or a Vercel OIDC token. On Vercel the token arrives as a request
 * header rather than an env var, so call this inside a request, not at
 * module load.
 */
export function aiGatewayConfigured(): boolean {
  if (serverEnv().AI_GATEWAY_API_KEY) return true;
  try {
    return Boolean(getVercelOidcTokenSync());
  } catch {
    return false;
  }
}
