import { fuzzyBestSimilarity, normalizeText } from "@/lib/bank/fuzzy";
import type { ParsedClient } from "@/lib/invoices/import/parse";

const COMPANY_SUFFIXES = new Set(["ltd", "limited", "llp", "plc", "the"]);

export function normalizeClientName(value: string | null | undefined): string {
  return normalizeText(value)
    .split(" ")
    .filter((word) => word && !COMPANY_SUFFIXES.has(word))
    .join(" ");
}

export interface ExistingClient {
  id: string;
  name: string;
  companyName: string | null;
  email: string | null;
}

export interface ClientSuggestion {
  clientId: string | null;
  basis: "email" | "name" | "similar" | null;
  /** A "similar" name is only offered: the user has to pick it. */
  preselect: boolean;
}

const FUZZY_THRESHOLD = 90;

/** Best existing client for a client in the file: same email, same name, then a similar name. */
export function suggestClient(
  client: ParsedClient,
  existing: ExistingClient[],
): ClientSuggestion {
  if (client.email) {
    const match = existing.find((c) => c.email?.toLowerCase() === client.email);
    if (match) return { clientId: match.id, basis: "email", preselect: true };
  }
  const names = [client.companyName, client.name]
    .map(normalizeClientName)
    .filter(Boolean);
  if (names.length === 0) return { clientId: null, basis: null, preselect: false };

  const namesOf = (c: ExistingClient) =>
    [c.companyName, c.name].map(normalizeClientName).filter(Boolean);
  const exact = existing.find((c) => namesOf(c).some((n) => names.includes(n)));
  if (exact) return { clientId: exact.id, basis: "name", preselect: true };

  let best: { id: string; score: number } | null = null;
  for (const candidate of existing) {
    const score = Math.max(
      ...names.map((n) => fuzzyBestSimilarity(n, namesOf(candidate))),
    );
    if (score >= FUZZY_THRESHOLD && score > (best?.score ?? 0)) {
      best = { id: candidate.id, score };
    }
  }
  return best
    ? { clientId: best.id, basis: "similar", preselect: false }
    : { clientId: null, basis: null, preselect: false };
}
