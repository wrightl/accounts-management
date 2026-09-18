import "server-only";
import { logPlatformEvent } from "@/lib/platform-log";

export type ReportErrorParams = {
  source: string;
  error: unknown;
  companyId?: string | null;
  actorUserId?: string | null;
  meta?: Record<string, unknown>;
};

/**
 * Central error reporting hook.
 *
 * Today: structured console + `platform_logs` via {@link logPlatformEvent}.
 * Swap the body for Sentry/Datadog later without touching call sites.
 */
export async function reportError(params: ReportErrorParams): Promise<void> {
  const message =
    params.error instanceof Error
      ? params.error.message
      : String(params.error);
  const digest =
    params.error instanceof Error && "digest" in params.error
      ? String((params.error as { digest?: string }).digest ?? "")
      : null;

  await logPlatformEvent({
    level: "error",
    source: params.source,
    message,
    digest: digest || null,
    companyId: params.companyId,
    actorUserId: params.actorUserId,
    meta: {
      ...params.meta,
      stack:
        params.error instanceof Error ? params.error.stack?.slice(0, 2000) : undefined,
    },
  });
}
