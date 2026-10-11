import { serverEnv } from "@/env";

/** Answers questions about the books with tool calls. */
export const ASSISTANT_MODEL = "anthropic/claude-sonnet-5.5";
/** Bulk categorising and matching, where speed and cost matter more. */
export const BULK_MODEL = "anthropic/claude-haiku-5.5";

/** Whether calls to the AI Gateway can be made from this deployment. */
export function aiGatewayConfigured(): boolean {
  return Boolean(serverEnv().AI_GATEWAY_API_KEY || process.env.VERCEL_OIDC_TOKEN);
}
