import { z } from "zod";
import { TENANT_ROLES } from "@/lib/roles";
import { parseWithFieldErrors } from "@/lib/validation/field-errors";

const roleSchema = z.enum(TENANT_ROLES, {
  error: "Select a role",
});

const optionalName = z
  .union([z.literal(""), z.string().trim().max(200, "Name must be 200 characters or fewer")])
  .optional()
  .transform((v) => {
    if (v == null || v === "") return undefined;
    return v;
  });

export const inviteUserSchema = z.object({
  email: z
    .string({ error: "Enter an email address" })
    .trim()
    .min(1, "Enter an email address")
    .email("Enter a valid email address"),
  name: optionalName,
  role: roleSchema,
});

export const updateUserSchema = z.object({
  userId: z.string().uuid("Invalid user"),
  name: optionalName,
  email: z
    .union([
      z.literal(""),
      z.undefined(),
      z.string().trim().email("Enter a valid email address"),
    ])
    .transform((v) => (v === "" || v == null ? undefined : v)),
  role: roleSchema,
});

export const roleUpdateSchema = z.object({
  userId: z.string().uuid("Invalid user"),
  role: roleSchema,
});

export const profileUpdateSchema = z.object({
  name: optionalName,
});

export type InviteUserParsed = z.infer<typeof inviteUserSchema>;
export type UpdateUserParsed = z.infer<typeof updateUserSchema>;
export type RoleUpdateParsed = z.infer<typeof roleUpdateSchema>;
export type ProfileUpdateParsed = z.infer<typeof profileUpdateSchema>;

export function inviteUserRawFromFormData(
  formData: FormData,
): Record<string, unknown> {
  return {
    email: formData.get("email"),
    name: formData.get("name") || undefined,
    role: formData.get("role") ?? "pending",
  };
}

export function updateUserRawFromFormData(
  userId: string,
  formData: FormData,
): Record<string, unknown> {
  return {
    userId,
    name: formData.get("name") || undefined,
    email: formData.get("email") || undefined,
    role: formData.get("role"),
  };
}

export function roleUpdateRawFromFormData(
  userId: string,
  formData: FormData,
): Record<string, unknown> {
  return {
    userId,
    role: formData.get("role"),
  };
}

export function profileUpdateRawFromFormData(
  formData: FormData,
): Record<string, unknown> {
  return {
    name: formData.get("name") || undefined,
  };
}

export function parseInviteUserInput(raw: unknown) {
  return parseWithFieldErrors(inviteUserSchema, raw);
}

export function parseUpdateUserInput(raw: unknown) {
  return parseWithFieldErrors(updateUserSchema, raw);
}

export function parseRoleUpdateInput(raw: unknown) {
  return parseWithFieldErrors(roleUpdateSchema, raw);
}

export function parseProfileUpdateInput(raw: unknown) {
  return parseWithFieldErrors(profileUpdateSchema, raw);
}
