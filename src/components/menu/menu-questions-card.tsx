"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { PanelLeft } from "lucide-react";
import { answerMenuQuestions, skipMenuQuestions } from "@/actions/menu";
import { Button } from "@/components/ui/button";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { toast } from "@/components/ui/toast-store";
import { MenuQuestions } from "@/components/menu/menu-questions";
import type { MenuBundle } from "@/lib/menu/features";

/**
 * The onboarding menu questions, for people who never answered them (invited
 * members). Shows until they answer or skip.
 */
export function MenuQuestionsCard({ bundles }: { bundles: MenuBundle[] }) {
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

  return (
    <section
      aria-labelledby="menu-questions-title"
      className="mt-6 flex flex-wrap items-start gap-4 rounded-2xl border border-border bg-surface px-5 py-4"
    >
      <PanelLeft className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
      <form
        noValidate
        onSubmit={preventResetSubmit((formData) =>
          run(() => answerMenuQuestions(formData), "Menu saved."),
        )}
        className="min-w-0 flex-1 space-y-4"
      >
        <div>
          <h2 id="menu-questions-title" className="font-medium text-foreground">
            Set up your menu
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Answer a few questions so your sidebar only shows what you use. You
            can change it any time in Settings → Your menu.
          </p>
        </div>
        <MenuQuestions bundles={bundles} disabled={pending} idPrefix="dashboard-menu" />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button type="submit" disabled={pending}>
            Set up my menu
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => run(() => skipMenuQuestions())}
          >
            Show me everything
          </Button>
        </div>
      </form>
    </section>
  );
}
