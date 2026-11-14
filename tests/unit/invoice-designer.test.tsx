import React from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { extractPdfText } from "@/lib/expenses/receipt-pdf";
import {
  contentParts,
  designFields,
  fillContent,
  sampleDesignData,
} from "@/lib/pdf/designer/fields";
import { designAssetIds } from "@/lib/pdf/designer/assets";
import { DesignDocument } from "@/lib/pdf/designer/render-pdf";
import {
  designTable,
  elementPlacement,
  parseTemplateDesign,
  type TemplateDesign,
} from "@/lib/pdf/designer/schema";
import { DESIGN_STARTERS, starterDesign } from "@/lib/pdf/designer/starters";
import { renderElement } from "@/lib/pdf/templates/render";
import { DOCUMENT_KINDS } from "@/lib/pdf/templates/views";
import {
  createElement,
  designColours,
  designerReducer,
  initialDesignerState,
} from "@/components/invoice-designer/state";

const SAMPLE_DESIGN_DATA = sampleDesignData("invoice");

function pageCount(bytes: Uint8Array): number {
  return (Buffer.from(bytes).toString("latin1").match(/\/Type\s*\/Page\b/g) ?? []).length;
}

describe("design schema", () => {
  it("accepts every starter design", () => {
    for (const starter of DESIGN_STARTERS) {
      for (const kind of DOCUMENT_KINDS) {
        const parsed = parseTemplateDesign(starter.build(kind));
        expect(parsed, `${starter.key} ${kind}`).toMatchObject({ ok: true });
      }
    }
  });

  it("needs exactly one line items table", () => {
    const design = starterDesign("blank", "invoice");
    const table = designTable(design);
    expect(
      parseTemplateDesign({
        ...design,
        elements: design.elements.filter((element) => element.id !== table.id),
      }),
    ).toMatchObject({ ok: false, error: expect.stringContaining("line items") });
    expect(
      parseTemplateDesign({
        ...design,
        elements: [...design.elements, { ...table, id: "second" }],
      }),
    ).toMatchObject({ ok: false });
  });

  it("rejects colours that aren't hex, unknown fonts and tables above the top margin", () => {
    const design = starterDesign("clean", "invoice");
    const table = designTable(design);
    const withTable = (patch: object): TemplateDesign => ({
      ...design,
      elements: design.elements.map((element) =>
        element.id === table.id ? ({ ...element, ...patch } as typeof element) : element,
      ),
    });
    expect(parseTemplateDesign(withTable({ rowColour: "red" })).ok).toBe(false);
    expect(parseTemplateDesign(withTable({ fontFamily: "Comic Sans" })).ok).toBe(false);
    expect(parseTemplateDesign(withTable({ y: 10 })).ok).toBe(false);
    expect(parseTemplateDesign({ ...design, version: 2 }).ok).toBe(false);
    expect(parseTemplateDesign(null).ok).toBe(false);
  });

  it("places elements by where they start relative to the table", () => {
    const design = starterDesign("clean", "invoice");
    const table = designTable(design);
    const byId = (id: string) => design.elements.find((element) => element.id === id)!;
    expect(elementPlacement(byId("title"), table)).toBe("above");
    expect(elementPlacement(byId("totals"), table)).toBe("below");
    expect(elementPlacement(byId("footer"), table)).toBe("repeat");
    expect(elementPlacement(table, table)).toBe("table");
  });

  it("lists the uploaded pictures a design uses", () => {
    const design = starterDesign("blank", "invoice");
    const assetId = "0b0e2a52-3f3e-4a3e-9a51-0d6f6a0a1c11";
    design.elements.push(
      { ...createElement({ kind: "image", assetId }, 10, 10) },
      { ...createElement({ kind: "image", assetId }, 50, 10) },
      { ...createElement({ kind: "image" }, 90, 10) },
    );
    expect(designAssetIds(design)).toEqual([assetId]);
  });
});

