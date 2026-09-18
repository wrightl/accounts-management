import type { z } from "zod";

export const FORM_FIELD_ERROR_SUMMARY = "Fix the highlighted fields";

/** First message per Zod path, joined with `.` (e.g. `lines.0.quantity`). */
export function zodFieldErrors(
  error: z.ZodError,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.length > 0 ? issue.path.join(".") : "_form";
    if (out[key] == null) {
      out[key] = issue.message;
    }
  }
  return out;
}

export type ParseOk<T> = { ok: true; data: T };
export type ParseFail = {
  ok: false;
  fieldErrors: Record<string, string>;
  error: string;
};

export function parseWithFieldErrors<T>(
  schema: z.ZodType<T>,
  raw: unknown,
): ParseOk<T> | ParseFail {
  const parsed = schema.safeParse(raw);
  if (parsed.success) {
    return { ok: true, data: parsed.data };
  }
  return {
    ok: false,
    fieldErrors: zodFieldErrors(parsed.error),
    error: FORM_FIELD_ERROR_SUMMARY,
  };
}
