"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition, type ReactNode } from "react";
import {
  ArrowRight,
  CircleCheck,
  CircleDashed,
  CircleDot,
  CircleMinus,
  History,
  Pause,
} from "lucide-react";
import {
  hideDataOnboarding,
  markStepVisited,
  pauseDataOnboarding,
  resumeDataOnboarding,
  setRecordsStartDate,
  setStepOverride,
  startDataOnboarding,
} from "@/actions/data-onboarding";
import type { ActionResult } from "@/actions/result";
import { Button, buttonClasses } from "@/components/ui/button";
import { Input, Label } from "@/components/ui/form";
import { toast } from "@/components/ui/toast-store";
import type { ChecklistStep, StepState } from "@/lib/data-onboarding/checklist";
import type { DataOnboardingView } from "@/lib/data-onboarding/queries";
import type { StepId } from "@/lib/data-onboarding/steps";
import { cn } from "@/lib/utils";

/** Where "Back to checklist" lands. */
export const DATA_ONBOARDING_ANCHOR = "data-setup";

const STATE_ICON: Record<StepState, { Icon: typeof CircleCheck; className: string; label: string }> = {
  todo: { Icon: CircleDashed, className: "text-muted", label: "To do" },
  in_progress: { Icon: CircleDot, className: "text-navy", label: "In progress" },
  done: { Icon: CircleCheck, className: "text-green-700", label: "Done" },
  skipped: { Icon: CircleMinus, className: "text-muted", label: "Skipped" },
  not_applicable: { Icon: CircleMinus, className: "text-muted", label: "Doesn't apply" },
};

