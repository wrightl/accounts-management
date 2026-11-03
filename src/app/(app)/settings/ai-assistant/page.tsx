import type { Metadata } from "next";
import Link from "next/link";
import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import { companies } from "@/db/schema";
import { guardTenantPage } from "@/lib/auth";
import { ensureLocalUser } from "@/lib/users";
import { can } from "@/lib/roles";
import { assistantToolsFor } from "@/lib/assistant/tools/catalog";
import { DRAFT_TOOLS } from "@/lib/assistant/tools/drafts";
import { listAssistantConnections } from "@/lib/assistant/connections";
import { STARTER_PROMPTS, pasteablePrompt } from "@/lib/assistant/prompts";
import { MCP_PATH, publicOrigin } from "@/lib/assistant/mcp/oauth";
import { NAV_GROUPS, SETTINGS_PAGES } from "@/components/dashboard/nav";
import { SettingsPageHeader, SETTINGS_FORM_WIDTH } from "@/components/settings/settings-page-header";
import { AssistantAccessSwitch } from "@/components/settings/assistant-access-switch";
import { AssistantSetup } from "@/components/settings/assistant-setup";
import { AssistantConnections } from "@/components/settings/assistant-connections";
import { CopyButton } from "@/components/ui/copy-button";

export const metadata: Metadata = { title: "AI assistant" };

/** Screen names, so people see what's shared in the words the menu uses. */
const SCREEN_LABELS = new Map<string, string>([
  ...[...NAV_GROUPS.flatMap((g) => g.items), ...SETTINGS_PAGES].map((i) => [i.href, i.label] as const),
  ["/settings", "Company details"],
]);

/** The address assistants connect to, on whichever host this page was opened. */
async function connectorAddress(): Promise<string> {
  return `${publicOrigin(await headers(), "http://localhost:3001")}${MCP_PATH}`;
}

function usedAgo(when: Date, now: Date): string {
  const minutes = Math.floor((now.getTime() - when.getTime()) / 60_000);
  if (minutes < 1) return "Used just now";
  if (minutes < 60) return `Used ${minutes} minute${minutes === 1 ? "" : "s"} ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Used ${hours} hour${hours === 1 ? "" : "s"} ago`;
  return `Last used ${when.toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/London" })}`;
}

