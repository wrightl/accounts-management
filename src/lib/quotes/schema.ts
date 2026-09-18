import { z } from "zod";
import {
  documentLinesSchema,
  parseDocumentLinesJson,
} from "@/lib/documents/schema";
import { todayIsoDate } from "@/lib/dates";
import { parseWithFieldErrors } from "@/lib/validation/field-errors";

const optionalNotes = z
  .string()
  .optional()
  .or(z.literal(""))
  .transform((v) => (v === "" || !v ? null : v));

export const quoteSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1, "Choose a client")
    .uuid("Choose a client from the list"),
  issueDate: z
    .string()
    .trim()
    .min(1, "Issue date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid issue date"),
  validUntil: z
    .string()
    .optional()
    .or(z.literal(""))
    .transform((v) => (v === "" || !v ? null : v)),
  notes: optionalNotes,
  lines: documentLinesSchema,
});

export type QuoteParsed = z.infer<typeof quoteSchema>;

export function quoteRawFromFormData(formData: FormData): Record<string, unknown> {
  return {
    clientId: formData.get("clientId"),
    issueDate: formData.get("issueDate") || todayIsoDate(),
    validUntil: formData.get("validUntil") ?? "",
    notes: formData.get("notes") ?? "",
    lines: parseDocumentLinesJson(formData.get("linesJson")),
  };
}

export function parseQuoteInput(raw: unknown) {
  return parseWithFieldErrors(quoteSchema, raw);
}

export const sendQuoteSchema = z.object({
  to: z.string().trim().email("Enter a valid email address"),
  message: z.string().trim().min(1, "Message is required"),
});

export function sendQuoteRawFromFormData(formData: FormData): Record<string, unknown> {
  return {
    to: formData.get("to"),
    message: formData.get("message"),
  };
}

export function parseSendQuoteInput(raw: unknown) {
  return parseWithFieldErrors(sendQuoteSchema, raw);
}

export const declineQuoteSchema = z.object({
  category: z.string().trim().min(1, "Choose a reason category"),
  narrative: z.string().trim().min(1, "Enter a brief explanation"),
});

export function parseDeclineQuoteInput(raw: unknown) {
  return parseWithFieldErrors(declineQuoteSchema, raw);
}

export const publicDeclineQuoteSchema = z.object({
  narrative: z
    .string()
    .trim()
    .max(2000, "Message must be 2000 characters or fewer")
    .optional()
    .or(z.literal("")),
});

export function publicDeclineQuoteRawFromFormData(
  formData: FormData,
): Record<string, unknown> {
  return {
    narrative: formData.get("narrative") ?? "",
  };
}

export function parsePublicDeclineQuoteInput(raw: unknown) {
  return parseWithFieldErrors(publicDeclineQuoteSchema, raw);
}