export function DataOnboardingCard({
  view,
  canWrite,
  allowedSteps,
  today,
}: {
  view: DataOnboardingView;
  /** Can start, pause and tick off steps. */
  canWrite: boolean;
  /** Steps this person has the permission to do. */
  allowedSteps: StepId[];
  today: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const { checklist } = view;

  function run(action: () => Promise<ActionResult>, done?: string) {
    setError(null);
    startTransition(async () => {
      const result = await action();
      if (!result.ok) {
        // A field error says more than the form-level summary.
        setError(Object.values(result.fieldErrors ?? {})[0] ?? result.error);
        return;
      }
      if (done) toast(done);
      router.refresh();
    });
  }

  /** Remember the step before leaving, so Continue comes back to it. */
  function open(step: ChecklistStep, href: string) {
    startTransition(async () => {
      if (canWrite) await markStepVisited(step.id);
      router.push(href);
    });
  }

  const errorLine = error ? (
    <p role="alert" className="mt-2 text-sm text-destructive">
      {error}
    </p>
  ) : null;

  if (view.status === "not_started") {
    return (
      <section
        id={DATA_ONBOARDING_ANCHOR}
        aria-labelledby="data-setup-title"
        className="mt-6 flex flex-wrap items-start gap-4 rounded-2xl border border-border bg-surface px-5 py-4"
      >
        <History className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden />
        <div className="min-w-0 flex-1">
          <h2 id="data-setup-title" className="font-medium text-foreground">
            Bring in your history
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            Load your past bank statements, invoices and expenses so your figures are complete
            from day one. A short checklist takes you through it, and you can pause any time.
          </p>
          {errorLine}
        </div>
        <div className="flex flex-wrap gap-2">
          <Button type="button" disabled={pending} onClick={() => run(startDataOnboarding)}>
            Start
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => run(hideDataOnboarding, "You can start this later from Settings.")}
          >
            Not now
          </Button>
        </div>
      </section>
    );
  }

  const progress = `${checklist.resolvedCount} of ${checklist.total} done`;

  if (view.status === "paused") {
    return (
      <section
        id={DATA_ONBOARDING_ANCHOR}
        aria-label="History setup"
        className="mt-6 flex flex-wrap items-center gap-4 rounded-2xl border border-border bg-surface px-5 py-3"
      >
        <Pause className="h-4 w-4 shrink-0 text-muted" aria-hidden />
        <p className="min-w-0 flex-1 text-sm text-muted">
          History setup paused · {progress}
        </p>
        {canWrite ? (
          <Button
            type="button"
            variant="secondary"
            disabled={pending}
            onClick={() => run(resumeDataOnboarding)}
          >
            Resume
          </Button>
        ) : null}
        {errorLine}
      </section>
    );
  }

  const continueStep = checklist.steps.find((s) => s.id === checklist.continueStepId);
  const percent = Math.round((checklist.resolvedCount / Math.max(checklist.total, 1)) * 100);

  return (
    <section
      id={DATA_ONBOARDING_ANCHOR}
      aria-labelledby="data-setup-title"
      className="mt-6 rounded-2xl border border-border bg-surface px-5 py-4"
    >
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0 flex-1">
          <h2 id="data-setup-title" className="font-display text-lg font-semibold">
            {checklist.complete ? "Your history is in" : "Bring in your history"}
          </h2>
          <p className="mt-0.5 text-sm text-muted">
            {checklist.complete
              ? "Everything on the checklist is done. Your figures now cover your start date onwards."
              : "Work through these in any order. Progress saves as you go, so you can pause and come back."}
          </p>
        </div>
        {canWrite ? (
          <div className="flex flex-wrap gap-2">
            {checklist.complete ? (
              <Button type="button" disabled={pending} onClick={() => run(hideDataOnboarding)}>
                Hide
              </Button>
            ) : (
              <>
                {continueStep?.href && allowedSteps.includes(continueStep.id) ? (
                  <Button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      open(
                        continueStep,
                        continueStep.state === "in_progress" && continueStep.extraLink
                          ? continueStep.extraLink.href
                          : continueStep.href!,
                      )
                    }
                  >
                    Continue
                    <ArrowRight className="h-4 w-4" aria-hidden />
                  </Button>
                ) : null}
                <Button
                  type="button"
                  variant="ghost"
                  disabled={pending}
                  onClick={() => run(pauseDataOnboarding, "Paused. Resume from your dashboard.")}
                >
                  Pause
                </Button>
              </>
            )}
          </div>
        ) : null}
      </div>

      <div className="mt-4 flex items-center gap-3">
        <div
          role="progressbar"
          aria-label="History setup progress"
          aria-valuemin={0}
          aria-valuemax={checklist.total}
          aria-valuenow={checklist.resolvedCount}
          aria-valuetext={progress}
          className="h-2 flex-1 overflow-hidden rounded-full bg-wash"
        >
          <div className="h-full rounded-full bg-brand" style={{ width: `${percent}%` }} />
        </div>
        <span className="shrink-0 text-sm text-muted">{progress}</span>
      </div>
      {errorLine}

      <ol className="mt-4 divide-y divide-border">
        {checklist.steps.map((step) => (
          <StepRow
            key={step.id}
            step={step}
            current={step.id === checklist.continueStepId}
            canWrite={canWrite}
            allowed={allowedSteps.includes(step.id)}
            pending={pending}
            recordsStartDate={view.recordsStartDate ?? view.suggestedStartDate}
            today={today}
            onOpen={(href) => open(step, href)}
            onOverride={(state, done) => run(() => setStepOverride(step.id, state), done)}
            onSaveStartDate={(formData) => run(() => setRecordsStartDate(formData), "Start date saved.")}
          />
        ))}
      </ol>
    </section>
  );
}

