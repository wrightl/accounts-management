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
      "Quantity must be at least 1",
    );
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
