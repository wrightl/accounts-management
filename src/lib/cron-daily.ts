import "server-only";
import { generateRecurringInvoices } from "@/lib/invoices/recurring-generate";
import { drainSendJobs, enqueueOverdueReminders } from "@/lib/outbox";
import { updatePlatformSettings } from "@/lib/platform-settings";
import { purgeOldPlatformLogs } from "@/lib/platform-log";

/**
 * The daily cron's work, shared by the scheduled route and the platform
 * "Run daily cron" button so a manual run does exactly what the schedule does.
 * Notification and digest steps dedupe, so running twice in a day is safe.
 */
export async function runDailyCron() {
  const recurring = await generateRecurringInvoices();

  let reminders: Record<string, unknown> = { skipped: "no database" };
  let purged = 0;
  let billingEmails: Record<string, unknown> = { skipped: "no database" };
  let notifications: Record<string, unknown> = { skipped: "no database" };
  let weeklyClose: Record<string, unknown> = { skipped: "no database" };

  if (process.env.DATABASE_URL) {
    const queued = await enqueueOverdueReminders();
    const drained = await drainSendJobs();
    reminders = { queued, ...drained };
    purged = await purgeOldPlatformLogs(90);
    const { processBillingLifecycleEmails } = await import("@/lib/billing/emails");
    billingEmails = await processBillingLifecycleEmails();
    const { runNotificationScanners } = await import("@/lib/notifications");
    notifications = await runNotificationScanners();
    const { sendWeeklyCloseDigests } = await import("@/lib/close/digest");
    weeklyClose = await sendWeeklyCloseDigests();
    await updatePlatformSettings({ lastCronDailyAt: new Date() });
  }

  return { recurring, reminders, purged, billingEmails, notifications, weeklyClose };
}
