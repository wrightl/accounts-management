import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import type { EntityType } from "@/db/schema";
import { stepsFor, type StepId } from "@/lib/data-onboarding/steps";

/**
 * Shown on a page opened from the history checklist (`?from=setup`), so
 * people know where they are and can get back to it.
 */
export function SetupStepBanner({
  stepId,
  entityType,
  from,
}: {
  stepId: StepId;
  entityType: EntityType | null;
  /** The page's `from` search param. */
  from: string | undefined;
}) {
  if (from !== "setup") return null;
  const steps = stepsFor(entityType);
  const index = steps.findIndex((s) => s.id === stepId);
  if (index < 0) return null;

  return (
    <div className="mb-6 flex flex-wrap items-center gap-x-3 gap-y-1 rounded-2xl border border-border bg-wash px-4 py-2.5 text-sm">
      <span className="text-muted">
        Step {index + 1} of {steps.length}
      </span>
      <span className="font-medium text-foreground">{steps[index]!.title}</span>
      <Link
        href="/dashboard#data-setup"
        className="ml-auto inline-flex items-center gap-1 font-medium text-navy underline underline-offset-2 hover:no-underline"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        Back to checklist
      </Link>
    </div>
  );
}
