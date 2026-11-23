import { Card } from "@/components/ui/card";
import { notFound, redirect } from "next/navigation";
import { guardTenantPage } from "@/lib/auth";
import { ensureLocalUser } from "@/lib/users";
import {
  getNotificationForUser,
  markNotificationRead,
} from "@/lib/notifications";
import { DisplayDate } from "@/components/date-format-provider";
import { PAGE_WIDTH } from "@/components/ui/page-width";
import { PageHeader } from "@/components/ui/page-header";

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
      <PageHeader
        backHref="/inbox"
        backLabel="Inbox"
        title={notification.title}
        description={<DisplayDate value={notification.createdAt} withTime />}
      />
      <Card className="mt-6">
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{notification.body}</p>
      </Card>
    </div>
  );
}
