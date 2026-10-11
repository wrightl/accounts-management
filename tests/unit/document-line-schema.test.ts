import { describe, it, expect } from "vitest";
import { z } from "zod";
import { documentLineSchema, documentLinesSchema } from "@/lib/documents/schema";
import {
  FORM_FIELD_ERROR_SUMMARY,
  parseWithFieldErrors,
  zodFieldErrors,
} from "@/lib/validation/field-errors";

describe("documentLineSchema", () => {
  it("accepts a valid line", () => {
    const result = documentLineSchema.safeParse({
      description: "Consulting",
      quantity: 2,
      unitPricePounds: "100.00",
      vatRate: 20,
    });
    expect(result.success).toBe(true);
  });

  it("maps bad line quantity to lines.N.quantity path", () => {
    const schema = z.object({ lines: documentLinesSchema });
    const result = schema.safeParse({
      lines: [
        {
          description: "Consulting",
          quantity: 0,
          unitPricePounds: "50",
        },
      ],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(zodFieldErrors(result.error)["lines.0.quantity"]).toBe(
      "Quantity must be greater than 0",
    );
  });

  it("accepts fractional quantities up to 3 decimal places", () => {
    for (const quantity of [1.5, 0.25, 7.125, "2.5"]) {
      const result = documentLineSchema.safeParse({
        description: "Consulting day",
        quantity,
        unitPricePounds: "650",
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects quantities with more than 3 decimal places", () => {
    const schema = z.object({ lines: documentLinesSchema });
    const result = schema.safeParse({
      lines: [{ description: "Hours", quantity: 1.2345, unitPricePounds: "50" }],
    });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(zodFieldErrors(result.error)["lines.0.quantity"]).toBe(
      "Use at most 3 decimal places",
    );
  });

  it("accepts an optional line discount between 0 and 100%", () => {
    for (const discountPercent of [undefined, 0, 10, 12.5, 100]) {
      const result = documentLineSchema.safeParse({
        description: "Retainer",
        quantity: 1,
        unitPricePounds: "1000",
        discountPercent,
      });
      expect(result.success).toBe(true);
    }
  });

  it("rejects discounts outside 0–100% or with more than 2 decimal places", () => {
    const schema = z.object({ lines: documentLinesSchema });
    const cases: [number, string][] = [
      [-5, "Discount can't be negative"],
      [150, "Discount can't be more than 100%"],
      [12.345, "Use at most 2 decimal places"],
    ];
    for (const [discountPercent, message] of cases) {
      const result = schema.safeParse({
        lines: [
          { description: "Retainer", quantity: 1, unitPricePounds: "1000", discountPercent },
        ],
      });
      expect(result.success).toBe(false);
      if (result.success) continue;
      expect(zodFieldErrors(result.error)["lines.0.discountPercent"]).toBe(message);
    }
  });

  it("parseWithFieldErrors returns dotted line paths", () => {
    const schema = z.object({ lines: documentLinesSchema });
    const result = parseWithFieldErrors(schema, {
      lines: [{ description: "", quantity: 1, unitPricePounds: "10" }],
    });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(FORM_FIELD_ERROR_SUMMARY);
    expect(result.fieldErrors["lines.0.description"]).toBe("Enter a description");
  });
});