function StepRow({
  step,
  current,
  canWrite,
  allowed,
  pending,
  recordsStartDate,
  today,
  onOpen,
  onOverride,
  onSaveStartDate,
}: {
  step: ChecklistStep;
  current: boolean;
  canWrite: boolean;
  allowed: boolean;
  pending: boolean;
  recordsStartDate: string;
  today: string;
  onOpen: (href: string) => void;
  onOverride: (state: "done" | "skipped" | "not_applicable" | null, done?: string) => void;
  onSaveStartDate: (formData: FormData) => void;
}) {
  const { Icon, className, label } = STATE_ICON[step.state];
  const resolved = step.state === "done" || step.state === "skipped" || step.state === "not_applicable";
  const titleId = `data-setup-step-${step.id}`;

  return (
    <li
      aria-labelledby={titleId}
      aria-current={current ? "step" : undefined}
      className={cn("flex flex-wrap items-start gap-3 py-3", current && "-mx-2 rounded-xl bg-wash px-2")}
    >
      <Icon className={cn("mt-0.5 h-5 w-5 shrink-0", className)} aria-label={label} role="img" />
      <div className="min-w-0 flex-1">
        <p
          id={titleId}
          className={cn("font-medium", resolved && step.state !== "done" ? "text-muted" : "text-foreground")}
        >
          {step.title}
        </p>
        <p className="mt-0.5 text-sm text-muted">{step.detail ?? step.why}</p>
        {step.extraLink && allowed ? (
          <button
            type="button"
            className="mt-1 text-sm font-medium text-navy underline underline-offset-2 hover:no-underline"
            onClick={() => onOpen(step.extraLink!.href)}
          >
            {step.extraLink.label}
          </button>
        ) : null}
        {step.id === "start_date" && canWrite && allowed ? (
          <StartDateForm
            defaultValue={recordsStartDate}
            today={today}
            pending={pending}
            onSave={onSaveStartDate}
          />
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {!allowed ? (
          <span className="text-sm text-muted">Needs an admin</span>
        ) : step.href && !resolved ? (
          <Link
            href={step.href}
            className={buttonClasses(current ? "primary" : "ghost")}
            onClick={(e) => {
              e.preventDefault();
              onOpen(step.href!);
            }}
          >
            {step.state === "in_progress" ? "Continue" : "Start"}
          </Link>
        ) : step.href && step.state === "done" ? (
          <Link href={step.href} className={buttonClasses("ghost")}>
            Review
          </Link>
        ) : null}
        {canWrite ? (
          step.source === "manual" ? (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={() => onOverride(null)}
            >
              Reopen
            </Button>
          ) : !resolved ? (
            <details className="relative">
              <summary className="cursor-pointer list-none rounded-full px-3 py-2 text-sm text-muted hover:bg-wash">
                More<span className="sr-only"> options for {step.title}</span>
              </summary>
              <div className="absolute right-0 z-10 mt-1 flex w-44 flex-col rounded-xl border border-border bg-surface p-1 shadow-lg">
                <MenuItem disabled={pending} onClick={() => onOverride("done", "Marked as done.")}>
                  Mark as done
                </MenuItem>
                <MenuItem disabled={pending} onClick={() => onOverride("skipped")}>
                  Skip for now
                </MenuItem>
                <MenuItem disabled={pending} onClick={() => onOverride("not_applicable")}>
                  Doesn&apos;t apply to me
                </MenuItem>
              </div>
            </details>
          ) : null
        ) : null}
      </div>
    </li>
  );
}

function MenuItem({
  children,
  disabled,
  onClick,
}: {
  children: ReactNode;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      className="rounded-lg px-3 py-2 text-left text-sm text-foreground hover:bg-wash disabled:opacity-50"
    >
      {children}
    </button>
  );
}

function StartDateForm({
  defaultValue,
  today,
  pending,
  onSave,
}: {
  defaultValue: string;
  today: string;
  pending: boolean;
  onSave: (formData: FormData) => void;
}) {
  return (
    <form
      className="mt-2 flex flex-wrap items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        onSave(new FormData(e.currentTarget));
      }}
    >
      <div>
        <Label htmlFor="recordsStartDate" className="sr-only">
          Records start date
        </Label>
        <Input
          id="recordsStartDate"
          name="recordsStartDate"
          type="date"
          required
          max={today}
          defaultValue={defaultValue}
          className="w-auto"
        />
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        Save
      </Button>
    </form>
  );
}
