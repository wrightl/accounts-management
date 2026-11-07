import { BackLink } from "@/components/ui/back-link";
import { notFound, redirect } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { ensureLocalUser } from "@/lib/users";
import {
  getNotificationForUser,
  markNotificationRead,
} from "@/lib/notifications";
import { DisplayDate } from "@/components/date-format-provider";
import { PAGE_WIDTH } from "@/components/ui/page-width";

export default async function InboxDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await guardTenantPage("workspace:read");
  const { id } = await params;
  const userId =
    session.localUserId ?? (await ensureLocalUser(session));
  const notification = await getNotificationForUser(
    id,
    userId,
    session.companyId!,
  );
  if (!notification) notFound();

  if (!notification.readAt) {
    await markNotificationRead(id, userId, session.companyId!);
  }

  if (notification.href) {
    redirect(notification.href);
  }

  return (
    <div className={PAGE_WIDTH.reading}>
      <BackLink href="/inbox">Back to inbox</BackLink>
      <article className="mt-4 rounded-2xl border border-border bg-surface p-6">
        <h1 className="font-display text-2xl font-semibold">
          {notification.title}
        </h1>
        <p className="mt-1 text-xs text-muted">
          <DisplayDate value={notification.createdAt} withTime />
        </p>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">
          {notification.body}
        </p>
      </article>
    </div>
  );
}
