"use server";

import { z } from "zod";
import { eq } from "drizzle-orm";
import { getDb } from "@/db";
import {
  companies,
  companySupportNotes,
  sendJobs,
  users,
} from "@/db/schema";
import { platformMutate } from "@/lib/platform";
import { isPlatformAdminEmail } from "@/lib/bootstrap";
import { isAuthConfigured } from "@/env";
import {
  findUserByEmail,
  getMembership,
  listUserMemberships,
  normalizeEmail,
  upsertMembership,
} from "@/lib/users";
import {
  uniquifyUserInboundSlug,
  userInboundSlugSeed,
} from "@/lib/expenses/inbound-mailbox";
import {
  adminDismissInboundEmailJob,
  adminRetryInboundEmailJob,
} from "@/lib/expenses/inbound-email";
import { processSendJob, drainSendJobs, enqueueOverdueReminders } from "@/lib/outbox";
import {
  getPlatformSettings,
  updatePlatformSettings,
} from "@/lib/platform-settings";
import { generateRecurringInvoices } from "@/lib/invoices/recurring-generate";
import { purgeOldPlatformLogs, logPlatformEvent } from "@/lib/platform-log";
import { sendClerkInvitation } from "@/lib/clerk-invite";
import type { ActionResult } from "@/actions/result";
import { isPlatformAdminRole, isTenantRole, PLATFORM_ADMIN_ROLE, type TenantRole } from "@/lib/roles";

export async function suspendCompany(
  companyId: string,
  reason?: string,
): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(companyId);
  if (!parsed.success) return { ok: false, error: "Invalid company id" };

  return platformMutate(
    async () => {
      const db = getDb();
      const [updated] = await db
        .update(companies)
        .set({
          suspendedAt: new Date(),
          suspendedReason: reason?.trim() || null,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, parsed.data))
        .returning({ id: companies.id });
      if (!updated) return { ok: false, error: "Company not found" };
      return { ok: true, id: updated.id };
    },
    {
      audit: {
        action: "platform.company.suspend",
        entityType: "company",
        entityId: companyId,
        companyId,
        meta: reason?.trim() ? { reason: reason.trim() } : undefined,
      },
      paths: [
        "/platform",
        "/platform/companies",
        `/platform/companies/${companyId}`,
      ],
    },
  );
}

export async function unsuspendCompany(companyId: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(companyId);
  if (!parsed.success) return { ok: false, error: "Invalid company id" };

  return platformMutate(
    async () => {
      const db = getDb();
      const [updated] = await db
        .update(companies)
        .set({
          suspendedAt: null,
          suspendedReason: null,
          updatedAt: new Date(),
        })
        .where(eq(companies.id, parsed.data))
        .returning({ id: companies.id });
      if (!updated) return { ok: false, error: "Company not found" };
      return { ok: true, id: updated.id };
    },
    {
      audit: {
        action: "platform.company.unsuspend",
        entityType: "company",
        entityId: companyId,
        companyId,
      },
      paths: [
        "/platform",
        "/platform/companies",
        `/platform/companies/${companyId}`,
      ],
    },
  );
}

export async function addCompanySupportNote(
  companyId: string,
  body: string,
): Promise<ActionResult> {
  const idOk = z.string().uuid().safeParse(companyId);
  if (!idOk.success) return { ok: false, error: "Invalid company id" };
  const text = body.trim();
  if (!text) return { ok: false, error: "Note cannot be empty" };
  if (text.length > 4000) return { ok: false, error: "Note is too long" };

  return platformMutate(
    async ({ localUserId }) => {
      const db = getDb();
      const [note] = await db
        .insert(companySupportNotes)
        .values({
          companyId: idOk.data,
          authorUserId: localUserId,
          body: text,
        })
        .returning({ id: companySupportNotes.id });
      return { ok: true, id: note.id };
    },
    {
      audit: {
        action: "platform.company.note",
        entityType: "company",
        entityId: companyId,
        companyId,
      },
      paths: [`/platform/companies/${companyId}`],
    },
  );
}

