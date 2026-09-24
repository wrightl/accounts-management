"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { updateOwnUiPrefs } from "@/actions/users";
import { Button } from "@/components/ui/button";
import { FieldError, Label } from "@/components/ui/form";
import { Select } from "@/components/ui/select";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import {
  parseUiPrefs,
  parseUiPrefsInput,
  uiPrefsFromFormData,
  type UiPrefs,
} from "@/lib/ui-prefs";

function PrefField({
  id,
  label,
  help,
  name,
  defaultValue,
  options,
  disabled,
  error,
  onClear,
}: {
  id: string;
  label: string;
  help: string;
  name: keyof UiPrefs;
  defaultValue: string;
  options: { value: string; label: string }[];
  disabled: boolean;
  error?: string;
  onClear: () => void;
}) {
  return (
    <div>
      <Label htmlFor={id}>{label}</Label>
      <Select
        id={id}
        name={name}
        defaultValue={defaultValue}
        disabled={disabled}
        aria-invalid={Boolean(error)}
        aria-describedby={error ? `${id}-error` : `${id}-help`}
        onChange={() => onClear()}
        options={options}
      />
      <p id={`${id}-help`} className="mt-1 text-xs text-muted">
        {help}
      </p>
      <FieldError id={`${id}-error`}>{error}</FieldError>
    </div>
  );
}

export function UiPrefsForm({ prefs: rawPrefs }: { prefs: unknown }) {
  const prefs = parseUiPrefs(rawPrefs);
  const router = useRouter();
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
    applyActionResult,
  } = useFieldErrors();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(formData: FormData) {
    clearAll();
    const clientParsed = parseUiPrefsInput(uiPrefsFromFormData(formData));
    if (!clientParsed.ok) {
      applyFail(clientParsed);
      scheduleFocusFirstFieldError(formRef.current, clientParsed.fieldErrors);
      return;
    }
    startTransition(async () => {
      const result = await updateOwnUiPrefs(formData);
      if (!applyActionResult(result)) {
        if (!result.ok) {
          scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
        }
        return;
      }
      router.refresh();
    });
  }

  return (
    <form
      ref={formRef}
      noValidate
      onSubmit={preventResetSubmit(onSubmit)}
      className="space-y-4"
    >
      <div>
        <h2 className="font-display text-lg font-semibold">Display and focus</h2>
        <p className="mt-1 text-sm text-muted">
          Adjust motion, text size, contrast, and notifications. These stay on
          this account. See{" "}
          <Link
            href="/help#easier"
            className="text-navy underline decoration-navy/30 underline-offset-2 hover:decoration-navy"
          >
            Make the app easier to use
          </Link>{" "}
          for tips that work with your phone or computer settings.
        </p>
      </div>

      <PrefField
        id="motion"
        name="motion"
        label="Motion"
        help="Reduce motion turns off animations. Match system follows your device setting."
        defaultValue={prefs.motion}
        disabled={pending}
        error={fieldErrors.motion}
        onClear={() => clearField("motion")}
        options={[
          { value: "system", label: "Match system" },
          { value: "reduce", label: "Reduce motion" },
          { value: "full", label: "Allow motion" },
        ]}
      />

      <PrefField
        id="text"
        name="text"
        label="Text size"
        help="Larger text enlarges the whole app interface."
        defaultValue={prefs.text}
        disabled={pending}
        error={fieldErrors.text}
        onClear={() => clearField("text")}
        options={[
          { value: "default", label: "Default" },
          { value: "large", label: "Large" },
        ]}
      />

      <PrefField
        id="contrast"
        name="contrast"
        label="Contrast"
        help="High contrast strengthens borders and text against the background."
        defaultValue={prefs.contrast}
        disabled={pending}
        error={fieldErrors.contrast}
        onClear={() => clearField("contrast")}
        options={[
          { value: "default", label: "Default" },
          { value: "high", label: "High contrast" },
        ]}
      />

      <PrefField
        id="font"
        name="font"
        label="Font"
        help="Readable uses Atkinson Hyperlegible, designed for clearer letter shapes."
        defaultValue={prefs.font}
        disabled={pending}
        error={fieldErrors.font}
        onClear={() => clearField("font")}
        options={[
          { value: "default", label: "Default (Outfit)" },
          { value: "readable", label: "Readable (Atkinson Hyperlegible)" },
        ]}
      />

      <PrefField
        id="toasts"
        name="toasts"
        label="Success messages"
        help="Stay on screen until you dismiss them — useful if you read slowly or magnify."
        defaultValue={prefs.toasts}
        disabled={pending}
        error={fieldErrors.toasts}
        onClear={() => clearField("toasts")}
        options={[
          { value: "auto", label: "Dismiss after a few seconds" },
          { value: "stay", label: "Stay until I dismiss" },
        ]}
      />

      <FieldError>{error}</FieldError>
      <Button type="submit" disabled={pending}>
        {pending ? "Saving…" : "Save display settings"}
      </Button>
    </form>
  );
}
