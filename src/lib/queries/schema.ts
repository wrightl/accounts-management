import { z } from "zod";
import { QUERY_RECORD_KINDS } from "./status";

export const MAX_QUERY_SUBJECT_LENGTH = 200;
export const MAX_QUERY_BODY_LENGTH = 5000;

const body = z
  .string()
  .trim()
  .min(1, "Enter a message")
  .max(MAX_QUERY_BODY_LENGTH, `Messages can be up to ${MAX_QUERY_BODY_LENGTH} characters`);

export const raiseQuerySchema = z
  .object({
    subject: z
      .string()
      .trim()
      .min(1, "Enter a subject")
      .max(MAX_QUERY_SUBJECT_LENGTH, `Subjects can be up to ${MAX_QUERY_SUBJECT_LENGTH} characters`),
    body,
    recordKind: z.enum(QUERY_RECORD_KINDS).nullable(),
    recordId: z.string().uuid().nullable(),
  })
  .refine((v) => (v.recordKind === null) === (v.recordId === null), {
    message: "Choose a record, or raise a general question",
    path: ["recordId"],
  });

export const replyToQuerySchema = z.object({ body });

export type RaiseQueryInput = z.infer<typeof raiseQuerySchema>;