export default async function AiAssistantSettingsPage() {
  const session = await guardTenantPage("workspace:read");
  const localUserId = session.localUserId ?? (await ensureLocalUser(session));
  const [[company], connections, address] = await Promise.all([
    getDb()
      .select({
        name: companies.name,
        enabled: companies.aiAssistantEnabled,
        suspendedAt: companies.suspendedAt,
      })
      .from(companies)
      .where(eq(companies.id, session.companyId))
      .limit(1),
    listAssistantConnections(localUserId),
    connectorAddress(),
  ]);
  const companyName = company?.name ?? "this company";
  const enabled = company?.enabled === true;
  const isAdmin = can(session.role, "settings:manage");
  const canDraft = can(session.role, "accounts:write");
  const tools = assistantToolsFor({ role: session.role, isLtd: session.entityType === "limited_company" });
  const screens = [
    ...new Set(
      tools
        .map((t) => (t.href ? SCREEN_LABELS.get(t.href) : undefined))
        .filter((label): label is string => Boolean(label)),
    ),
  ];
  const draftsAllowed = connections.some((c) => c.allowDrafts && c.disconnectedAt == null);
  const toolNames = new Set([
    ...tools.map((t) => t.name),
    ...(draftsAllowed ? DRAFT_TOOLS.filter((t) => can(session.role, t.permission)) : []).map((t) => t.name),
  ]);
  const prompts = STARTER_PROMPTS.filter((p) => toolNames.has(p.needs));
  const now = new Date();

  return (
    <div>
      <SettingsPageHeader
        title="AI assistant"
        description="Ask Claude, ChatGPT or another AI assistant about your books, in your own words."
      />
      <div className={`${SETTINGS_FORM_WIDTH} space-y-10`}>
        <section aria-labelledby="assistant-access" className="space-y-3">
          <h2 id="assistant-access" className="font-display text-lg font-semibold">
            Access for {companyName}
          </h2>
          {canDraft ? (
            <p className="text-sm text-foreground/90">
              Your assistant can <strong>read</strong> your books, and make{" "}
              <strong>drafts</strong> for you to check, if you allow it below: a draft invoice or
              quote, or an expense waiting for review. It can&apos;t send, pay, approve or delete
              anything. It sees what you can see
              here, and nothing more:
            </p>
          ) : (
            <p className="text-sm text-foreground/90">
              Your assistant can only <strong>read</strong>. It can&apos;t change, send or delete
              anything in Alfa. It sees what you can see here, and nothing more:
            </p>
          )}
          {screens.length > 0 ? (
            <ul className="flex flex-wrap gap-2" aria-label="Screens your assistant can read">
              {screens.map((label) => (
                <li
                  key={label}
                  className="rounded-full border border-border bg-surface px-3 py-1 text-sm"
                >
                  {label}
                </li>
              ))}
            </ul>
          ) : null}
          <p className="text-sm text-muted">
            The assistant&apos;s company (such as Anthropic or OpenAI) works out each answer, under
            the terms of your own account with them. Every look-up is recorded in the audit log.{" "}
            <Link href="/privacy#own-ai" className="underline">
              How this affects your data
            </Link>
          </p>
          {company?.suspendedAt ? (
            <p className="text-sm font-medium text-foreground">
              {companyName} is suspended, so assistants can&apos;t read it for now.
            </p>
          ) : isAdmin ? (
            <AssistantAccessSwitch enabled={enabled} companyName={companyName} />
          ) : (
            <p className="text-sm font-medium text-foreground">
              {enabled
                ? `Turned on for ${companyName}.`
                : `Turned off for ${companyName}. An admin can turn it on here.`}
            </p>
          )}
        </section>

        <section aria-labelledby="assistant-connect" className="space-y-3">
          <h2 id="assistant-connect" className="font-display text-lg font-semibold">
            Connect your assistant
          </h2>
          <p className="text-sm text-muted">
            About two minutes. You only do this once; it then works in every chat.
          </p>
          <AssistantSetup address={address} />
        </section>

        {prompts.length > 0 ? (
          <section aria-labelledby="assistant-questions" className="space-y-3">
            <h2 id="assistant-questions" className="font-display text-lg font-semibold">
              Questions to try
            </h2>
            <p className="text-sm text-muted">
              Copy one into a chat with your assistant. Or just ask in your own words.
            </p>
            <ul className="divide-y divide-border overflow-hidden rounded-2xl border border-border bg-surface">
              {prompts.map((p) => (
                <li key={p.name} className="flex items-start gap-4 px-5 py-4">
                  <span className="min-w-0 flex-1">
                    <span className="block font-medium text-foreground">{p.title}</span>
                    <span className="mt-0.5 block text-sm text-muted">{pasteablePrompt(p.text)}</span>
                  </span>
                  <CopyButton value={pasteablePrompt(p.text)} />
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        <section aria-labelledby="assistant-connected" className="space-y-3">
          <h2 id="assistant-connected" className="font-display text-lg font-semibold">
            Your connected assistants
          </h2>
          <p className="text-sm text-muted">
            These are connected to your Alfa login, for every company you&apos;re part of.
            Disconnect one to stop it reading anything straight away.
          </p>
          <AssistantConnections
            connections={connections.map((c) => ({
              id: c.id,
              name: c.name ?? "AI assistant",
              used: usedAgo(c.lastUsedAt, now),
              disconnected: c.disconnectedAt != null,
              allowDrafts: c.allowDrafts,
            }))}
            canDraft={canDraft}
          />
        </section>
      </div>
    </div>
  );
}
