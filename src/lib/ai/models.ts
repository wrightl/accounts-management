import { serverEnv } from "@/env";

/** Answers questions about the books with tool calls. */
export const ASSISTANT_MODEL = "anthropic/claude-sonnet-5.5";
/** Bulk categorising and matching, where speed and cost matter more. */
export const BULK_MODEL = "anthropic/claude-haiku-5.5";

/** Reads invoice PDFs, where accuracy matters more than speed. */
export const INVOICE_EXTRACT_MODEL = "anthropic/claude-sonnet-5.5";

/**
 * Whether AI is switched on for this deployment: only when
 * `AI_GATEWAY_API_KEY` is set. A Vercel OIDC token alone doesn't count,
 * because every Vercel deployment has one.
 */
export function aiGatewayConfigured(): boolean {
  return Boolean(serverEnv().AI_GATEWAY_API_KEY);
}
