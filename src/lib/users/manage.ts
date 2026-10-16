import "server-only";
import { eq } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import { reimbursements, users } from "@/db/schema";
import { cancelPendingReimbursementRunsForPayee } from "@/lib/reimbursements/cancel";
import { clerkErrorMessage, sendClerkInvitation } from "@/lib/clerk-invite";
import type { InviteContext } from "@/lib/invite-email";
import {
  uniquifyUserInboundSlug,
  userInboundSlugSeed,
} from "@/lib/expenses/inbound-mailbox";
import type { TenantRole } from "@/lib/roles";
import {
  countAdminUsers,
  countUserMemberships,
  getMembership,
  normalizeEmail,
  removeMembership,
  upsertMembership,
} from "@/lib/users";
import type { ActionResult } from "@/actions/result";

/**
 * Company member management shared by the tenant Users page and the platform
 * portal. Callers handle authz; `companyId` is always explicit.
 */

export async function revokeClerkInvitations(email: string): Promise<ActionResult> {
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

/** Revoke any pending invite and send a fresh one (new email, new link). */
export async function resendClerkInvitation(
  email: string,
  context?: InviteContext,
): Promise<ActionResult> {
  const revoked = await revokeClerkInvitations(email);
  if (!revoked.ok) return revoked;
  return sendClerkInvitation(email, context);
}

export async function changeCompanyMemberRole(params: {
  companyId: string;
  userId: string;
  role: TenantRole;
  /** Clerk id of the person making the change; they cannot change their own role. */
  actingClerkUserId?: string | null;
}): Promise<ActionResult> {
  const { companyId, userId, role: nextRole } = params;
  const db = getDb();
  const membership = await getMembership(userId, companyId);
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
    .where(eq(users.id, userId))
    .limit(1);
  if (!target) return { ok: false, error: "User not found" };
  if (params.actingClerkUserId && target.clerkUserId === params.actingClerkUserId) {
    return { ok: false, error: "You cannot change your own role" };
  }
  if (
    membership.role === "admin" &&
    nextRole !== "admin" &&
    (await countAdminUsers(companyId)) <= 1
  ) {
    return { ok: false, error: "A company must keep at least one administrator." };
  }

  const membershipCount = await countUserMemberships(userId);
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
  if ((nextRole === "admin" || nextRole === "user") && !target.expenseInboundSlug) {
    patch.expenseInboundSlug = await uniquifyUserInboundSlug(
      userInboundSlugSeed(target.name, target.email),
      userId,
    );
  }
  if (Object.keys(patch).length > 0) {
    await db.update(users).set(patch).where(eq(users.id, userId));
  }
  await upsertMembership(userId, companyId, nextRole);
  return { ok: true, id: userId };
}

/** Withdraw an invite for someone who has not signed in yet. */
export async function revokeCompanyInvite(params: {
  companyId: string;
  userId: string;
}): Promise<ActionResult> {
  const { companyId, userId } = params;
  const membership = await getMembership(userId, companyId);
  if (!membership) return { ok: false, error: "User not found" };

  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
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
}

/**
 * Remove a member from a company. When it was their only company, their Clerk
 * account (or pending invite) and local user row go too.
 */
export async function removeCompanyMember(params: {
  companyId: string;
  userId: string;
  actingClerkUserId?: string | null;
}): Promise<ActionResult> {
  const { companyId, userId } = params;
  const membership = await getMembership(userId, companyId);
  if (!membership) return { ok: false, error: "User not found" };

  const db = getDb();
  const [target] = await db.select().from(users).where(eq(users.id, userId)).limit(1);
  if (!target) return { ok: false, error: "User not found" };
  if (params.actingClerkUserId && target.clerkUserId === params.actingClerkUserId) {
    return { ok: false, error: "You cannot delete your own account." };
  }
  if (membership.role === "admin" && (await countAdminUsers(companyId)) <= 1) {
    return { ok: false, error: "Cannot delete the last administrator." };
  }

  const isLastMembership = (await countUserMemberships(userId)) <= 1;

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
    await db.update(users).set({ clerkUserId: null }).where(eq(users.id, userId));
  } else {
    await db.delete(users).where(eq(users.id, userId));
  }

  return { ok: true, id: userId };
}
