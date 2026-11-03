import "server-only";
import { McpServer, type CallToolResult } from "@modelcontextprotocol/server";
import { z } from "zod";
import { recordScopeFor } from "@/lib/accountant/record-scope";
import { writeAudit } from "@/lib/audit";
import { todayIsoDate } from "@/lib/dates";
import { can, roleLabel } from "@/lib/roles";
import { ASSISTANT_TOOLS } from "@/lib/assistant/tools/catalog";
import { STARTER_PROMPTS } from "@/lib/assistant/prompts";
import { DRAFT_TOOLS } from "@/lib/assistant/tools/drafts";
import type { AssistantDraftTool, AssistantTool } from "@/lib/assistant/tools/define";
import { checkCompanyWritable } from "@/lib/mutate";
import {
  ASSISTANT_TOOL_ACTION,
  DAILY_TOOL_CALL_LIMIT,
  chooseCompany,
  noCompanyMessage,
  readableCompanies,
  toolCallsToday,
  type AssistantPerson,
} from "./access";

export type AssistantServerContext = {
  person: AssistantPerson;
  oauthClientId: string;
  /** The app's origin, for links back to the screen behind each answer. */
  origin: string;
};

const INSTRUCTIONS = `Alfa is an accounting app for UK small businesses. These tools read one company's own books.
Use only figures the tools return; never make up or estimate a number. Say which dates you used, and write dates like 3 Nov 2026.
Calendar quarters: Q1 is January to March, unless the person says financial quarter (company_overview gives the financial year).
Write in plain UK English. Put the figure first, keep answers short, and explain any accounting word in a few plain words the first time you use it.
Each result has an openInAlfa link to the screen showing the same figures; offer it when someone may want to check.
Read tools can't change the books. Where offered, create_draft_invoice, create_draft_quote and create_draft_expense only make drafts for the person to review in Alfa: nothing is sent, paid or approved. Before creating one, show the person exactly what you'll create and wait for them to say yes. Afterwards, give them the openInAlfa link.
Don't give tax or legal advice beyond the figures.`;

function text(message: string, isError = false): CallToolResult {
  return { content: [{ type: "text", text: message }], ...(isError ? { isError: true } : {}) };
}

/** Every tool takes an optional company, for people who hold a role in more than one. */
function withCompany(schema: z.ZodType, multiCompany: boolean): z.ZodType {
  if (!multiCompany || !(schema instanceof z.ZodObject)) return schema;
  return schema.extend({
    company: z.string().max(200).optional().describe("Company name or id; defaults to the current one"),
  });
}

/**
 * Build the MCP server for one request, showing only what this person could
 * open in Alfa. Tools are the union across their readable companies; each
 * call re-checks the role for the company it's about.
 */
export function createAssistantServer({ person, oauthClientId, origin }: AssistantServerContext): McpServer {
  const readable = readableCompanies(person);
  const server = new McpServer(
    { name: "alfa", title: "Alfa", version: "1.0.0" },
    {
      instructions: readable.length
        ? INSTRUCTIONS
        : `${INSTRUCTIONS}\n\nRight now: ${noCompanyMessage(person)}`,
    },
  );
  const multiCompany = person.companies.length > 1;

  server.registerTool(
    "list_my_companies",
    {
      title: "My companies",
      description:
        "The companies this person can see in Alfa, their role in each, and whether AI assistant access is on. Call this first if unsure which company is meant.",
      inputSchema: z.object({}),
      annotations: { readOnlyHint: true },
    },
    async () =>
      text(
        JSON.stringify({
          today: todayIsoDate(),
          current: person.companies.find((c) => c.id === person.currentCompanyId)?.name ?? null,
          companies: person.companies.map((c) => ({
            name: c.name,
            id: c.id,
            role: roleLabel(c.role),
            kind: c.isLtd ? "Limited company" : "Sole trader",
            assistantAccess: c.suspended ? "suspended" : c.enabled ? "on" : "off (an admin can turn it on in Settings)",
          })),
        }),
      ),
  );

  const offered = ASSISTANT_TOOLS.filter((t) =>
    readable.some((c) => can(c.role, t.permission) && (c.isLtd || !t.ltdOnly)),
  );
  for (const tool of offered) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: withCompany(tool.inputSchema, multiCompany),
        annotations: { readOnlyHint: true, openWorldHint: false },
      },
      async (args: unknown) => runTool(tool, args, { person, oauthClientId, origin }),
    );
  }

  const drafts = DRAFT_TOOLS.filter((t) => readable.some((c) => can(c.role, t.permission)));
  for (const tool of drafts) {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: withCompany(tool.inputSchema, multiCompany),
        annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
      },
      async (args: unknown) => runTool(tool, args, { person, oauthClientId, origin }),
    );
  }

  for (const p of STARTER_PROMPTS) {
    if ([...offered, ...drafts].some((t) => t.name === p.needs)) {
      server.registerPrompt(p.name, { title: p.title }, () => ({
        messages: [{ role: "user", content: { type: "text", text: p.text } }],
      }));
    }
  }

  return server;
}

