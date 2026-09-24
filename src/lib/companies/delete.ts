import "server-only";
import { eq, inArray } from "drizzle-orm";
import { clerkClient } from "@clerk/nextjs/server";
import { getDb } from "@/db";
import {
  companies,
  companyBilling,
  expenseReceipts,
  expenses,
  invoices,
  quotes,
  users,
} from "@/db/schema";
import { clerkErrorMessage } from "@/lib/clerk-invite";
import { serverEnv } from "@/env";
import { getStripe } from "@/lib/billing/stripe";
import { writeAudit } from "@/lib/audit";
import { logPlatformEvent } from "@/lib/platform-log";
import { DEFAULT_ROLE } from "@/lib/roles";
import { getStorage } from "@/lib/storage";
import {
  countUserMemberships,
  listUsers,
  normalizeEmail,
  removeMembership,
} from "@/lib/users";

export type DeleteCompanyResult =
  | { ok: true; id: string; name: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export type DeleteCompanyOptions = {
  /** Local users.id of the actor — written to audit before member purge. */
  actorUserId?: string | null;
  /** When set, writes a durable audit row (companyId null) before purging users. */
  auditAction?: string;
};

async function revokePendingInvitations(email: string): Promise<void> {
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
  } catch (err) {
    await logPlatformEvent({
      level: "warn",
      source: "company.delete.clerk_invite",
      message: clerkErrorMessage(err),
      meta: { email },
    });
  }
}

async function cancelStripeForCompany(companyId: string): Promise<void> {
  const db = getDb();
  const [billing] = await db
    .select({
      stripeCustomerId: companyBilling.stripeCustomerId,
      stripeSubscriptionId: companyBilling.stripeSubscriptionId,
    })
    .from(companyBilling)
    .where(eq(companyBilling.companyId, companyId))
    .limit(1);

  if (!billing?.stripeCustomerId && !billing?.stripeSubscriptionId) return;
  if (!serverEnv().STRIPE_SECRET_KEY) {
    await logPlatformEvent({
      level: "warn",
      source: "company.delete.stripe",
      message: "Stripe not configured; skipping billing cleanup",
      companyId,
      meta: {
        stripeCustomerId: billing.stripeCustomerId,
        stripeSubscriptionId: billing.stripeSubscriptionId,
      },
    });
    return;
  }

  try {
    const stripe = getStripe();
    if (billing.stripeSubscriptionId) {
      try {
        await stripe.subscriptions.cancel(billing.stripeSubscriptionId);
      } catch (err) {
        // Already cancelled / missing is fine.
        const message = err instanceof Error ? err.message : String(err);
        if (!/no such subscription|resource_missing/i.test(message)) {
          throw err;
        }
      }
    }
    if (billing.stripeCustomerId) {
      try {
        await stripe.customers.del(billing.stripeCustomerId);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        if (!/no such customer|resource_missing/i.test(message)) {
          throw err;
        }
      }
    }
  } catch (err) {
    await logPlatformEvent({
      level: "warn",
      source: "company.delete.stripe",
      message: err instanceof Error ? err.message : String(err),
      companyId,
      meta: {
        stripeCustomerId: billing.stripeCustomerId,
        stripeSubscriptionId: billing.stripeSubscriptionId,
      },
    });
  }
}

async function collectBlobPaths(companyId: string): Promise<string[]> {
  const db = getDb();
  const paths = new Set<string>();

  const [company] = await db
    .select({ logoUrl: companies.logoUrl })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  if (company?.logoUrl) paths.add(company.logoUrl);

  const invoicePdfs = await db
    .select({ path: invoices.pdfBlobPath })
    .from(invoices)
    .where(eq(invoices.companyId, companyId));
  for (const row of invoicePdfs) {
    if (row.path) paths.add(row.path);
  }

  const quotePdfs = await db
    .select({ path: quotes.pdfBlobPath })
    .from(quotes)
    .where(eq(quotes.companyId, companyId));
  for (const row of quotePdfs) {
    if (row.path) paths.add(row.path);
  }

  const expenseIds = await db
    .select({ id: expenses.id })
    .from(expenses)
    .where(eq(expenses.companyId, companyId));
  if (expenseIds.length > 0) {
    const receipts = await db
      .select({ path: expenseReceipts.blobPath })
      .from(expenseReceipts)
      .where(
        inArray(
          expenseReceipts.expenseId,
          expenseIds.map((e) => e.id),
        ),
      );
    for (const row of receipts) {
      if (row.path) paths.add(row.path);
    }
  }

  return [...paths];
}

