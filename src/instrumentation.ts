import type { Instrumentation } from "next";
import { logPlatformEvent } from "@/lib/platform-log";

export function register() {
  // Reserved for future OpenTelemetry / provider hooks.
}

export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  const message = err instanceof Error ? err.message : String(err);
  const digest =
    typeof err === "object" && err !== null && "digest" in err
      ? String((err as { digest?: unknown }).digest)
      : undefined;

  await logPlatformEvent({
    level: "error",
    source: "next.onRequestError",
    message,
    digest,
    meta: {
      path: request.path,
      method: request.method,
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
    },
  });
};
