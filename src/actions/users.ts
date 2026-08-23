"use server";

import { eq } from "drizzle-orm";
import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { users, reimbursements } from "@/db/schema";
import { clientEnv, isAuthConfigured } from "@/env";
import { mutate } from "@/lib/mutate";
import { isRole, type Role } from "@/lib/roles";
import { countAdminUsers, findUserByEmail, normalizeEmail } from "@/lib/users";
import type { ActionResult } from "@/actions/result";

const roleSchema = z.enum(["admin", "user", "accountant", "pending"]);

const roleUpdateSchema = z.object({
  userId: z.string().uuid(),
  role: roleSchema,
});

const inviteSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  role: roleSchema,
});

const updateSchema = z.object({
  userId: z.string().uuid(),
  name: z.string().optional(),
  email: z.string().email().optional(),
  role: roleSchema,
});

function splitName(name: string | null | undefined): { firstName?: string; lastName?: string } {
  const trimmed = name?.trim();
  if (!trimmed) return {};
  const parts = trimmed.split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ") || undefined;
  return { firstName, lastName };
}

function inviteRedirectUrl(): string {
  const base = clientEnv.NEXT_PUBLIC_APP_URL ?? "http://localhost:3000";
  return `${base.replace(/\/$/, "")}/sign-up`;
}

function clerkErrorMessage(err: unknown): string {
  if (err && typeof err === "object" && "errors" in err) {
    const errors = (err as { errors?: { message?: string }[] }).errors;
    const msg = errors?.[0]?.message;
    if (msg) return msg;
  }
  if (err instanceof Error) return err.message;
  return "Clerk request failed";
}

function isExistingInviteError(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("already") || lower.includes("exists");
}

async function revokeClerkInvitations(email: string): Promise<ActionResult> {
  try {
    const client = await clerkClient();
    const normalised = normalizeEmail(email);
    const { data: invitations } = await client.invitations.getInvitationList({
      query: normalised,
      status: "pending",
    });
    for (const invitation of invitations) {
      if (normalizeEmail(invitation.emailAddress) === normalised) {
        await client.invitations.revokeInvitation(invitation.id);
      }
    }
    return { ok: true };
  } catch (err) {
    return { ok: false, error: clerkErrorMessage(err) };
  }
}

