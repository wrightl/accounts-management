import { z } from "zod";
import {
  FORM_FIELD_ERROR_SUMMARY,
  parseWithFieldErrors,
  type ParseFail,
  type ParseOk,
} from "@/lib/validation/field-errors";

const optionalUserId = z
  .string()
  .uuid("Select a valid user")
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" || !v ? null : v));

export const shareholderFieldsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a name")
    .max(200, "Name must be 200 characters or fewer"),
  shareCount: z.coerce
    .number({ error: "Enter number of shares" })
    .int("Share count must be a whole number")
    .positive("Share count must be a positive integer"),
  userId: optionalUserId,
});

export type ShareholderParsed = z.infer<typeof shareholderFieldsSchema>;

export function shareholderRawFromFormData(
  formData: FormData,
): Record<string, unknown> {
  return {
    name: formData.get("name"),
    shareCount: formData.get("shareCount"),
    userId: formData.get("userId") ?? "",
  };
}

export function parseShareholderInput(
  raw: unknown,
): ParseOk<ShareholderParsed> | ParseFail {
  return parseWithFieldErrors(shareholderFieldsSchema, raw);
}

/** Empty string clears total shares; otherwise must be a positive integer. */
export function parseTotalSharesInput(
  raw: unknown,
): ParseOk<{ totalShares: number | null }> | ParseFail {
  const value =
    typeof raw === "object" && raw && "totalShares" in raw
      ? String((raw as { totalShares: unknown }).totalShares ?? "").trim()
      : String(raw ?? "").trim();

  if (value === "") {
    return { ok: true, data: { totalShares: null } };
  }

  const parsed = z.coerce
    .number({ error: "Total shares must be a positive integer" })
    .int("Total shares must be a positive integer")
    .positive("Total shares must be a positive integer")
    .safeParse(value);

  if (!parsed.success) {
    return {
      ok: false,
      fieldErrors: { totalShares: "Total shares must be a positive integer" },
      error: FORM_FIELD_ERROR_SUMMARY,
    };
  }

  return { ok: true, data: { totalShares: parsed.data } };
}

export function totalSharesRawFromFormData(
  formData: FormData,
): Record<string, unknown> {
  return { totalShares: formData.get("totalShares") ?? "" };
}
