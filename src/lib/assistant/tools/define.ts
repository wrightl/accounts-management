import { z } from "zod";
import { formatIsoDateUk } from "@/lib/dates";
import type { RecordScope } from "@/lib/accountant/record-scope";
import type { Permission } from "@/lib/roles";

/** What a tool call runs against. Every tool reads one company only. */
export type AssistantToolContext = {
  companyId: string;
  /** "pack" for an accountant: only the records the accountant pack contains. */
  recordScope: RecordScope;
  /** Each tool adds a line saying what it looked at, so an answer can cite it. */
  sources: string[];
};

/**
 * A read-only tool over the company's figures, independent of who calls it.
 * The in-app bookkeeper and the MCP server both expose these.
 */
export type AssistantTool<Input = unknown> = {
  name: string;
  description: string;
  /** The permission that opens the screen showing the same figures. */
  permission: Permission;
  /** Only limited companies have reserves, dividends and director's loans. */
  ltdOnly?: boolean;
  /** The Alfa screen showing the same figures, so a person can check an answer. */
  href?: string;
  inputSchema: z.ZodType<Input>;
  execute: (ctx: AssistantToolContext, input: Input) => Promise<unknown>;
};

/**
 * Type-check a tool against its own input schema, then erase the input type so
 * tools can share one list. Callers validate input against `inputSchema` first.
 */
export function defineTool<Input>(definition: AssistantTool<Input>): AssistantTool {
  return definition as AssistantTool;
}

export const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/).describe("YYYY-MM-DD");
export const period = z.object({ from: isoDate, to: isoDate });

export function periodLabel(from: string, to: string): string {
  return `${formatIsoDateUk(from)} to ${formatIsoDateUk(to)}`;
}

/** What a draft tool runs against: one company, on behalf of one person. */
export type DraftToolContext = {
  companyId: string;
  /** The person the draft is created for; recorded as its creator. */
  localUserId: string;
};

/**
 * A tool that creates something for a person to review in Alfa: never sends,
 * pays, approves or deletes. Only the MCP server offers these.
 */
export type AssistantDraftTool<Input = unknown> = {
  name: string;
  description: string;
  permission: Permission;
  /** The audit entry for what it creates, as the app writes for the same thing. */
  audit: { action: string; entityType: string };
  /** The Alfa screen to review what it created. */
  href: (id: string) => string;
  inputSchema: z.ZodType<Input>;
  execute: (ctx: DraftToolContext, input: Input) => Promise<DraftResult>;
};

/** A created draft and what to tell the person about it; or why it wasn't created. */
export type DraftResult =
  | { ok: true; id: string; draft: Record<string, unknown> }
  | { ok: false; error: string };

export function defineDraftTool<Input>(definition: AssistantDraftTool<Input>): AssistantDraftTool {
  return definition as AssistantDraftTool;
}