async function purgeBlobs(paths: string[]): Promise<void> {
  if (paths.length === 0) return;
  const storage = getStorage();
  for (const path of paths) {
    try {
      await storage.delete(path);
    } catch (err) {
      await logPlatformEvent({
        level: "warn",
        source: "company.delete.storage",
        message: err instanceof Error ? err.message : String(err),
        meta: { path },
      });
    }
  }
}

async function deleteClerkUser(clerkUserId: string): Promise<void> {
  try {
    const client = await clerkClient();
    await client.users.deleteUser(clerkUserId);
  } catch (err) {
    await logPlatformEvent({
      level: "warn",
      source: "company.delete.clerk_user",
      message: clerkErrorMessage(err),
      meta: { clerkUserId },
    });
  }
}

/**
 * Permanently delete a company and cascaded tenant data.
 * Detaches members first (`users.companyId` is ON DELETE RESTRICT).
 * Members whose only company was this one are removed from the DB and Clerk
 * (pending invites revoked). Multi-company members keep their other memberships.
 */
export async function deleteCompanyById(
  companyId: string,
  confirmationName: string,
  options?: DeleteCompanyOptions,
): Promise<DeleteCompanyResult> {
  const db = getDb();
  const [company] = await db
    .select({
      id: companies.id,
      name: companies.name,
    })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  if (!company) {
    return { ok: false, error: "Company not found" };
  }

  const expected = company.name.trim();
  const provided = confirmationName.trim();
  if (!provided || provided !== expected) {
    return {
      ok: false,
      error: "Type the company name exactly to confirm deletion",
      fieldErrors: {
        confirmationName: "Type the company name exactly to confirm deletion",
      },
    };
  }

  const blobPaths = await collectBlobPaths(companyId);
  await cancelStripeForCompany(companyId);
  await purgeBlobs(blobPaths);

  const members = await listUsers(companyId);
  /** Local user ids to fully remove after the company row is gone. */
  const usersToPurge: Array<{
    id: string;
    email: string;
    clerkUserId: string | null;
  }> = [];

  for (const member of members) {
    const membershipCount = await countUserMemberships(member.id);
    const isLastMembership = membershipCount <= 1;
    await removeMembership(member.id, companyId);
    if (isLastMembership) {
      usersToPurge.push({
        id: member.id,
        email: member.email,
        clerkUserId: member.clerkUserId,
      });
    }
  }

  // Clear any leftover active-company pointers (edge cases without membership).
  await db
    .update(users)
    .set({ companyId: null, role: DEFAULT_ROLE })
    .where(eq(users.companyId, companyId));

  const [deleted] = await db
    .delete(companies)
    .where(eq(companies.id, companyId))
    .returning({ id: companies.id, name: companies.name });

  if (!deleted) {
    return { ok: false, error: "Company not found" };
  }

  // Audit before member purge so actorUserId FK is still valid for self-delete.
  if (options?.auditAction) {
    await writeAudit({
      companyId: null,
      actorUserId: options.actorUserId ?? null,
      action: options.auditAction,
      entityType: "company",
      entityId: deleted.id,
      meta: { name: deleted.name },
    });
  }

  // Safe after cascade: reimbursements (payee restrict) are gone with the company.
  for (const user of usersToPurge) {
    const remaining = await countUserMemberships(user.id);
    if (remaining > 0) continue;

    if (user.clerkUserId) {
      await deleteClerkUser(user.clerkUserId);
    } else {
      await revokePendingInvitations(user.email);
    }
    await db.delete(users).where(eq(users.id, user.id));
  }

  return { ok: true, id: deleted.id, name: deleted.name };
}
