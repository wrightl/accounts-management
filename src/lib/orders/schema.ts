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

export const orderSchema = z.object({
  clientId: z
    .string()
    .trim()
    .min(1, "Choose a client")
    .uuid("Choose a client"),
  issueDate: z
    .string()
    .trim()
    .min(1, "Issue date is required")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid issue date"),
  notes: optionalNotes,
  lines: documentLinesSchema,
});

export type OrderParsed = z.infer<typeof orderSchema>;

export function orderRawFromFormData(formData: FormData): Record<string, unknown> {
  return {
    clientId: formData.get("clientId"),
    issueDate: formData.get("issueDate") || todayIsoDate(),
    notes: formData.get("notes") ?? "",
    lines: parseDocumentLinesJson(formData.get("linesJson")),
  };
}

export function parseOrderInput(raw: unknown) {
  return parseWithFieldErrors(orderSchema, raw);
}

export const createInvoiceFromOrderSchema = z.object({
  mode: z.enum(["milestone", "remaining", "part"], {
    error: "Choose what to invoice",
  }),
  milestoneId: z
    .string()
    .uuid("Select a payment milestone")
    .optional()
    .or(z.literal("")),
  partMode: z.enum(["amount", "percent"]).optional(),
  amountPounds: z.string().optional(),
  percent: z.string().optional(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Enter a valid due date")
    .optional()
    .or(z.literal("")),
});

export function createInvoiceFromOrderRawFromFormData(
  formData: FormData,
): Record<string, unknown> {
  return {
    mode: formData.get("mode"),
    milestoneId: formData.get("milestoneId") ?? "",
    partMode: formData.get("partMode") ?? undefined,
    amountPounds: formData.get("amountPounds") ?? undefined,
    percent: formData.get("percent") ?? undefined,
    dueDate: formData.get("dueDate") ?? "",
  };
}

export function parseCreateInvoiceFromOrderInput(raw: unknown) {
  return parseWithFieldErrors(createInvoiceFromOrderSchema, raw);
}
