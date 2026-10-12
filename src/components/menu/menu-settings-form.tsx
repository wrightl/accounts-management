"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { updateMenuFeatures } from "@/actions/menu";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { toast } from "@/components/ui/toast-store";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { MenuQuestions } from "@/components/menu/menu-questions";
import {
  featuresFromAnswers,
  type MenuBundle,
  type MenuFeature,
} from "@/lib/menu/features";

export interface MenuOption {
  feature: MenuFeature;
  label: string;
}

function BundleCheckbox({
  bundle,
  options,
  enabled,
  disabled,
  onToggle,
}: {
  bundle: MenuBundle;
  options: MenuOption[];
  enabled: Set<MenuFeature>;
  disabled: boolean;
  onToggle: (features: MenuFeature[], on: boolean) => void;
}) {
  const onCount = options.filter((o) => enabled.has(o.feature)).length;
  const all = onCount === options.length;
  const some = onCount > 0 && !all;
  const headingId = `bundle-${bundle.id}`;

  return (
    <fieldset
      aria-labelledby={headingId}
      className="rounded-2xl border border-border bg-surface px-5 py-4"
    >
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={all}
          ref={(el) => {
            if (el) el.indeterminate = some;
          }}
          disabled={disabled}
          onChange={() =>
            onToggle(
              options.map((o) => o.feature),
              !all,
            )
          }
          className="mt-1"
        />
        <span>
          <span id={headingId} className="block font-medium text-foreground">
            {bundle.label}
          </span>
          <span className="block text-xs text-muted">
            {some ? `${onCount} of ${options.length} shown. ` : null}
            {bundle.hint}
          </span>
        </span>
      </label>
      {options.length > 1 ? (
        <ul className="mt-3 space-y-2 border-l border-border pl-4 ml-1.5">
          {options.map((option) => (
            <li key={option.feature}>
              <label className="flex items-center gap-3 text-sm">
                <input
                  type="checkbox"
                  name="feature"
                  value={option.feature}
                  checked={enabled.has(option.feature)}
                  disabled={disabled}
                  onChange={(e) => onToggle([option.feature], e.target.checked)}
                />
                {option.label}
              </label>
            </li>
          ))}
        </ul>
      ) : (
        // Single-item bundle: the bundle checkbox is the item.
        enabled.has(options[0]!.feature) ? (
          <input type="hidden" name="feature" value={options[0]!.feature} />
        ) : null
      )}
    </fieldset>
  );
}

export function MenuSettingsForm({
  bundles,
  options,
  initialEnabled,
  entityType,
}: {
  bundles: MenuBundle[];
  /** Optional items this person can open, in menu order. */
  options: MenuOption[];
  /** Null when they have never chosen (everything shows). */
  initialEnabled: MenuFeature[] | null;
  entityType: string;
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const { error, clearAll, applyActionResult } = useFieldErrors();
  const [enabled, setEnabled] = useState<Set<MenuFeature>>(
    () => new Set(initialEnabled ?? options.map((o) => o.feature)),
  );
  const [showQuestions, setShowQuestions] = useState(false);
  const [answers, setAnswers] = useState<Record<string, boolean>>({});

  const optionsByFeature = new Map(options.map((o) => [o.feature, o]));
  const groups = bundles
    .map((bundle) => ({
      bundle,
      options: bundle.features
        .map((f) => optionsByFeature.get(f))
        .filter((o): o is MenuOption => Boolean(o)),
    }))
    .filter((g) => g.options.length > 0);

  function toggle(features: MenuFeature[], on: boolean) {
    setEnabled((current) => {
      const next = new Set(current);
      for (const f of features) {
        if (on) next.add(f);
        else next.delete(f);
      }
      return next;
    });
  }

  function applyAnswers() {
    const available = new Set(options.map((o) => o.feature));
    setEnabled(
      new Set(featuresFromAnswers(answers, entityType).filter((f) => available.has(f))),
    );
    setShowQuestions(false);
  }

  function onSubmit(formData: FormData) {
    clearAll();
    startTransition(async () => {
      const result = await updateMenuFeatures(formData);
      if (!applyActionResult(result)) return;
      toast("Menu saved.");
      router.refresh();
    });
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={preventResetSubmit(onSubmit)}
      className="max-w-2xl space-y-6"
    >
      {initialEnabled === null ? (
        <p className="rounded-xl bg-wash px-4 py-3 text-sm">
          You are seeing every page. Untick anything you don&apos;t use to keep
          your menu short.
        </p>
      ) : null}

      <div className="rounded-2xl border border-border bg-surface px-5 py-4">
        {showQuestions ? (
          <div className="space-y-4">
            <div>
              <h2 className="font-display text-lg font-semibold">
                A few questions about your business
              </h2>
              <p className="mt-1 text-sm text-muted">
                Your answers tick the right boxes below. Nothing is saved until
                you choose Save menu.
              </p>
            </div>
            <MenuQuestions
              bundles={bundles}
              answers={answers}
              onAnswer={(id, yes) => setAnswers((a) => ({ ...a, [id]: yes }))}
              disabled={pending}
              idPrefix="menu-settings"
            />
            <div className="flex flex-wrap gap-2">
              <Button type="button" onClick={applyAnswers} disabled={pending}>
                Use these answers
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => setShowQuestions(false)}
                disabled={pending}
              >
                Cancel
              </Button>
            </div>
          </div>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm text-muted">
              Not sure what you need? Answer a few yes/no questions instead.
            </p>
            <Button
              type="button"
              variant="secondary"
              onClick={() => setShowQuestions(true)}
              disabled={pending}
            >
              Answer questions
            </Button>
          </div>
        )}
      </div>

      <div className="space-y-3">
        {groups.map(({ bundle, options: bundleOptions }) => (
          <BundleCheckbox
            key={bundle.id}
            bundle={bundle}
            options={bundleOptions}
            enabled={enabled}
            disabled={pending}
            onToggle={toggle}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => setEnabled(new Set(options.map((o) => o.feature)))}
        >
          Show everything
        </Button>
        <Button
          type="button"
          variant="ghost"
          disabled={pending}
          onClick={() => setEnabled(new Set())}
        >
          Essentials only
        </Button>
      </div>

      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save menu"}
      </Button>
    </form>
  );
}
