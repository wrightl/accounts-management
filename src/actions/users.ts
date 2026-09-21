"use server";

import { revalidatePath } from "next/cache";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { clerkClient } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { reimbursements, users } from "@/db/schema";
import { requireUser } from "@/lib/auth";
import { writeAudit } from "@/lib/audit";
import { mutate } from "@/lib/mutate";
import { cancelPendingReimbursementRunsForPayee } from "@/lib/reimbursements/cancel";
import { isPlatformAdminRole, isTenantRole, type TenantRole } from "@/lib/roles";
import {
  countAdminUsers,
  countUserMemberships,
  ensureLocalUser,
  findUserByEmail,
  getMembership,
  listUserMemberships,
  normalizeEmail,
  removeMembership,
  upsertMembership,
} from "@/lib/users";
import { isPlatformAdminEmail } from "@/lib/bootstrap";
import {
  uniquifyUserInboundSlug,
  userInboundSlugSeed,
} from "@/lib/expenses/inbound-mailbox";
import {
  clerkErrorMessage,
  sendClerkInvitation,
} from "@/lib/clerk-invite";
import {
  inviteUserRawFromFormData,
  parseInviteUserInput,
  parseProfileUpdateInput,
  parseRoleUpdateInput,
  parseUpdateUserInput,
  profileUpdateRawFromFormData,
  roleUpdateRawFromFormData,
  updateUserRawFromFormData,
} from "@/lib/users/schema";
import type { ActionResult } from "@/actions/result";
import { redirect } from "next/navigation";

function splitName(name: string | null | undefined): { firstName?: string; lastName?: string } {
  const trimmed = name?.trim();
  if (!trimmed) return {};
  const parts = trimmed.split(/\s+/);
  const firstName = parts[0];
  const lastName = parts.slice(1).join(" ") || undefined;
  return { firstName, lastName };
}