function isDraftTool(tool: AssistantTool | AssistantDraftTool): tool is AssistantDraftTool {
  return DRAFT_TOOLS.includes(tool as AssistantDraftTool);
}

async function runTool(
  tool: AssistantTool | AssistantDraftTool,
  args: unknown,
  { person, oauthClientId, origin }: AssistantServerContext,
): Promise<CallToolResult> {
  const { company: named, ...input } = (args ?? {}) as Record<string, unknown> & { company?: string };
  const choice = chooseCompany(person, named);
  if (!choice.ok) return text(choice.message, true);
  const company = choice.company;
  const ltdOnly = "ltdOnly" in tool && tool.ltdOnly === true;

  if (!can(company.role, tool.permission) || (ltdOnly && !company.isLtd)) {
    return text(
      ltdOnly && !company.isLtd
        ? `${company.name} is a sole trader, so this doesn't apply.`
        : `As ${roleLabel(company.role).toLowerCase()} for ${company.name}, you can't do this in Alfa, so your assistant can't either.`,
      true,
    );
  }
  if ((await toolCallsToday(company.id)) >= DAILY_TOOL_CALL_LIMIT) {
    return text(
      `${company.name} has reached today's limit of ${DAILY_TOOL_CALL_LIMIT} assistant look-ups. It resets at midnight UK time; everything is still in Alfa.`,
      true,
    );
  }
  if (isDraftTool(tool)) {
    const writable = await checkCompanyWritable(company.id);
    if (!writable.ok) return text(writable.error, true);
  }

  await writeAudit({
    companyId: company.id,
    actorUserId: person.localUserId,
    action: ASSISTANT_TOOL_ACTION,
    entityType: "assistant_tool",
    meta: { tool: tool.name, oauthClientId },
  });

  if (isDraftTool(tool)) {
    const result = await tool.execute({ companyId: company.id, localUserId: person.localUserId }, input);
    if (!result.ok) return text(`Nothing was created. ${result.error}`, true);
    return text(
      JSON.stringify({
        company: company.name,
        created: result.draft,
        openInAlfa: new URL(result.openInAlfa, origin).toString(),
      }),
    );
  }

  const sources: string[] = [];
  const result = await tool.execute(
    { companyId: company.id, recordScope: recordScopeFor(company.role), sources },
    input,
  );
  const ownLink =
    result && typeof result === "object" && "openInAlfa" in result && typeof result.openInAlfa === "string"
      ? result.openInAlfa
      : null;
  const href = ownLink ?? tool.href;
  return text(
    JSON.stringify({
      company: company.name,
      basedOn: [...new Set(sources)],
      result,
      ...(href ? { openInAlfa: new URL(href, origin).toString() } : {}),
    }),
  );
}
