import { describe, it, expect } from "vitest";
import { z } from "zod";
import {
  FORM_FIELD_ERROR_SUMMARY,
  parseWithFieldErrors,
  zodFieldErrors,
} from "@/lib/validation/field-errors";

describe("zodFieldErrors", () => {
  it("maps first message per path", () => {
    const schema = z.object({
      name: z.string().min(1, "Enter a name"),
      email: z.string().email("Bad email"),
    });
    const result = schema.safeParse({ name: "", email: "nope" });
    expect(result.success).toBe(false);
    if (result.success) return;
    const errors = zodFieldErrors(result.error);
    expect(errors.name).toBe("Enter a name");
    expect(errors.email).toBe("Bad email");
  });

  it("joins nested paths with dots", () => {
    const schema = z.object({
      lines: z.array(
        z.object({ quantity: z.number().min(1, "Qty required") }),
      ),
    });
    const result = schema.safeParse({ lines: [{ quantity: 0 }] });
    expect(result.success).toBe(false);
    if (result.success) return;
    expect(zodFieldErrors(result.error)["lines.0.quantity"]).toBe(
      "Qty required",
    );
  });
});

describe("parseWithFieldErrors", () => {
  it("returns data on success", () => {
    const schema = z.object({ name: z.string().min(1) });
    expect(parseWithFieldErrors(schema, { name: "Acme" })).toEqual({
      ok: true,
      data: { name: "Acme" },
    });
  });

  it("returns fieldErrors and summary on failure", () => {
    const schema = z.object({ name: z.string().min(1, "Enter a name") });
    const result = parseWithFieldErrors(schema, { name: "" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.error).toBe(FORM_FIELD_ERROR_SUMMARY);
    expect(result.fieldErrors.name).toBe("Enter a name");
  });
});
