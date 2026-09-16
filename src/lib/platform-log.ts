import "server-only";
import { lt } from "drizzle-orm";
import { getDb, hasDatabaseClient } from "@/db";
import { platformLogs, type PlatformLogLevel } from "@/db/schema";

export type LogPlatformEventParams = {
  level: PlatformLogLevel;
  source: string;
  message: string;
  digest?: string | null;
  companyId?: string | null;
  actorUserId?: string | null;
  meta?: Record<string, unknown>;
};

/**
 * Persist an app-level log event and mirror to console JSON.
 * Never throws — logging must not break the request path.
 */
export async function logPlatformEvent(
  params: LogPlatformEventParams,
): Promise<void> {
  const payload = {
    level: params.level,
    msg: params.source,
    message: params.message,
    digest: params.digest ?? undefined,
    companyId: params.companyId ?? undefined,
    actorUserId: params.actorUserId ?? undefined,
    ...(params.meta ?? {}),
  };
  if (params.level === "error") {
    console.error(JSON.stringify(payload));
  } else if (params.level === "warn") {
    console.warn(JSON.stringify(payload));
  } else {
    console.info(JSON.stringify(payload));
  }

  if (!hasDatabaseClient()) return;
  try {
    const db = getDb();
    await db.insert(platformLogs).values({
      level: params.level,
      source: params.source,
      message: params.message.slice(0, 4000),
      digest: params.digest ?? null,
      companyId: params.companyId ?? null,
      actorUserId: params.actorUserId ?? null,
      meta: params.meta ?? null,
    });
  } catch (err) {
    console.error(
      JSON.stringify({
        level: "error",
        msg: "platform_log.insert_failed",
        error: err instanceof Error ? err.message : String(err),
      }),
    );
  }
}

/** Delete platform_logs older than `days` (default 90). */
export async function purgeOldPlatformLogs(days = 90): Promise<number> {
  if (!hasDatabaseClient()) return 0;
  const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const db = getDb();
  const deleted = await db
    .delete(platformLogs)
    .where(lt(platformLogs.createdAt, cutoff))
    .returning({ id: platformLogs.id });
  return deleted.length;
}
