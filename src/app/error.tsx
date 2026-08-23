"use client";

import { buttonClasses } from "@/components/ui/button";

export default function Error({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="mx-auto max-w-lg px-6 py-16">
      <h1 className="font-display text-2xl font-semibold">Something went wrong</h1>
      <p className="mt-2 text-muted">
        The page failed to load. Try again, or go back to the dashboard.
      </p>
      {error.digest ? (
        <p className="mt-2 font-mono text-xs text-muted">Ref {error.digest}</p>
      ) : null}
      <div className="mt-6 flex gap-3">
        <button type="button" className={buttonClasses("primary")} onClick={reset}>
          Try again
        </button>
        <a href="/dashboard" className={buttonClasses("secondary")}>
          Dashboard
        </a>
      </div>
    </div>
  );
}
