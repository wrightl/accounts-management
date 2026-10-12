"use client";

import type { MenuBundle } from "@/lib/menu/features";

/**
 * One yes/no question per menu bundle. Posts `menu_<bundleId>` = "yes" | "no".
 * Pass `answers` and `onAnswer` to control it; otherwise each question starts
 * on the bundle's default.
 */
export function MenuQuestions({
  bundles,
  answers,
  onAnswer,
  disabled,
  idPrefix = "menu",
}: {
  bundles: MenuBundle[];
  answers?: Record<string, boolean>;
  onAnswer?: (bundleId: string, yes: boolean) => void;
  disabled?: boolean;
  idPrefix?: string;
}) {
  return (
    <div className="space-y-3">
      {bundles.map((bundle) => {
        const name = `menu_${bundle.id}`;
        const hintId = `${idPrefix}-${bundle.id}-hint`;
        const value = answers?.[bundle.id];
        return (
          <fieldset
            key={bundle.id}
            aria-describedby={hintId}
            className="rounded-xl border border-border bg-surface px-4 py-3"
          >
            {/* float keeps the legend inside the bordered box */}
            <legend className="float-left w-full text-sm font-medium text-foreground">
              {bundle.question}
            </legend>
            <p id={hintId} className="clear-left pt-0.5 text-xs text-muted">
              {bundle.hint}
            </p>
            <div className="mt-2 flex gap-6 text-sm">
              {(["yes", "no"] as const).map((option) => {
                const yes = option === "yes";
                return (
                  <label key={option} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={name}
                      value={option}
                      disabled={disabled}
                      {...(answers
                        ? {
                            checked: (value ?? bundle.defaultOn) === yes,
                            onChange: () => onAnswer?.(bundle.id, yes),
                          }
                        : { defaultChecked: bundle.defaultOn === yes })}
                    />
                    {yes ? "Yes" : "No"}
                  </label>
                );
              })}
            </div>
          </fieldset>
        );
      })}
    </div>
  );
}