describe("design fields", () => {
  it("resolves every field for the sample document of each kind", () => {
    for (const kind of DOCUMENT_KINDS) {
      const fields = designFields(kind);
      for (const field of fields) {
        expect(field.resolve(sampleDesignData(kind)), `${kind} ${field.token}`).not.toBe("");
      }
      expect(new Set(fields.map((field) => field.token)).size).toBe(fields.length);
    }
  });

  it("offers each kind its own document details and total wording", () => {
    const labels = (kind: (typeof DOCUMENT_KINDS)[number]) =>
      designFields(kind).map((field) => field.label);
    expect(labels("invoice")).toEqual(expect.arrayContaining(["Invoice number", "Due date", "Total due"]));
    expect(labels("quote")).toEqual(
      expect.arrayContaining(["Quote number", "Valid until", "Version", "Quote total"]),
    );
    expect(labels("quote")).not.toContain("Invoice number");
    expect(labels("credit-note")).toEqual(
      expect.arrayContaining([
        "Credit note number",
        "Credited invoice number",
        "Reason for credit",
        "Total credited",
      ]),
    );
  });

  it("leaves another kind's placeholder as typed", () => {
    expect(fillContent("{{invoice.number}}", sampleDesignData("quote"))).toBe("{{invoice.number}}");
    expect(fillContent("{{quote.number}}", sampleDesignData("quote"))).toBe("Q-2026-0017");
  });

  it("fills placeholders and leaves unknown ones alone", () => {
    expect(fillContent("Invoice No : {{invoice.number}}", SAMPLE_DESIGN_DATA)).toBe(
      "Invoice No : INV-2026-0042",
    );
    expect(fillContent("Due {{ invoice.dueDate }}", SAMPLE_DESIGN_DATA)).toBe("Due 12/02/2026");
    expect(fillContent("{{not.a.field}}", SAMPLE_DESIGN_DATA)).toBe("{{not.a.field}}");
  });

  it("drops a line whose placeholders are all empty, and keeps plain lines", () => {
    const data = {
      ...SAMPLE_DESIGN_DATA,
      company: { ...SAMPLE_DESIGN_DATA.company, vatNumber: null },
    };
    expect(fillContent("Harbour\nVAT no: {{company.vatNumber}}\n\nThanks", data)).toBe(
      "Harbour\n\nThanks",
    );
  });

  it("splits content into text and fields", () => {
    expect(contentParts("No: {{invoice.number}}!", "invoice").map((part) => part.kind)).toEqual([
      "text",
      "field",
      "text",
    ]);
  });
});

describe("design PDF", () => {
  it("draws a design with its placeholders filled in", async () => {
    const bytes = await renderElement(
      <DesignDocument design={starterDesign("bold", "invoice")} data={SAMPLE_DESIGN_DATA} images={{}} />,
    );
    const text = await extractPdfText(Buffer.from(bytes));
    expect(text).not.toContain("{{");
    for (const expected of [
      "INV-2026-0042",
      "13/01/2026",
      "Northfield Partners",
      "10 High Street",
      "Harbour Studio Ltd",
      "Workshop planning and design",
      "£2,844.00",
      "Sort code: 60-83-71",
      "Thank you for your business.",
    ]) {
      expect(text, expected).toContain(expected);
    }
    expect(pageCount(bytes)).toBe(1);
  });

  it("draws quote and credit note designs with their own details", async () => {
    for (const starter of DESIGN_STARTERS) {
      const quote = await extractPdfText(
        Buffer.from(
          await renderElement(
            <DesignDocument
              design={starter.build("quote")}
              data={sampleDesignData("quote")}
              images={{}}
            />,
          ),
        ),
      );
      expect(quote, starter.key).not.toContain("{{");
      expect(quote, starter.key).toContain("Quote total");
      expect(quote, starter.key).not.toContain("Total due");

      const creditNote = await extractPdfText(
        Buffer.from(
          await renderElement(
            <DesignDocument
              design={starter.build("credit-note")}
              data={sampleDesignData("credit-note")}
              images={{}}
            />,
          ),
        ),
      );
      expect(creditNote, starter.key).not.toContain("{{");
      expect(creditNote, starter.key).toContain("Total credited");
    }

    const quote = await extractPdfText(
      Buffer.from(
        await renderElement(
          <DesignDocument
            design={starterDesign("clean", "quote")}
            data={sampleDesignData("quote")}
            images={{}}
          />,
        ),
      ),
    );
    for (const expected of ["Q-2026-0017", "05/02/2026", "Half is payable on acceptance"]) {
      expect(quote, expected).toContain(expected);
    }

    const creditNote = await extractPdfText(
      Buffer.from(
        await renderElement(
          <DesignDocument
            design={starterDesign("clean", "credit-note")}
            data={sampleDesignData("credit-note")}
            images={{}}
          />,
        ),
      ),
    );
    for (const expected of ["CN-2026-0003", "INV-2026-0042", "Workshop postponed"]) {
      expect(creditNote, expected).toContain(expected);
    }
  });

  it("carries a long invoice onto further pages with the totals after the last line", async () => {
    const lines = Array.from({ length: 45 }, (_, i) => ({
      description: `Line ${i + 1}`,
      quantity: 1,
      unitPricePence: 1000,
    }));
    const bytes = await renderElement(
      <DesignDocument
        design={starterDesign("clean", "invoice")}
        data={{ ...SAMPLE_DESIGN_DATA, lines }}
        images={{}}
      />,
    );
    expect(pageCount(bytes)).toBeGreaterThan(1);
    const text = await extractPdfText(Buffer.from(bytes));
    expect(text.indexOf("Line 45")).toBeGreaterThan(-1);
    expect(text.indexOf("Total due")).toBeGreaterThan(text.indexOf("Line 45"));
  });
});