/** Invite an admin into a specific company from the platform portal. */
export async function platformInviteCompanyAdmin(
  formData: FormData,
): Promise<ActionResult> {
  const companyId = String(formData.get("companyId") ?? "");
  const emailRaw = String(formData.get("email") ?? "");
  const nameRaw = String(formData.get("name") ?? "");
  const idOk = z.string().uuid().safeParse(companyId);
  if (!idOk.success) return { ok: false, error: "Invalid company id" };
  const emailParsed = z.string().email().safeParse(emailRaw.trim());
  if (!emailParsed.success) return { ok: false, error: "Valid email required" };
  if (!isAuthConfigured()) {
    return { ok: false, error: "Clerk is not configured — cannot send invitations." };
  }

  const email = normalizeEmail(emailParsed.data);
  const name = nameRaw.trim() || null;
  const role: TenantRole = "admin";

  return platformMutate(
    async () => {
      const companyId = idOk.data;
      if (isPlatformAdminEmail(email)) {
        return {
          ok: false,
          error: "Platform operators cannot be invited to a company.",
        };
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
        if (memberships.length > 0 || existing.companyId != null) {
          return {
            ok: false,
            error:
              "This email already belongs to another company. Only accountants can join multiple companies.",
          };
        }
      }

      const db = getDb();
      let userId: string;

      if (existing) {
        const inboundSlug = await uniquifyUserInboundSlug(
          companyId,
          userInboundSlugSeed(name, email),
          existing.id,
        );
        await db
          .update(users)
          .set({
            name: name ?? existing.name,
            role,
            companyId,
            expenseInboundSlug: inboundSlug,
          })
          .where(eq(users.id, existing.id));
        await upsertMembership(existing.id, companyId, role);
        userId = existing.id;
      } else {
        const inboundSlug = await uniquifyUserInboundSlug(
          companyId,
          userInboundSlugSeed(name, email),
        );
        const [created] = await db
          .insert(users)
          .values({
            email,
            name,
            role,
            companyId,
            expenseInboundSlug: inboundSlug,
          })
          .returning({ id: users.id });
        await upsertMembership(created.id, companyId, role);
        userId = created.id;
      }

      const invited = await sendClerkInvitation(email);
      if (!invited.ok) return invited;

      return { ok: true, id: userId };
    },
    {
      audit: {
        action: "platform.company.invite_admin",
        entityType: "user",
        companyId: idOk.data,
        meta: { email },
      },
      paths: [`/platform/companies/${idOk.data}`],
    },
  );
}

/**
 * Invite a new platform operator. Rejects any email that already exists as a
 * user so platform admins never share an identity with a company member.
 */
export async function invitePlatformAdmin(
  formData: FormData,
): Promise<ActionResult> {
  const emailRaw = String(formData.get("email") ?? "");
  const nameRaw = String(formData.get("name") ?? "");
  const emailParsed = z.string().email().safeParse(emailRaw.trim());
  if (!emailParsed.success) return { ok: false, error: "Valid email required" };
  if (!isAuthConfigured()) {
    return { ok: false, error: "Clerk is not configured — cannot send invitations." };
  }

  const email = normalizeEmail(emailParsed.data);
  const name = nameRaw.trim() || null;

  return platformMutate(
    async () => {
      const existing = await findUserByEmail(email);
      if (existing) {
        return {
          ok: false,
          error:
            isPlatformAdminRole(existing.role)
              ? "This email is already a platform admin."
              : "This email already belongs to a user. Platform operators cannot belong to a company.",
        };
      }

      const db = getDb();
      const [created] = await db
        .insert(users)
        .values({
          email,
          name,
          role: PLATFORM_ADMIN_ROLE,
          companyId: null,
          clerkUserId: null,
        })
        .returning({ id: users.id });

      const invited = await sendClerkInvitation(email);
      if (!invited.ok) return invited;

      return { ok: true, id: created.id };
    },
    {
      audit: {
        action: "platform.user.invite_admin",
        entityType: "user",
        companyId: null,
        meta: { email },
      },
      paths: ["/platform/users"],
    },
  );
}

export async function updatePlatformSettingsAction(
  formData: FormData,
): Promise<ActionResult> {
  const maintenanceBanner = String(formData.get("maintenanceBanner") ?? "").trim();
  const recurring =
    formData.get("recurringInvoicesEnabled") === "on" ||
    formData.get("recurringInvoicesEnabled") === "true";
  const defaultReceiptOcrProvider = String(
    formData.get("defaultReceiptOcrProvider") ?? "local",
  );
  const defaultReceiptOcrModel = String(
    formData.get("defaultReceiptOcrModel") ?? "google/gemini-2.5-flash",
  );

  if (
    defaultReceiptOcrProvider !== "local" &&
    defaultReceiptOcrProvider !== "ai_gateway"
  ) {
    return { ok: false, error: "Invalid OCR provider" };
  }

  const model = defaultReceiptOcrModel.trim() || "google/gemini-2.5-flash";
  if (defaultReceiptOcrProvider === "ai_gateway") {
    const { isGatewayModelId } = await import("@/lib/expenses/receipt-ocr-models");
    if (!isGatewayModelId(model)) {
      return {
        ok: false,
        error: "Enter a model as provider/model, e.g. google/gemini-2.5-flash",
      };
    }
  }

  return platformMutate(
    async () => {
      await updatePlatformSettings({
        maintenanceBanner: maintenanceBanner || null,
        recurringInvoicesEnabled: recurring,
        defaultReceiptOcrProvider,
        defaultReceiptOcrModel: model,
      });
      return { ok: true, id: "1" };
    },
    {
      audit: {
        action: "platform.settings.update",
        entityType: "platform_settings",
        entityId: "1",
        companyId: null,
        meta: {
          recurringInvoicesEnabled: recurring,
          defaultReceiptOcrProvider,
          hasBanner: Boolean(maintenanceBanner),
        },
      },
      paths: ["/platform/settings", "/platform"],
    },
  );
}