export async function updateUserRole(
  userId: string,
  formData: FormData,
): Promise<ActionResult> {
  const parsed = roleUpdateSchema.safeParse({
    userId,
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (!isRole(parsed.data.role)) {
    return { ok: false, error: "Unknown role" };
  }

  return mutate(
    "users:manage",
    async ({ session }) => {
      if (session.userId) {
        const db = getDb();
        const [target] = await db
          .select({ clerkUserId: users.clerkUserId, role: users.role })
          .from(users)
          .where(eq(users.id, parsed.data.userId))
          .limit(1);
        if (!target) return { ok: false, error: "User not found" };
        if (target.clerkUserId === session.userId) {
          return { ok: false, error: "You cannot change your own role" };
        }
        await db
          .update(users)
          .set({ role: parsed.data.role as Role })
          .where(eq(users.id, parsed.data.userId));
        return { ok: true, id: parsed.data.userId };
      }
      return { ok: false, error: "Not signed in" };
    },
    {
      audit: {
        action: "user.role",
        entityType: "user",
        entityId: parsed.data.userId,
        meta: { role: parsed.data.role },
      },
      paths: ["/dashboard/users"],
    },
  );
}

export async function inviteUser(formData: FormData): Promise<ActionResult> {
  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    name: formData.get("name") || undefined,
    role: formData.get("role") ?? "pending",
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (!isAuthConfigured()) {
    return { ok: false, error: "Clerk is not configured — cannot send invitations." };
  }

  const email = normalizeEmail(parsed.data.email);
  const name = parsed.data.name?.trim() || null;
  const role = parsed.data.role as Role;

  return mutate(
    "users:manage",
    async () => {
      const existing = await findUserByEmail(email);
      if (existing?.clerkUserId) {
        return { ok: false, error: "A user with this email has already signed in." };
      }

      const db = getDb();
      let userId: string;

      if (existing) {
        await db
          .update(users)
          .set({ name: name ?? existing.name, role })
          .where(eq(users.id, existing.id));
        userId = existing.id;
      } else {
        const [created] = await db
          .insert(users)
          .values({ email, name, role, clerkUserId: null })
          .returning({ id: users.id });
        userId = created.id;
      }

      try {
        const client = await clerkClient();
        await client.invitations.createInvitation({
          emailAddress: email,
          redirectUrl: inviteRedirectUrl(),
        });
      } catch (err) {
        const message = clerkErrorMessage(err);
        if (isExistingInviteError(message)) {
          return { ok: true, id: userId };
        }
        return { ok: false, error: message };
      }

      return { ok: true, id: userId };
    },
    {
      audit: {
        action: "user.invite",
        entityType: "user",
        meta: { email, role },
      },
      paths: ["/dashboard/users"],
    },
  );
}

export async function revokeUserInvite(userId: string): Promise<ActionResult> {
  return mutate(
    "users:manage",
    async () => {
      const db = getDb();
      const [target] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!target) return { ok: false, error: "User not found" };
      if (target.clerkUserId) {
        return {
          ok: false,
          error: "Cannot revoke an invitation for a user who has already signed in.",
        };
      }

      if (isAuthConfigured()) {
        const clerkResult = await revokeClerkInvitations(target.email);
        if (!clerkResult.ok) return clerkResult;
      }

      await db.delete(users).where(eq(users.id, userId));
      return { ok: true, id: userId };
    },
    {
      audit: {
        action: "user.invite.revoke",
        entityType: "user",
        entityId: userId,
      },
      paths: ["/dashboard/users", `/dashboard/users/${userId}/edit`],
    },
  );
}

export async function deleteUser(userId: string): Promise<ActionResult> {
  return mutate(
    "users:manage",
    async ({ session }) => {
      const db = getDb();
      const [target] = await db
        .select()
        .from(users)
        .where(eq(users.id, userId))
        .limit(1);
      if (!target) return { ok: false, error: "User not found" };
      if (target.clerkUserId === session.userId) {
        return { ok: false, error: "You cannot delete your own account." };
      }
      if (target.role === "admin" && (await countAdminUsers()) <= 1) {
        return { ok: false, error: "Cannot delete the last administrator." };
      }

      const [linkedReimbursement] = await db
        .select({ id: reimbursements.id })
        .from(reimbursements)
        .where(eq(reimbursements.payeeUserId, userId))
        .limit(1);
      if (linkedReimbursement) {
        return {
          ok: false,
          error: "Cannot delete a user linked to reimbursements.",
        };
      }

      if (!target.clerkUserId) {
        if (isAuthConfigured()) {
          const clerkResult = await revokeClerkInvitations(target.email);
          if (!clerkResult.ok) return clerkResult;
        }
      } else if (isAuthConfigured()) {
        try {
          const client = await clerkClient();
          await client.users.deleteUser(target.clerkUserId);
        } catch (err) {
          return { ok: false, error: clerkErrorMessage(err) };
        }
      }

      await db.delete(users).where(eq(users.id, userId));
      return { ok: true, id: userId };
    },
    {
      audit: {
        action: "user.delete",
        entityType: "user",
        entityId: userId,
      },
      paths: ["/dashboard/users", `/dashboard/users/${userId}/edit`],
    },
  );
}

export async function updateUser(userId: string, formData: FormData): Promise<ActionResult> {
  const parsed = updateSchema.safeParse({
    userId,
    name: formData.get("name") || undefined,
    email: formData.get("email") || undefined,
    role: formData.get("role"),
  });
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }
  if (!isRole(parsed.data.role)) {
    return { ok: false, error: "Unknown role" };
  }

  const name = parsed.data.name?.trim() || null;
  const role = parsed.data.role as Role;

  return mutate(
    "users:manage",
    async ({ session }) => {
      const db = getDb();
      const [target] = await db
        .select()
        .from(users)
        .where(eq(users.id, parsed.data.userId))
        .limit(1);
      if (!target) return { ok: false, error: "User not found" };

      if (target.clerkUserId === session.userId && role !== target.role) {
        return { ok: false, error: "You cannot change your own role" };
      }

      let email = target.email;
      if (!target.clerkUserId && parsed.data.email) {
        const nextEmail = normalizeEmail(parsed.data.email);
        if (nextEmail !== normalizeEmail(target.email)) {
          const duplicate = await findUserByEmail(nextEmail);
          if (duplicate && duplicate.id !== target.id) {
            return { ok: false, error: "Another user already uses this email." };
          }
          email = nextEmail;
        }
      }

      if (
        isAuthConfigured() &&
        target.clerkUserId &&
        name !== target.name
      ) {
        try {
          const client = await clerkClient();
          await client.users.updateUser(target.clerkUserId, splitName(name));
        } catch (err) {
          return { ok: false, error: clerkErrorMessage(err) };
        }
      }

      await db
        .update(users)
        .set({ name, email, role })
        .where(eq(users.id, parsed.data.userId));

      return { ok: true, id: parsed.data.userId };
    },
    {
      audit: {
        action: "user.update",
        entityType: "user",
        entityId: parsed.data.userId,
        meta: { role },
      },
      paths: ["/dashboard/users", `/dashboard/users/${parsed.data.userId}/edit`],
    },
  );
}
