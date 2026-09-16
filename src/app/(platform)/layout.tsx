import { currentUser } from "@clerk/nextjs/server";
import { requirePlatformAdmin } from "@/lib/platform";
import { PlatformShell } from "@/components/platform/shell";
import { AuthNotConfigured } from "@/components/auth-notice";
import { isAuthConfigured } from "@/env";
import { ensureLocalUser, findLocalUser } from "@/lib/users";
import { hasDatabaseClient } from "@/db";

export default async function PlatformLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  if (!isAuthConfigured()) return <AuthNotConfigured />;
  let user = await requirePlatformAdmin();
  const clerkUser = await currentUser();
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
