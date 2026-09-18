import { requirePlatformAdmin } from "@/lib/platform";
import { safeCurrentUser } from "@/lib/auth";
import { PlatformShell } from "@/components/platform/shell";
import { ensureLocalUser, findLocalUser } from "@/lib/users";
import { hasDatabaseClient } from "@/db";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  let user = await requirePlatformAdmin();
  const clerkUser = await safeCurrentUser();
  const avatarUrl = clerkUser?.imageUrl ?? null;

  if (hasDatabaseClient()) {
    await ensureLocalUser(user);
    const local = await findLocalUser(user.userId);
    if (local) {
      user = {
        ...user,
        name: user.name ?? local.name,
        localUserId: local.id,
        role: local.role,
      };
    }
  }

  return (
    <PlatformShell userName={user.name} avatarUrl={avatarUrl}>
      {children}
    </PlatformShell>
  );
}
