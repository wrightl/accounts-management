import { describe, expect, it } from "vitest";
import { ROLE_TOKENS, convertDesign } from "@/lib/pdf/designer/convert";
import { TOKEN_PATTERN, designField } from "@/lib/pdf/designer/fields";
import {
  parseTemplateDesign,
  type TemplateDesign,
  type TextElement,
} from "@/lib/pdf/designer/schema";
import { starterDesign } from "@/lib/pdf/designer/starters";
import type { DocumentKind } from "@/lib/pdf/templates/views";

const KINDS: DocumentKind[] = ["invoice", "quote", "credit-note"];

function texts(design: TemplateDesign): string[] {
  return design.elements.flatMap((element) => (element.type === "text" ? [element.content] : []));
}

/** A blank design with one text box holding `content`. */
function withText(content: string): TemplateDesign {
  const design = starterDesign("blank", "invoice");
  const box: TextElement = {
    id: "box",
    type: "text",
    x: 40,
    y: 40,
    w: 200,
    h: 40,
    repeat: false,
    content,
    fontFamily: "Outfit",
    fontSize: 10,
    bold: false,
    colour: "#111827",
    align: "left",
    lineHeight: 1.4,
    letterSpacing: 0,
    uppercase: false,
    fill: null,
    padding: 0,
  };
  return { ...design, elements: [box, ...design.elements] };
}

function converted(content: string, from: DocumentKind, to: DocumentKind): string | undefined {
  return texts(convertDesign(withText(content), from, to))[0];
}

describe("converting a design to another kind of document", () => {
  it("maps only placeholders that exist", () => {
    for (const kind of KINDS) {
      for (const token of Object.values(ROLE_TOKENS[kind])) {
        expect(designField(token, kind), token).toBeDefined();
      }
    }
  });

  for (const starter of ["clean", "bold"]) {
    for (const from of KINDS) {
      for (const to of KINDS.filter((kind) => kind !== from)) {
        it(`turns the ${starter} ${from} starter into a valid ${to} design`, () => {
          const source = starterDesign(starter, from);
          const result = convertDesign(source, from, to);
          expect(parseTemplateDesign(result).ok).toBe(true);

          for (const content of texts(result)) {
            for (const match of content.matchAll(TOKEN_PATTERN)) {
              expect(designField(match[1], to), `${match[1]} in "${content}"`).toBeDefined();
            }
          }
          // Everything but text is carried over untouched.
          expect(result.elements.filter((element) => element.type !== "text")).toEqual(
            source.elements.filter((element) => element.type !== "text"),
          );
          expect(result.page).toEqual(source.page);
        });
      }
    }
  }

  it("switches placeholders to the new kind's", () => {
    expect(
      converted(
        "No {{invoice.number}}\nDate {{invoice.issueDate}}\nDue {{invoice.dueDate}}\n{{invoice.notes}}",
        "invoice",
        "quote",
      ),
    ).toBe("No {{quote.number}}\nDate {{quote.issueDate}}\nDue {{quote.validUntil}}\n{{quote.terms}}");
    expect(converted("{{quote.validUntil}} {{quote.terms}}", "quote", "invoice")).toBe(
      "{{invoice.dueDate}} {{invoice.notes}}",
    );
    expect(converted("{{ creditNote.number }}", "credit-note", "quote")).toBe("{{quote.number}}");
  });

  it("drops a line whose only placeholder has no match, and keeps shared ones", () => {
    expect(
      converted("No {{invoice.number}}\nDue Date: {{invoice.dueDate}}\n{{client.name}}", "invoice", "credit-note"),
    ).toBe("No {{creditNote.number}}\n{{client.name}}");
    expect(converted("{{quote.version}} for {{client.name}}", "quote", "invoice")).toBe(
      " for {{client.name}}",
    );
  });

  it("removes a text box left with nothing in it", () => {
    const result = convertDesign(withText("{{creditNote.reason}}"), "credit-note", "invoice");
    expect(texts(result)).toEqual([]);
    expect(parseTemplateDesign(result).ok).toBe(true);
  });

  it("rewords the document's name, keeping its capitals", () => {
    expect(converted("INVOICE\nInvoice No :\nyour invoice", "invoice", "quote")).toBe(
      "QUOTE\nQuote No :\nyour quote",
    );
    expect(converted("INVOICE\nInvoice No :", "invoice", "credit-note")).toBe(
      "CREDIT NOTE\nCredit note No :",
    );
    expect(converted("Credit Note\ncredit-note", "credit-note", "invoice")).toBe("Invoice\ninvoice");
  });

  it("leaves other words and the new placeholders alone", () => {
    expect(converted("Invoiced to :\nInvoices", "invoice", "quote")).toBe("Invoiced to :\nInvoices");
    // Only the old kind's name is reworded: "quote" here is not the document.
    expect(converted("Please quote {{invoice.number}}", "invoice", "quote")).toBe(
      "Please quote {{quote.number}}",
    );
    expect(converted("Quote {{quote.number}}", "quote", "invoice")).toBe("Invoice {{invoice.number}}");
  });

  it("returns the design as it is for the same kind", () => {
    const design = starterDesign("clean", "quote");
    expect(convertDesign(design, "quote", "quote")).toBe(design);
  });
});
