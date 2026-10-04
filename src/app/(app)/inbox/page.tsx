import { guardTenantPage } from "@/lib/auth";
import { ensureLocalUser } from "@/lib/users";
import {
  countUnreadNotifications,
  listNotifications,
} from "@/lib/notifications";
import { InboxClient } from "@/components/notifications/inbox-client";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await guardTenantPage("accounts:read");
  const params = await searchParams;
  const filter = params.filter === "unread" ? "unread" : "all";
  const userId =
    session.localUserId ?? (await ensureLocalUser(session));

  const [notifications, unreadCount] = await Promise.all([
    listNotifications({
      userId,
      companyId: session.companyId!,
      filter,
      limit: 100,
    }),
    countUnreadNotifications(userId, session.companyId!),
  ]);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="font-display text-2xl font-semibold">Inbox</h1>
          <p className="mt-1 text-sm text-muted">
            {unreadCount > 0
              ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
              : "You're all caught up"}
          </p>
        </div>
      </div>
      <InboxClient initial={notifications} filter={filter} />
    </div>
  );
}
