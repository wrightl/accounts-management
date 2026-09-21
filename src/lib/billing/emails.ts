import "server-only";
import { and, eq, inArray, isNotNull } from "drizzle-orm";
import { getDb } from "@/db";
import {
  billingEmailLog,
  companies,
  companyBilling,
  companyMemberships,
  users,
} from "@/db/schema";
import { sendEmail } from "@/lib/email";
import { appBaseUrl } from "@/lib/billing/stripe";
import { getEntitlements } from "@/lib/billing/entitlements";

export type BillingEmailTemplate =
  | "trial_welcome"
  | "trial_ending"
  | "trial_expired"
  | "renewal_reminder"
  | "lapsed_nudge"
  | "subscription_started"
  | "payment_failed"
  | "payment_recovered"
  | "subscription_canceled"
  | "complimentary_granted";

function billingUrl(): string {
  return `${appBaseUrl()}/settings/billing`;
}

function wrapHtml(title: string, body: string): string {
  return `<div style="font-family:system-ui,sans-serif;max-width:560px;margin:0 auto;color:#1a1a1a">
  <h1 style="font-size:20px;font-weight:600">${title}</h1>
  ${body}
  <p style="margin-top:24px"><a href="${billingUrl()}" style="display:inline-block;background:#0f766e;color:#fff;padding:10px 18px;border-radius:999px;text-decoration:none">Manage billing</a></p>
  <p style="margin-top:24px;font-size:12px;color:#666">Alfa by Dot+Dash</p>
</div>`;
}

const CONTENT: Record<
  BillingEmailTemplate,
  { subject: string; html: (ctx: { companyName: string; days?: number }) => string }
> = {
  trial_welcome: {
    subject: "Welcome — your 30-day trial has started",
    html: ({ companyName }) =>
      wrapHtml(
        "Your trial is live",
        `<p>Hi,</p><p><strong>${companyName}</strong> is on a 30-day free trial. Run quotes, invoices, expenses, and bank CSV matching — no card required yet.</p>`,
      ),
  },
  trial_ending: {
    subject: "Your Alfa trial ends soon",
    html: ({ companyName, days }) =>
      wrapHtml(
        "Trial ending soon",
        `<p>Hi,</p><p>The free trial for <strong>${companyName}</strong> ends in ${days ?? "a few"} day(s). Choose Essentials or Premium to keep writing to your books.</p>`,
      ),
  },
  trial_expired: {
    subject: "Your Alfa trial has ended",
    html: ({ companyName }) =>
      wrapHtml(
        "Trial ended",
        `<p>Hi,</p><p>The trial for <strong>${companyName}</strong> has ended. Your books are read-only until you choose a plan — nothing has been deleted.</p>`,
      ),
  },
  renewal_reminder: {
    subject: "Your Alfa subscription renews soon",
    html: ({ companyName }) =>
      wrapHtml(
        "Upcoming renewal",
        `<p>Hi,</p><p>The subscription for <strong>${companyName}</strong> renews in about 7 days. You can update payment details or cancel from billing settings.</p>`,
      ),
  },
  lapsed_nudge: {
    subject: "Come back to Alfa — your books are waiting",
    html: ({ companyName }) =>
      wrapHtml(
        "Ready when you are",
        `<p>Hi,</p><p><strong>${companyName}</strong> still has its books on Alfa in read-only mode. Choose a plan to start editing again.</p>`,
      ),
  },
  subscription_started: {
    subject: "You're on a paid Alfa plan",
    html: ({ companyName }) =>
      wrapHtml(
        "Subscription started",
        `<p>Hi,</p><p><strong>${companyName}</strong> is now on a paid plan. Thank you — Stripe will email receipts separately.</p>`,
      ),
  },
  payment_failed: {
    subject: "Payment failed for your Alfa subscription",
    html: ({ companyName }) =>
      wrapHtml(
        "Payment failed",
        `<p>Hi,</p><p>We could not take payment for <strong>${companyName}</strong>. Update your card soon to avoid losing write access.</p>`,
      ),
  },
  payment_recovered: {
    subject: "Payment received — Alfa access restored",
    html: ({ companyName }) =>
      wrapHtml(
        "Payment received",
        `<p>Hi,</p><p>Payment succeeded for <strong>${companyName}</strong>. You're all set.</p>`,
      ),
  },
  subscription_canceled: {
    subject: "Your Alfa subscription was cancelled",
    html: ({ companyName }) =>
      wrapHtml(
        "Subscription cancelled",
        `<p>Hi,</p><p>The subscription for <strong>${companyName}</strong> is cancelled or set to end. You can resubscribe anytime from billing settings.</p>`,
      ),
  },
  complimentary_granted: {
    subject: "Complimentary Alfa access granted",
    html: ({ companyName }) =>
      wrapHtml(
        "Complimentary access",
        `<p>Hi,</p><p><strong>${companyName}</strong> has been granted complimentary unlimited access. Enjoy the full product.</p>`,
      ),
  },
};

