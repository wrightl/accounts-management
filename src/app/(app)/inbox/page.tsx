import { guardTenantPage } from "@/lib/auth";
import { ensureLocalUser } from "@/lib/users";
import {
  countUnreadNotifications,
  listNotifications,
} from "@/lib/notifications";
import { InboxClient } from "@/components/notifications/inbox-client";
import { PageHeader } from "@/components/ui/page-header";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<{ filter?: string }>;
}) {
  const session = await guardTenantPage("workspace:read");
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
      <PageHeader
        className="mb-6"
        title="Inbox"
        description={
          unreadCount > 0
            ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}`
            : "You're all caught up"
        }
      />
      <InboxClient initial={notifications} filter={filter} />
    </div>
  );
}
