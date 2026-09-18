import { z } from "zod";
import { parseWithFieldErrors } from "@/lib/validation/field-errors";

const optionalText = z
  .string()
  .trim()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" ? null : (v ?? null)));

export const clientSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Enter a contact name")
    .max(200, "Contact name must be 200 characters or fewer"),
  companyName: optionalText.pipe(
    z.string().max(200, "Company name must be 200 characters or fewer").nullable(),
  ),
  email: z
    .union([
      z.literal(""),
      z.string().trim().email("Enter a valid email address"),
    ])
    .transform((v) => (v === "" ? null : v)),
  addressLines: optionalText,
  notes: optionalText,
});

export type ClientParsed = z.infer<typeof clientSchema>;

export function clientRawFromFormData(formData: FormData): Record<string, unknown> {
  return {
    name: formData.get("name"),
    companyName: formData.get("companyName") ?? "",
    email: formData.get("email") ?? "",
    addressLines: formData.get("addressLines") ?? "",
    notes: formData.get("notes") ?? "",
  };
}

export function parseClientInput(raw: unknown) {
  return parseWithFieldErrors(clientSchema, raw);
}