async function recipientEmails(companyId: string): Promise<string[]> {
  const db = getDb();
  const [company] = await db
    .select({ email: companies.email })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);

  const admins = await db
    .select({ email: users.email })
    .from(companyMemberships)
    .innerJoin(users, eq(users.id, companyMemberships.userId))
    .where(
      and(
        eq(companyMemberships.companyId, companyId),
        eq(companyMemberships.role, "admin"),
      ),
    );

  const set = new Set<string>();
  for (const a of admins) {
    if (a.email) set.add(a.email.toLowerCase());
  }
  if (company?.email) set.add(company.email.toLowerCase());
  return [...set];
}

/** Send once per (company, template, periodKey). Returns false if already sent. */
export async function sendBillingEmail(
  companyId: string,
  template: BillingEmailTemplate,
  periodKey: string,
  extra?: { days?: number },
): Promise<boolean> {
  const db = getDb();

  // Skip lifecycle mail for complimentary (except grant notice).
  if (template !== "complimentary_granted") {
    try {
      const e = await getEntitlements(companyId);
      if (e.complimentary) return false;
    } catch {
      /* continue */
    }
  }

  try {
    await db.insert(billingEmailLog).values({
      companyId,
      template,
      periodKey,
    });
  } catch {
    return false;
  }

  const [company] = await db
    .select({ name: companies.name })
    .from(companies)
    .where(eq(companies.id, companyId))
    .limit(1);
  const to = await recipientEmails(companyId);
  if (to.length === 0) return false;

  const content = CONTENT[template];
  await sendEmail({
    to,
    subject: content.subject,
    html: content.html({
      companyName: company?.name ?? "Your company",
      days: extra?.days,
    }),
  });
  return true;
}

function startOfUtcDay(d: Date): Date {
  return new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate()),
  );
}

function daysBetween(a: Date, b: Date): number {
  const ms = startOfUtcDay(b).getTime() - startOfUtcDay(a).getTime();
  return Math.round(ms / (24 * 60 * 60 * 1000));
}

/** Daily cron: trial ending, expired, renewals, lapsed nudges. */
export async function processBillingLifecycleEmails(): Promise<{
  sent: number;
}> {
  const db = getDb();
  const now = new Date();
  let sent = 0;

  const trialing = await db
    .select()
    .from(companyBilling)
    .where(
      and(
        eq(companyBilling.status, "trialing"),
        isNotNull(companyBilling.trialEndsAt),
      ),
    );

  for (const row of trialing) {
    if (!row.trialEndsAt) continue;
    const daysLeft = daysBetween(now, row.trialEndsAt);
    if (daysLeft === 7 || daysLeft === 3 || daysLeft === 1) {
      if (
        await sendBillingEmail(
          row.companyId,
          "trial_ending",
          `ending_${daysLeft}_${row.trialEndsAt.toISOString().slice(0, 10)}`,
          { days: daysLeft },
        )
      ) {
        sent += 1;
      }
    }
    if (daysLeft <= 0) {
      if (
        await sendBillingEmail(
          row.companyId,
          "trial_expired",
          `expired_${row.trialEndsAt.toISOString().slice(0, 10)}`,
        )
      ) {
        sent += 1;
      }
      // Flip status so entitlements treat as read-only consistently.
      // Keep plan=trial; status stays trialing but trialEndsAt in past → readOnly.
    }
  }

  const active = await db
    .select()
    .from(companyBilling)
    .where(
      and(
        inArray(companyBilling.status, ["active", "past_due"]),
        eq(companyBilling.cancelAtPeriodEnd, false),
        isNotNull(companyBilling.currentPeriodEnd),
      ),
    );

  for (const row of active) {
    if (!row.currentPeriodEnd) continue;
    const daysLeft = daysBetween(now, row.currentPeriodEnd);
    if (daysLeft === 7) {
      if (
        await sendBillingEmail(
          row.companyId,
          "renewal_reminder",
          `renew_${row.currentPeriodEnd.toISOString().slice(0, 10)}`,
        )
      ) {
        sent += 1;
      }
    }
  }

  // Lapsed: trial ended or canceled, no complimentary.
  const allBilling = await db
    .select()
    .from(companyBilling)
    .where(eq(companyBilling.access, "standard"));

  for (const row of allBilling) {
    const trialLapsed =
      row.status === "trialing" &&
      row.trialEndsAt &&
      row.trialEndsAt.getTime() < now.getTime();
    const canceled = row.status === "canceled" || row.status === "unpaid";
    if (!trialLapsed && !canceled) continue;

    const anchor =
      trialLapsed && row.trialEndsAt ? row.trialEndsAt : row.updatedAt;
    const daysSince = daysBetween(anchor, now);
    if (daysSince === 1 || daysSince === 7 || daysSince === 14) {
      if (
        await sendBillingEmail(
          row.companyId,
          "lapsed_nudge",
          `lapse_${daysSince}_${anchor.toISOString().slice(0, 10)}`,
        )
      ) {
        sent += 1;
      }
    }
  }

  return { sent };
}
