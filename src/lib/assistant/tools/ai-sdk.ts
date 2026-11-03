import "server-only";
import { tool, type ToolSet } from "ai";
import type { AssistantTool, AssistantToolContext } from "./define";

/** Expose assistant tools to an AI SDK model, bound to one company. */
export function toAiSdkTools(tools: AssistantTool[], ctx: AssistantToolContext): ToolSet {
  return Object.fromEntries(
    tools.map((t) => [
      t.name,
      tool({
        description: t.description,
        inputSchema: t.inputSchema,
        execute: (input) => t.execute(ctx, input),
      }),
    ]),
  );
}