export async function platformRetryInboundJob(
  jobId: string,
): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(jobId);
  if (!parsed.success) return { ok: false, error: "Invalid job id" };

  return platformMutate(
    async () => {
      const result = await adminRetryInboundEmailJob(parsed.data);
      if (!result.ok) return { ok: false, error: result.error ?? "Retry failed" };
      return { ok: true, id: jobId };
    },
    {
      audit: {
        action: "platform.inbound_email.retry",
        entityType: "inbound_email_job",
        entityId: jobId,
        companyId: null,
      },
      paths: ["/platform/jobs", "/platform"],
    },
  );
}

export async function platformDismissInboundJob(
  jobId: string,
  reason?: string,
): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(jobId);
  if (!parsed.success) return { ok: false, error: "Invalid job id" };

  return platformMutate(
    async () => {
      const result = await adminDismissInboundEmailJob(parsed.data, reason);
      if (!result.ok) return { ok: false, error: result.error ?? "Dismiss failed" };
      return { ok: true, id: jobId };
    },
    {
      audit: {
        action: "platform.inbound_email.dismiss",
        entityType: "inbound_email_job",
        entityId: jobId,
        companyId: null,
        meta: reason?.trim() ? { reason: reason.trim() } : undefined,
      },
      paths: ["/platform/jobs", "/platform"],
    },
  );
}

export async function platformRetrySendJob(jobId: string): Promise<ActionResult> {
  const parsed = z.string().uuid().safeParse(jobId);
  if (!parsed.success) return { ok: false, error: "Invalid job id" };

  return platformMutate(
    async () => {
      const db = getDb();
      const [job] = await db
        .select()
        .from(sendJobs)
        .where(eq(sendJobs.id, parsed.data))
        .limit(1);
      if (!job) return { ok: false, error: "Send job not found" };

      const [company] = await db
        .select({ suspendedAt: companies.suspendedAt })
        .from(companies)
        .where(eq(companies.id, job.companyId))
        .limit(1);
      if (company?.suspendedAt) {
        return {
          ok: false,
          error: "Cannot retry send jobs for a suspended company.",
        };
      }

      await db
        .update(sendJobs)
        .set({
          status: "pending",
          attempts: 0,
          lastError: null,
          sentAt: null,
        })
        .where(eq(sendJobs.id, parsed.data));

      const result = await processSendJob(parsed.data);
      if (!result.ok) return { ok: false, error: result.error ?? "Retry failed" };
      return { ok: true, id: jobId };
    },
    {
      audit: {
        action: "platform.send_job.retry",
        entityType: "send_job",
        entityId: jobId,
        companyId: null,
      },
      paths: ["/platform/jobs", "/platform"],
    },
  );
}

export async function platformRunDailyCron(): Promise<ActionResult> {
  return platformMutate(
    async () => {
      const recurring = await generateRecurringInvoices();
      let reminders: Record<string, unknown> = { skipped: "no database" };
      if (process.env.DATABASE_URL) {
        const queued = await enqueueOverdueReminders();
        const drained = await drainSendJobs();
        reminders = { queued, ...drained };
      }
      const purged = await purgeOldPlatformLogs(90);
      await updatePlatformSettings({ lastCronDailyAt: new Date() });
      await logPlatformEvent({
        level: "info",
        source: "cron.daily.manual",
        message: "Platform admin triggered daily cron",
        meta: { recurring, reminders, purged },
      });
      return { ok: true, id: "cron-daily" };
    },
    {
      audit: {
        action: "platform.cron.daily",
        entityType: "cron",
        entityId: "daily",
        companyId: null,
      },
      paths: ["/platform/health", "/platform"],
    },
  );
}

/** Client error boundary — inserts a log row only; no auth required. */
export async function reportClientError(params: {
  message: string;
  digest?: string;
}): Promise<ActionResult> {
  const message = String(params.message ?? "").slice(0, 2000) || "Unknown client error";
  const digest = params.digest ? String(params.digest).slice(0, 200) : null;
  await logPlatformEvent({
    level: "error",
    source: "client.error",
    message,
    digest,
  });
  return { ok: true };
}

export async function getPlatformSettingsForForm() {
  return getPlatformSettings();
}
