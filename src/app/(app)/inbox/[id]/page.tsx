import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { ensureLocalUser } from "@/lib/users";
import {
  getNotificationForUser,
  markNotificationRead,
} from "@/lib/notifications";

export default async function InboxDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const session = await guardTenantPage("accounts:read");
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
    <div className="mx-auto max-w-xl">
      <Link
        href="/inbox"
        className="text-sm text-muted hover:text-foreground"
      >
        ← Back to inbox
      </Link>
      <article className="mt-4 rounded-2xl border border-border bg-surface p-6">
        <h1 className="font-display text-2xl font-semibold">
          {notification.title}
        </h1>
        <p className="mt-1 text-xs text-muted">
          {new Intl.DateTimeFormat("en-GB", {
            day: "numeric",
            month: "short",
            year: "numeric",
            hour: "2-digit",
            minute: "2-digit",
          }).format(notification.createdAt)}
        </p>
        <p className="mt-4 whitespace-pre-wrap text-sm leading-relaxed">
          {notification.body}
        </p>
      </article>
    </div>
  );
}