describe("designer state", () => {
  const start = () => initialDesignerState("Mine", starterDesign("clean", "invoice"));

  it("adds an element, selects it and can undo and redo", () => {
    const added = designerReducer(start(), {
      type: "add",
      element: createElement({ kind: "field", token: "invoice.number" }, 100, 100),
    });
    expect(added.design.elements).toHaveLength(start().design.elements.length + 1);
    expect(added.selected).toHaveLength(1);
    expect(added.dirty).toBe(true);

    const undone = designerReducer(added, { type: "undo" });
    expect(undone.design.elements).toHaveLength(start().design.elements.length);
    expect(undone.selected).toEqual([]);
    expect(designerReducer(undone, { type: "redo" }).design).toEqual(added.design);
  });

  it("never removes or duplicates the line items table", () => {
    const state = start();
    const table = designTable(state.design);
    expect(designerReducer(state, { type: "remove", ids: [table.id] })).toBe(state);
    expect(designerReducer(state, { type: "duplicate", ids: [table.id] })).toBe(state);
  });

  it("keeps the table below the top margin", () => {
    const state = start();
    const table = designTable(state.design);
    const moved = designerReducer(state, {
      type: "patch",
      ids: [table.id],
      change: (element) => ({ ...element, y: 0 }),
    });
    expect(designTable(moved.design).y).toBe(state.design.page.marginTop);
  });

  it("records one undo step for a whole drag", () => {
    const state = start();
    let dragging = state;
    for (const x of [50, 60, 70]) {
      dragging = designerReducer(dragging, {
        type: "patch",
        ids: ["title"],
        record: false,
        change: (element) => ({ ...element, x }),
      });
    }
    expect(dragging.past).toHaveLength(0);
    const dropped = designerReducer(dragging, { type: "checkpoint", before: state.design });
    expect(dropped.past).toHaveLength(1);
    expect(designerReducer(dropped, { type: "undo" }).design).toBe(state.design);
  });

  it("changes a colour everywhere it is used", () => {
    const state = start();
    expect(designColours(state.design)).toContain("#6b7280");
    const recoloured = designerReducer(state, { type: "recolour", from: "#6B7280", to: "#ff0000" });
    expect(designColours(recoloured.design)).not.toContain("#6b7280");
    expect(designColours(recoloured.design)).toContain("#ff0000");
    expect(parseTemplateDesign(recoloured.design).ok).toBe(true);
  });

  it("measuring the table is not an edit", () => {
    const state = start();
    const measured = designerReducer(state, { type: "measureTable", height: 141 });
    expect(designTable(measured.design).h).toBe(141);
    expect(measured.dirty).toBe(false);
    expect(measured.past).toHaveLength(0);
  });

  it("makes new elements that fit the schema", () => {
    const design = starterDesign("blank", "invoice");
    design.elements.push(
      createElement({ kind: "text" }, 10, 10),
      createElement({ kind: "field", token: "client.address" }, 10, 40),
      createElement({ kind: "image" }, 10, 100),
      createElement({ kind: "icon", name: "phone" }, 10, 200),
      createElement({ kind: "shape", shape: "line" }, 10, 230),
      createElement({ kind: "shape", shape: "ellipse" }, 2000, 2000),
    );
    expect(parseTemplateDesign(design)).toMatchObject({ ok: true });
  });
});
