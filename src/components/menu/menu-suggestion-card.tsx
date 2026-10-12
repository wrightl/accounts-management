"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PanelLeft } from "lucide-react";
import { addMenuFeatures, dismissMenuSuggestion } from "@/actions/menu";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast-store";
import type { MenuSuggestion } from "@/lib/menu/suggestions";

/** One suggestion at a time, so it never becomes another list to work through. */
export function MenuSuggestionCard({
  suggestion,
  labels,
}: {
  suggestion: MenuSuggestion;
  /** Menu labels of the pages this adds, e.g. ["Recurring"]. */
  labels: string[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function run(action: () => Promise<{ ok: boolean; error?: string }>, done?: string) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        setError(result.error ?? "Something went wrong. Try again.");
        return;
      }
      if (done) toast(done);
      router.refresh();
    });
  }

  const pages = labels.join(", ");

  return (
    <section
      aria-labelledby="menu-suggestion-title"
      className="mt-6 flex flex-wrap items-start gap-4 rounded-2xl border border-border bg-surface px-5 py-4"
    >
      <PanelLeft className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
      <div className="min-w-0 flex-1">
        <h2 id="menu-suggestion-title" className="font-medium text-foreground">
          {suggestion.title}
        </h2>
        <p className="mt-0.5 text-sm text-muted">{suggestion.reason}</p>
        <p className="mt-1 text-sm text-muted">
          Adds to your menu: <span className="text-foreground">{pages}</span>
        </p>
        {error ? (
          <p role="alert" className="mt-1 text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          disabled={pending}
          onClick={() =>
            run(() => addMenuFeatures(suggestion.features), `Added ${pages} to your menu.`)
          }
        >
          Add to my menu
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => run(() => dismissMenuSuggestion(suggestion.id))}
        >
          No thanks
        </Button>
      </div>
    </section>
  );
}
