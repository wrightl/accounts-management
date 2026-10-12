import { z } from "zod";
import { parseWithFieldErrors, type ParseFail, type ParseOk } from "@/lib/validation/field-errors";

const optionalDate = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v ? v : null))
  .refine((v) => v === null || /^\d{4}-\d{2}-\d{2}$/.test(v), "Enter a valid date");

/** Directors one per line; blank lines dropped. Null when there are none. */
export const directorNamesSchema = z
  .string()
  .optional()
  .transform((v) =>
    (v ?? "")
      .split(/\r?\n/)
      .map((line) => line.trim())
      .filter(Boolean),
  )
  .refine((names) => names.length <= 20, "List up to 20 directors")
  .refine((names) => names.every((n) => n.length <= 120), "Each name must be 120 characters or fewer")
  .transform((names) => (names.length ? names.join("\n") : null));

export const companiesHouseDetailsSchema = z.object({
  incorporatedOn: optionalDate,
  accountsDue: optionalDate,
  confirmationStatementDue: optionalDate,
  directorNames: directorNamesSchema,
});

export type CompaniesHouseDetails = z.infer<typeof companiesHouseDetailsSchema>;

export function companiesHouseDetailsFromFormData(formData: FormData): Record<string, unknown> {
  return {
    incorporatedOn: formData.get("incorporatedOn") ?? "",
    accountsDue: formData.get("accountsDue") ?? "",
    confirmationStatementDue: formData.get("confirmationStatementDue") ?? "",
    directorNames: formData.get("directorNames") ?? "",
  };
}

export function parseCompaniesHouseDetails(
  raw: unknown,
): ParseOk<CompaniesHouseDetails> | ParseFail {
  return parseWithFieldErrors(companiesHouseDetailsSchema, raw);
}

/** Directors stored one per line, as a list. */
export function splitDirectorNames(value: string | null | undefined): string[] {
  return (value ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
}
