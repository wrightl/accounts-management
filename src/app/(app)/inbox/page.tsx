import { guardTenantPage } from "@/lib/auth";
import { ensureLocalUser } from "@/lib/users";
import {
  countUnreadNotifications,
  listNotificationPage,
} from "@/lib/notifications";
import { ListPagination } from "@/components/ui/list-pagination";
import { listPageHref, parseListPaging } from "@/lib/list-paging";
import { InboxClient } from "@/components/notifications/inbox-client";
import { PageHeader } from "@/components/ui/page-header";

export default async function InboxPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const session = await guardTenantPage("workspace:read");
  const params = await searchParams;
  const filter = params.filter === "unread" ? "unread" : "all";
  const userId =
    session.localUserId ?? (await ensureLocalUser(session));

  const [{ rows: notifications, ...paging }, unreadCount] = await Promise.all([
    listNotificationPage({
      userId,
      companyId: session.companyId!,
      filter,
      ...parseListPaging(params),
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
      {/* A new page or filter starts the list's local state afresh. */}
      <InboxClient
        key={`${filter}:${paging.page}:${paging.pageSize}`}
        initial={notifications}
        filter={filter}
      />
      <ListPagination {...paging} href={(to) => listPageHref("/inbox", params, to)} />
    </div>
  );
}
