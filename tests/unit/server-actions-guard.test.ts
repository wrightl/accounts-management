import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Every export of a "use server" module is an endpoint anyone can POST to,
 * whether or not the app imports it anywhere. So every exported action must
 * check who is calling: by calling one of these guards, or a function in the
 * same file that does. This reads the source rather than relying on each
 * action having its own test.
 */
const GUARDS = [
  "mutate",
  "mutateWide",
  "requireActionPermission",
  "requirePermission",
  "requireUser",
  "platformMutate",
];

/** Actions anyone may call, and why that's safe. */
const PUBLIC_ACTIONS: Record<string, string> = {
  "public-invoices.ts:markPublicInvoiceViewed": "found by the invoice's unguessable public token",
  "public-invoices.ts:startInvoiceCheckout": "found by the invoice's unguessable public token",
  "public-quotes.ts:markPublicQuoteViewed": "found by the quote's unguessable public token",
  "public-quotes.ts:acceptPublicQuote": "found by the quote's unguessable public token",
  "public-quotes.ts:declinePublicQuote": "found by the quote's unguessable public token",
  "signup-plan.ts:saveSignupPlanChoice": "only sets the caller's own sign-up cookie",
  "signup-plan.ts:writeSignupPlanCookie": "only sets the caller's own sign-up cookie",
  "signup-plan.ts:clearSignupPlanCookie": "only clears the caller's own sign-up cookie",
  "platform.ts:reportClientError": "error pages call it signed out; it only logs, and checks the session itself",
};

const ACTIONS_DIR = join(process.cwd(), "src/actions");

/** A top-level function or const, from its declaration to the next one. */
type Declaration = { name: string; exported: boolean; body: string };

function declarations(source: string): Declaration[] {
  const starts = [
    ...source.matchAll(
      /^(export\s+)?(?:(?:async\s+)?function\s+(\w+)|const\s+(\w+)\s*=)/gm,
    ),
  ];
  return starts.map((m, i) => ({
    name: (m[2] ?? m[3])!,
    exported: Boolean(m[1]) && m[2] !== undefined,
    body: source.slice(m.index, starts[i + 1]?.index ?? source.length),
  }));
}

/** Names in this file that check the caller, directly or through each other. */
function guardedNames(decls: Declaration[]): Set<string> {
  const guarded = new Set<string>();
  for (let changed = true; changed; ) {
    changed = false;
    const callees = [...GUARDS, ...guarded];
    for (const d of decls) {
      if (guarded.has(d.name)) continue;
      // Skip the declaration's own name so recursion can't vouch for itself.
      const body = d.body.slice(d.body.indexOf(d.name) + d.name.length);
      // A call, with or without type arguments: `mutate(` or `mutateWide<Result>(`.
      if (callees.some((g) => new RegExp(`\\b${g}\\s*(?:<[\\s\\S]*?>)?\\s*\\(`).test(body))) {
        guarded.add(d.name);
        changed = true;
      }
    }
  }
  return guarded;
}

const actions = readdirSync(ACTIONS_DIR)
  .filter((file) => file.endsWith(".ts"))
  .flatMap((file) => {
    const source = readFileSync(join(ACTIONS_DIR, file), "utf8");
    if (!/^["']use server["']/m.test(source)) return [];
    const decls = declarations(source);
    const guarded = guardedNames(decls);
    return decls
      .filter((d) => d.exported)
      .map((d) => ({ id: `${file}:${d.name}`, guarded: guarded.has(d.name) }));
  });

describe("server actions", () => {
  it("are all found", () => {
    expect(actions.length).toBeGreaterThan(150);
  });

  it.each(actions.filter((a) => !(a.id in PUBLIC_ACTIONS)))(
    "$id checks who is calling",
    ({ guarded }) => {
      expect(guarded).toBe(true);
    },
  );

  it("lists only public actions that still exist", () => {
    const ids = new Set(actions.map((a) => a.id));
    for (const id of Object.keys(PUBLIC_ACTIONS)) expect(ids).toContain(id);
  });
});
