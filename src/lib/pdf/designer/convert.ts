import { TOKEN_PATTERN, designFields, fieldToken } from "@/lib/pdf/designer/fields";
import type { DesignElement, TemplateDesign } from "@/lib/pdf/designer/schema";
import type { DocumentKind } from "@/lib/pdf/templates/views";

/** Longest text a design's text box can hold (see `textElement` in the schema). */
const MAX_CONTENT = 2000;

type FieldRole = "number" | "issueDate" | "secondDate" | "notes";

/**
 * The placeholders that mean the same thing on each kind of document. A kind
 * with no entry for a role has nothing to stand in for it.
 */
export const ROLE_TOKENS: Record<DocumentKind, Partial<Record<FieldRole, string>>> = {
  invoice: {
    number: "invoice.number",
    issueDate: "invoice.issueDate",
    secondDate: "invoice.dueDate",
    notes: "invoice.notes",
  },
  quote: {
    number: "quote.number",
    issueDate: "quote.issueDate",
    secondDate: "quote.validUntil",
    notes: "quote.terms",
  },
  "credit-note": {
    number: "creditNote.number",
    issueDate: "creditNote.issueDate",
  },
};

/** How each kind of document is named in text, and the words it is written as. */
const KIND_WORDS: Record<DocumentKind, { name: string; pattern: string }> = {
  invoice: { name: "invoice", pattern: "invoice" },
  quote: { name: "quote", pattern: "quote" },
  "credit-note": { name: "credit note", pattern: "credit[ -]note" },
};

/** `name` written in the capitals `sample` uses: INVOICE, Invoice or invoice. */
function matchCase(name: string, sample: string): string {
  if (sample === sample.toUpperCase()) return name.toUpperCase();
  if (sample[0] === sample[0].toUpperCase()) return name[0].toUpperCase() + name.slice(1);
  return name;
}

/**
 * A copy of a design for another kind of document. The layout is unchanged.
 * In text, placeholders become the new kind's (invoice number → quote
 * number), ones the new kind has no match for are taken out along with a
 * line left holding none, and the document's name is reworded ("INVOICE" →
 * "QUOTE"). Other wording is left for the user.
 */
export function convertDesign(
  design: TemplateDesign,
  from: DocumentKind,
  to: DocumentKind,
): TemplateDesign {
  if (from === to) return design;

  // Every placeholder that belongs to the old kind alone, and what replaces it.
  const replacements = new Map<string, string | null>();
  for (const field of designFields(from)) {
    if (field.group === "Document") replacements.set(field.token, null);
  }
  for (const [role, token] of Object.entries(ROLE_TOKENS[from])) {
    replacements.set(token, ROLE_TOKENS[to][role as FieldRole] ?? null);
  }

  const tokenOrName = new RegExp(
    `${TOKEN_PATTERN.source}|\\b${KIND_WORDS[from].pattern}\\b`,
    "gi",
  );

  const convertLine = (line: string): string | null => {
    let lost = false;
    let kept = 0;
    const out = line.replace(TOKEN_PATTERN, (whole, token: string) => {
      if (!replacements.has(token)) {
        kept += 1;
        return whole;
      }
      const next = replacements.get(token);
      if (!next) {
        lost = true;
        return "";
      }
      kept += 1;
      return fieldToken(next);
    });
    if (lost && kept === 0) return null;
    // Placeholders are matched too so the name inside one is never reworded.
    return out.replace(tokenOrName, (match) =>
      match.startsWith("{{") ? match : matchCase(KIND_WORDS[to].name, match),
    );
  };

  const elements = design.elements.flatMap((element): DesignElement[] => {
    if (element.type !== "text") return [element];
    const content = element.content
      .split("\n")
      .flatMap((line) => convertLine(line) ?? [])
      .join("\n")
      .slice(0, MAX_CONTENT);
    // A box that held only what the new kind doesn't have would be left blank.
    if (content.trim() === "" && element.content.trim() !== "") return [];
    return [{ ...element, content }];
  });

  return { ...design, elements };
}
