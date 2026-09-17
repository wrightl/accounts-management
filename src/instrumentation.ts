import type { Instrumentation } from "next";
import { reportError } from "@/lib/errors/report";

export function register() {
  // Hook for future OpenTelemetry / Sentry init.
}

/**
 * Next.js request-error instrumentation. Routes through {@link reportError}
 * so production errors land in platform_logs (and a future Sentry SDK).
 */
export const onRequestError: Instrumentation.onRequestError = async (
  err,
  request,
  context,
) => {
  await reportError({
    source: "next.onRequestError",
    error: err,
    meta: {
      path: request.path,
      method: request.method,
      routerKind: context.routerKind,
      routePath: context.routePath,
      routeType: context.routeType,
    },
  });
};
