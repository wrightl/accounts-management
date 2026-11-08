import { z } from "zod";
import { parseWithFieldErrors } from "@/lib/validation/field-errors";

/** Clerk's default minimum; Clerk still enforces its own rules on submit. */
export const PASSWORD_MIN_LENGTH = 8;

const newPassword = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Use at least ${PASSWORD_MIN_LENGTH} characters`)
  .max(72, "Use 72 characters or fewer");

const passwordsMatch = {
  check: (v: { newPassword: string; confirmPassword: string }) =>
    v.newPassword === v.confirmPassword,
  params: { path: ["confirmPassword"], message: "Passwords do not match" },
};

const changeSchema = z
  .object({
    currentPassword: z.string().min(1, "Enter your current password"),
    newPassword,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch.check, passwordsMatch.params);

const setSchema = z
  .object({ newPassword, confirmPassword: z.string() })
  .refine(passwordsMatch.check, passwordsMatch.params);

const emailSchema = z.object({
  email: z.string().trim().email("Enter a valid email address"),
});

const resetSchema = z
  .object({
    code: z
      .string()
      .transform((v) => v.replace(/\s+/g, ""))
      .pipe(z.string().regex(/^\d{6}$/, "Enter the 6 digit code from the email")),
    newPassword,
    confirmPassword: z.string(),
  })
  .refine(passwordsMatch.check, passwordsMatch.params);

function str(formData: FormData, key: string): string {
  const v = formData.get(key);
  return typeof v === "string" ? v : "";
}

/**
 * Change password while signed in. Users who signed up without a password
 * (for example with Google) set one without giving a current password.
 */
export function parsePasswordChange(formData: FormData, hasPassword: boolean) {
  const raw = {
    currentPassword: str(formData, "currentPassword"),
    newPassword: str(formData, "newPassword"),
    confirmPassword: str(formData, "confirmPassword"),
  };
  if (hasPassword) return parseWithFieldErrors(changeSchema, raw);
  const parsed = parseWithFieldErrors(setSchema, raw);
  return parsed.ok
    ? { ok: true as const, data: { ...parsed.data, currentPassword: undefined } }
    : parsed;
}

export function parseResetEmail(formData: FormData) {
  return parseWithFieldErrors(emailSchema, { email: str(formData, "email") });
}

export function parsePasswordReset(formData: FormData) {
  return parseWithFieldErrors(resetSchema, {
    code: str(formData, "code"),
    newPassword: str(formData, "newPassword"),
    confirmPassword: str(formData, "confirmPassword"),
  });
}

type ClerkErrorLike = {
  message?: unknown;
  longMessage?: unknown;
  errors?: { message?: unknown; longMessage?: unknown }[];
};

/** Best human message from a Clerk error (API response or ClerkError). */
export function clerkErrorMessage(err: unknown, fallback: string): string {
  if (!err || typeof err !== "object") return fallback;
  const e = err as ClerkErrorLike;
  const first = Array.isArray(e.errors) ? e.errors[0] : undefined;
  for (const candidate of [
    first?.longMessage,
    first?.message,
    e.longMessage,
    e.message,
  ]) {
    if (typeof candidate === "string" && candidate.trim()) return candidate;
  }
  return fallback;
}

/** Whether Clerk rejected the identifier because no account uses it. */
export function isIdentifierNotFound(err: unknown): boolean {
  if (!err || typeof err !== "object") return false;
  const e = err as { code?: unknown; errors?: { code?: unknown }[] };
  if (e.code === "form_identifier_not_found") return true;
  return (
    Array.isArray(e.errors) &&
    e.errors.some((x) => x?.code === "form_identifier_not_found")
  );
}