async function clerkProfileImageFile(file: File): Promise<File> {
  const bytes = Buffer.from(await file.arrayBuffer());
  const contentType = file.type?.startsWith("image/") ? file.type : "image/jpeg";
  const name = file.name?.trim() || "profile.jpg";
  return new File([bytes], name, { type: contentType });
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
  const parsed = parseRoleUpdateInput(
    roleUpdateRawFromFormData(userId, formData),
  );
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  return mutate(
    "users:manage",
    async ({ session, companyId }) => {
      if (session.userId) {
        const db = getDb();
        const membership = await getMembership(parsed.data.userId, companyId);
        if (!membership) return { ok: false, error: "User not found" };

        const [target] = await db
          .select({
            clerkUserId: users.clerkUserId,
            companyId: users.companyId,
            email: users.email,
            name: users.name,
            expenseInboundSlug: users.expenseInboundSlug,
          })
          .from(users)
          .where(eq(users.id, parsed.data.userId))
          .limit(1);
        if (!target) return { ok: false, error: "User not found" };
        if (target.clerkUserId === session.userId) {
          return { ok: false, error: "You cannot change your own role" };
        }

        const nextRole = parsed.data.role;
        const membershipCount = await countUserMemberships(parsed.data.userId);
        if (membershipCount > 1 && nextRole !== "accountant") {
          return {
            ok: false,
            error: "Users with access to multiple companies must remain accountants.",
          };
        }

        const patch: { role?: TenantRole; expenseInboundSlug?: string } = {};
        if (target.companyId === companyId) {
          patch.role = nextRole;
        }
        if (
          (nextRole === "admin" || nextRole === "user") &&
          !target.expenseInboundSlug
        ) {
          patch.expenseInboundSlug = await uniquifyUserInboundSlug(
            companyId,
            userInboundSlugSeed(target.name, target.email),
            parsed.data.userId,
          );
        }
        if (Object.keys(patch).length > 0) {
          await db
            .update(users)
            .set(patch)
            .where(eq(users.id, parsed.data.userId));
        }
        await upsertMembership(parsed.data.userId, companyId, nextRole);
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
      paths: ["/users"],
    },
  );
}

export async function inviteUser(formData: FormData): Promise<ActionResult> {
  const parsed = parseInviteUserInput(inviteUserRawFromFormData(formData));
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  const email = normalizeEmail(parsed.data.email);
  const name = parsed.data.name?.trim() || null;
  const role = parsed.data.role;

  return mutate(
    "users:manage",
    async ({ companyId }) => {
      if (isPlatformAdminEmail(email)) {
        return {
          ok: false,
          error: "Platform operators cannot be invited to a company.",
        };
      }

      const { canInviteUser } = await import("@/lib/billing/entitlements");
      const inviteGate = await canInviteUser(companyId);
      if (!inviteGate.ok) {
        return { ok: false, error: inviteGate.error ?? "User limit reached." };
      }

      const existing = await findUserByEmail(email);
      if (isPlatformAdminRole(existing?.role)) {
        return {
          ok: false,
          error: "Platform operators cannot be invited to a company.",
        };
      }
      if (existing) {
        const alreadyMember = await getMembership(existing.id, companyId);
        if (alreadyMember || existing.companyId === companyId) {
          // Heal legacy rows that have companyId but no membership yet.
          if (!alreadyMember && existing.companyId === companyId) {
            const healRole = isTenantRole(existing.role) ? existing.role : role;
            await upsertMembership(existing.id, companyId, healRole);
          }
          return {
            ok: false,
            error: "This user is already a member of this company.",
          };
        }

        const memberships = await listUserMemberships(existing.id);
        const belongsElsewhere =
          memberships.length > 0 ||
          (existing.companyId != null && existing.companyId !== companyId);
        const accountantOnly =
          existing.role === "accountant" &&
          memberships.every((m) => m.role === "accountant");

        if (belongsElsewhere) {
          if (role !== "accountant" || !accountantOnly) {
            return {
              ok: false,
              error: accountantOnly
                ? "This email already belongs to another company."
                : "Only accountants can be invited to additional companies. This user already has a non-accountant role elsewhere.",
            };
          }

          // Additional accountant membership — keep selected company; skip Clerk if signed in.
          const db = getDb();
          if (name && !existing.name) {
            await db
              .update(users)
              .set({ name })
              .where(eq(users.id, existing.id));
          }
          await upsertMembership(existing.id, companyId, "accountant");

          if (!existing.clerkUserId) {
            const invited = await sendClerkInvitation(email);
            if (!invited.ok) return invited;
          }

          return { ok: true, id: existing.id };
        }
      }

      const db = getDb();
      let userId: string;
      const shouldHaveInbound = role === "admin" || role === "user";

      if (existing) {
        // First membership for a pending invite (or re-invite before sign-in).
        const inboundSlug = shouldHaveInbound
          ? await uniquifyUserInboundSlug(
              companyId,
              userInboundSlugSeed(name, email),
              existing.id,
            )
          : null;
        await db
          .update(users)
          .set({
            name: name ?? existing.name,
            role,
            companyId,
            ...(inboundSlug && !existing.expenseInboundSlug
              ? { expenseInboundSlug: inboundSlug }
              : {}),
          })
          .where(eq(users.id, existing.id));
        await upsertMembership(existing.id, companyId, role);
        userId = existing.id;
      } else {
        const inboundSlug = shouldHaveInbound
          ? await uniquifyUserInboundSlug(
              companyId,
              userInboundSlugSeed(name, email),
            )
          : null;
        const [created] = await db
          .insert(users)
          .values({
            email,
            name,
            role,
            clerkUserId: null,
            companyId,
            expenseInboundSlug: inboundSlug,
          })
          .returning({ id: users.id });
        userId = created.id;
        await upsertMembership(userId, companyId, role);
      }

      const invited = await sendClerkInvitation(email);
      if (!invited.ok) return invited;

      return { ok: true, id: userId };
    },
    {
      audit: {
        action: "user.invite",
        entityType: "user",
        meta: { email, role },
      },
      paths: ["/users"],
    },
  );
}

export async function revokeUserInvite(userId: string): Promise<ActionResult> {
  return mutate(
    "users:manage",
    async ({ companyId }) => {
      const membership = await getMembership(userId, companyId);
      if (!membership) return { ok: false, error: "User not found" };

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

      const { remaining } = await removeMembership(userId, companyId);
      if (remaining === 0) {
        const clerkResult = await revokeClerkInvitations(target.email);
        if (!clerkResult.ok) return clerkResult;
        await db.delete(users).where(eq(users.id, userId));
      }

      return { ok: true, id: userId };
    },
    {
      audit: {
        action: "user.invite.revoke",
        entityType: "user",
        entityId: userId,
      },
      paths: ["/users", `/users/${userId}/edit`],
    },
  );
}

export async function deleteUser(userId: string): Promise<ActionResult> {
  return mutate(
    "users:manage",
    async ({ session, companyId }) => {
      const membership = await getMembership(userId, companyId);
      if (!membership) return { ok: false, error: "User not found" };

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
      if (membership.role === "admin" && (await countAdminUsers(companyId)) <= 1) {
        return { ok: false, error: "Cannot delete the last administrator." };
      }

      const membershipCount = await countUserMemberships(userId);
      const isLastMembership = membershipCount <= 1;

      if (isLastMembership) {
        if (!target.clerkUserId) {
          const clerkResult = await revokeClerkInvitations(target.email);
          if (!clerkResult.ok) return clerkResult;
        } else {
          try {
            const client = await clerkClient();
            await client.users.deleteUser(target.clerkUserId);
          } catch (err) {
            return { ok: false, error: clerkErrorMessage(err) };
          }
        }
      }

      await db.transaction(async (tx) => {
        await cancelPendingReimbursementRunsForPayee(tx, companyId, userId);
      });

      if (!isLastMembership) {
        await removeMembership(userId, companyId);
        return { ok: true, id: userId };
      }

      const [remainingReimbursement] = await db
        .select({ id: reimbursements.id })
        .from(reimbursements)
        .where(eq(reimbursements.payeeUserId, userId))
        .limit(1);

      await removeMembership(userId, companyId);

      if (remainingReimbursement) {
        // Keep the row for payee history; null clerk so re-invite/sign-in can claim.
        await db
          .update(users)
          .set({ clerkUserId: null })
          .where(eq(users.id, userId));
      } else {
        await db.delete(users).where(eq(users.id, userId));
      }

      return { ok: true, id: userId };
    },
    {
      audit: {
        action: "user.delete",
        entityType: "user",
        entityId: userId,
      },
      paths: [
        "/users",
        `/users/${userId}/edit`,
        "/reimbursements",
        "/expenses",
        "/dashboard",
      ],
    },
  );
}

export async function updateUser(userId: string, formData: FormData): Promise<ActionResult> {
  const parsed = parseUpdateUserInput(
    updateUserRawFromFormData(userId, formData),
  );
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  const name = parsed.data.name?.trim() || null;
  const role = parsed.data.role;

  return mutate(
    "users:manage",
    async ({ session, companyId }) => {
      const membership = await getMembership(parsed.data.userId, companyId);
      if (!membership) return { ok: false, error: "User not found" };

      const db = getDb();
      const [target] = await db
        .select()
        .from(users)
        .where(eq(users.id, parsed.data.userId))
        .limit(1);
      if (!target) return { ok: false, error: "User not found" };

      if (target.clerkUserId === session.userId && role !== membership.role) {
        return { ok: false, error: "You cannot change your own role" };
      }

      const membershipCount = await countUserMemberships(parsed.data.userId);
      if (membershipCount > 1 && role !== "accountant") {
        return {
          ok: false,
          error: "Users with access to multiple companies must remain accountants.",
        };
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

      const userPatch: {
        name: string | null;
        email: string;
        role?: TenantRole;
        expenseInboundSlug?: string;
      } = {
        name,
        email,
      };
      if (target.companyId === companyId) {
        userPatch.role = role;
      }
      if (
        (role === "admin" || role === "user") &&
        !target.expenseInboundSlug
      ) {
        userPatch.expenseInboundSlug = await uniquifyUserInboundSlug(
          companyId,
          userInboundSlugSeed(name, email),
          parsed.data.userId,
        );
      }

      await db
        .update(users)
        .set(userPatch)
        .where(eq(users.id, parsed.data.userId));
      await upsertMembership(parsed.data.userId, companyId, role);

      return { ok: true, id: parsed.data.userId };
    },
    {
      audit: {
        action: "user.update",
        entityType: "user",
        entityId: parsed.data.userId,
        meta: { role },
      },
      paths: ["/users", `/users/${parsed.data.userId}/edit`],
    },
  );
}

export async function updateOwnProfile(formData: FormData): Promise<ActionResult> {
  const parsed = parseProfileUpdateInput(
    profileUpdateRawFromFormData(formData),
  );
  if (!parsed.ok) {
    return {
      ok: false,
      error: parsed.error,
      fieldErrors: parsed.fieldErrors,
    };
  }

  const session = await requireUser();
  const localUserId = await ensureLocalUser(session);
  const name = parsed.data.name?.trim() || null;

  const db = getDb();
  const [target] = await db
    .select()
    .from(users)
    .where(eq(users.id, localUserId))
    .limit(1);
  if (!target) return { ok: false, error: "User not found" };

  if (
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

  await db.update(users).set({ name }).where(eq(users.id, localUserId));

  if (session.companyId) {
    await writeAudit({
      companyId: session.companyId,
      actorUserId: localUserId,
      action: "user.profile.update",
      entityType: "user",
      entityId: localUserId,
    });
  }

  revalidatePath("/profile");
  revalidatePath("/platform/profile");
  revalidatePath("/", "layout");

  return { ok: true, id: localUserId };
}

const PROFILE_PICTURE_MAX_BYTES = 2 * 1024 * 1024;

function validateProfilePicture(file: File): string | null {
  if (file.size === 0) return "Choose an image file";
  if (file.size > PROFILE_PICTURE_MAX_BYTES) {
    return "Profile picture must be under 2 MB";
  }
  const contentType = file.type || "application/octet-stream";
  if (!contentType.startsWith("image/")) {
    return "Profile picture must be an image";
  }
  return null;
}

export async function uploadProfilePicture(formData: FormData): Promise<ActionResult> {
  const file = formData.get("photo");
  if (!(file instanceof File)) {
    return {
      ok: false,
      error: "Choose an image file",
      fieldErrors: { photo: "Choose an image file" },
    };
  }

  const validationError = validateProfilePicture(file);
  if (validationError) {
    return {
      ok: false,
      error: validationError,
      fieldErrors: { photo: validationError },
    };
  }

  const session = await requireUser();
  const localUserId = await ensureLocalUser(session);

  try {
    const client = await clerkClient();
    const clerkFile = await clerkProfileImageFile(file);
    await client.users.updateUserProfileImage(session.userId, { file: clerkFile });
  } catch (err) {
    const message = clerkErrorMessage(err);
    return { ok: false, error: message, fieldErrors: { photo: message } };
  }

  await writeAudit({
    companyId: session.companyId,
    actorUserId: localUserId,
    action: "user.profile.picture",
    entityType: "user",
    entityId: localUserId,
  });

  revalidatePath("/profile");
  revalidatePath("/platform/profile");
  revalidatePath("/", "layout");

  return { ok: true, id: localUserId };
}

export async function removeProfilePicture(): Promise<ActionResult> {
  const session = await requireUser();
  const localUserId = await ensureLocalUser(session);

  try {
    const client = await clerkClient();
    await client.users.deleteUserProfileImage(session.userId);
  } catch (err) {
    return { ok: false, error: clerkErrorMessage(err) };
  }

  await writeAudit({
    companyId: session.companyId,
    actorUserId: localUserId,
    action: "user.profile.picture.remove",
    entityType: "user",
    entityId: localUserId,
  });

  revalidatePath("/profile");
  revalidatePath("/platform/profile");
  revalidatePath("/", "layout");

  return { ok: true, id: localUserId };
}

/**
 * Switch the signed-in user's active company to another membership.
 * Redirects to /dashboard so company-scoped URLs do not leak across tenants.
 */
export async function switchCompany(companyId: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(companyId);
  if (!parsed.success) {
    return { ok: false, error: "Invalid company" };
  }

  const session = await requireUser();
  const localUserId = await ensureLocalUser(session);
  const membership = await getMembership(localUserId, parsed.data);
  if (!membership) {
    return { ok: false, error: "You do not have access to that company." };
  }

  const db = getDb();
  await db
    .update(users)
    .set({ companyId: parsed.data, role: membership.role })
    .where(eq(users.id, localUserId));

  await writeAudit({
    companyId: parsed.data,
    actorUserId: localUserId,
    action: "user.company.switch",
    entityType: "company",
    entityId: parsed.data,
  });

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
