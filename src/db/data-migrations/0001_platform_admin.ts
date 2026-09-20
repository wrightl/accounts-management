import { seedPlatformAdmins } from "@/db/seed";
import { sendClerkInvitation } from "@/lib/clerk-invite";
import type { DataMigration } from "./types";

/** Bootstrap platform operator — cannot be created via UI until one exists. */
export const PLATFORM_ADMIN_BOOTSTRAP_EMAIL =
  "lee+admin@dotanddashconsulting.com";

export const migration: DataMigration = {
  id: "0001_platform_admin",
  async up(ctx) {
    await seedPlatformAdmins(ctx.db, [PLATFORM_ADMIN_BOOTSTRAP_EMAIL]);
    ctx.queueEffect(async () => {
      if (!process.env.CLERK_SECRET_KEY) {
        console.warn(
          `CLERK_SECRET_KEY unset; skipped Clerk invite for ${PLATFORM_ADMIN_BOOTSTRAP_EMAIL}`,
        );
        return;
      }
      const invited = await sendClerkInvitation(PLATFORM_ADMIN_BOOTSTRAP_EMAIL);
      if (!invited.ok) {
        throw new Error(
          `Clerk invitation failed for ${PLATFORM_ADMIN_BOOTSTRAP_EMAIL}: ${invited.error}`,
        );
      }
    });
  },
};
