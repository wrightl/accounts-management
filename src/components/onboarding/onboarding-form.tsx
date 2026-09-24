"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { completeOnboarding } from "@/actions/onboarding";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { BankFields } from "@/components/settings/bank-fields";
import { SignupPlanPicker } from "@/components/signup/plan-picker";
import {
  onboardingRawFromFormData,
  parseOnboardingInput,
} from "@/lib/onboarding/schema";
import type { StripeCatalog } from "@/lib/billing/catalog-types";
import {
  signupPlanLabel,
  type SignupPlanChoice,
} from "@/lib/signup-plan";

const MONTHS = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December",
];

type EntityChoice = "limited_company" | "sole_trader" | null;

export function OnboardingForm({
  defaultEmail,
  defaultName,
  catalog,
  initialPlanChoice,
}: {
  defaultEmail: string | null;
  defaultName: string | null;
  catalog: StripeCatalog | null;
  initialPlanChoice: SignupPlanChoice | null;
}) {
  const [planChoice, setPlanChoice] = useState<SignupPlanChoice | null>(
    initialPlanChoice,
  );
  const [entityType, setEntityType] = useState<EntityChoice>(null);
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
    applyActionResult,
  } = useFieldErrors();
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!logoFile) {
      return;
    }
    const url = URL.createObjectURL(logoFile);
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  if (!planChoice) {
    return (
      <SignupPlanPicker
        catalog={catalog}
        initialPlan={null}
        tone="light"
        title="Choose your plan"
        subtitle="Select a subscription tier before setting up your business."
        onConfirmed={setPlanChoice}
      />
    );
  }

  if (!entityType) {
    return (
      <div className="space-y-6">
        <div>
          <p className="text-sm text-muted">
            Plan:{" "}
            <span className="font-medium text-foreground">
              {signupPlanLabel(planChoice)}
            </span>{" "}
            <button
              type="button"
              className="underline-offset-2 hover:underline"
              onClick={() => {
                setPlanChoice(null);
                setEntityType(null);
              }}
            >
              Change
            </button>
          </p>
          <h1 className="mt-2 font-display text-2xl font-semibold">
            Set up your business
          </h1>
          <p className="mt-2 text-muted">
            Choose how your business is registered. You can add bank details
            now or later in Settings.
          </p>
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <button
            type="button"
            onClick={() => setEntityType("limited_company")}
            className="rounded-2xl border border-border bg-surface p-6 text-left transition hover:border-navy hover:shadow-sm"
          >
            <p className="font-display text-lg font-semibold">
              Limited company
            </p>
            <p className="mt-2 text-sm text-muted">
              Ltd with a Companies House number. Includes shareholders and
              dividends.
            </p>
          </button>
          <button
            type="button"
            onClick={() => setEntityType("sole_trader")}
            className="rounded-2xl border border-border bg-surface p-6 text-left transition hover:border-navy hover:shadow-sm"
          >
            <p className="font-display text-lg font-semibold">Sole trader</p>
            <p className="mt-2 text-sm text-muted">
              You trade as an individual. No share register — UTR is optional.
            </p>
          </button>
        </div>
      </div>
    );
  }

  const isLtd = entityType === "limited_company";

  return (
    <form
      ref={formRef}
      noValidate
      className="mx-auto max-w-xl space-y-6"
      onSubmit={preventResetSubmit((formData) => {
        clearAll();
        const clientParsed = parseOnboardingInput(
          onboardingRawFromFormData(formData),
        );
        if (!clientParsed.ok) {
          applyFail(clientParsed);
          scheduleFocusFirstFieldError(
            formRef.current,
            clientParsed.fieldErrors,
          );
          return;
        }
        startTransition(async () => {
          try {
            const result = await completeOnboarding(formData);
            if (result) {
              if (!applyActionResult(result) && !result.ok) {
                scheduleFocusFirstFieldError(
                  formRef.current,
                  result.fieldErrors,
                );
              }
            }
          } catch (err) {
            const { isRedirectError } = await import(
              "next/dist/client/components/redirect-error"
            );
            if (isRedirectError(err)) throw err;
            applyActionResult({
              ok: false,
              error:
                err instanceof Error
                  ? err.message
                  : "Could not finish setup. Try again.",
            });
          }
        });
      })}
    >
      <input type="hidden" name="entityType" value={entityType} />
      <div>
        <button
          type="button"
          className="text-sm text-muted underline-offset-2 hover:underline"
          onClick={() => {
            setEntityType(null);
            setLogoFile(null);
            setLogoPreview(null);
            clearAll();
          }}
          disabled={pending}
        >
          ← Change business type
        </button>
        <p className="mt-2 text-sm text-muted">
          Plan:{" "}
          <span className="font-medium text-foreground">
            {signupPlanLabel(planChoice)}
          </span>
        </p>
        <h1 className="mt-2 font-display text-2xl font-semibold">
          {isLtd ? "Limited company details" : "Sole trader details"}
        </h1>
        <p className="mt-2 text-muted">
          {isLtd
            ? "Enter your details and your company as registered at Companies House."
            : "Enter your details and trading name."}
          {planChoice.plan !== "trial"
            ? " After this step you will add a card on Stripe — you get 30 days free before the first charge."
            : null}
        </p>
      </div>

      <div>
        <Label htmlFor="userName" required>
          Your name
        </Label>
        <Input
          id="userName"
          name="userName"
          required
          defaultValue={defaultName ?? ""}
          disabled={pending}
          autoComplete="name"
          aria-invalid={Boolean(fieldErrors.userName)}
          aria-describedby={fieldErrors.userName ? "userName-error" : undefined}
          onChange={() => clearField("userName")}
        />
        <FieldError id="userName-error">{fieldErrors.userName}</FieldError>
      </div>

      <div>
        <Label htmlFor="name" required>
          Trading name
        </Label>
        <Input
          id="name"
          name="name"
          required
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? "name-error" : undefined}
          onChange={() => clearField("name")}
        />
        <FieldError id="name-error">{fieldErrors.name}</FieldError>
      </div>

      <div>
        <Label htmlFor="legalName" required>
          {isLtd ? "Legal name" : "Your full legal name"}
        </Label>
        <Input
          id="legalName"
          name="legalName"
          required
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.legalName)}
          aria-describedby={
            fieldErrors.legalName ? "legalName-error" : undefined
          }
          onChange={() => clearField("legalName")}
        />
        <FieldError id="legalName-error">{fieldErrors.legalName}</FieldError>
      </div>

      {isLtd ? (
        <div>
          <Label htmlFor="companyNumber" required>
            Company number
          </Label>
          <Input
            id="companyNumber"
            name="companyNumber"
            required
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.companyNumber)}
            aria-describedby={
              fieldErrors.companyNumber ? "companyNumber-error" : undefined
            }
            onChange={() => clearField("companyNumber")}
          />
          <FieldError id="companyNumber-error">
            {fieldErrors.companyNumber}
          </FieldError>
        </div>
      ) : (
        <div>
          <Label htmlFor="utr">UTR (optional)</Label>
          <Input
            id="utr"
            name="utr"
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.utr)}
            aria-describedby={fieldErrors.utr ? "utr-error" : undefined}
            onChange={() => clearField("utr")}
          />
          <FieldError id="utr-error">{fieldErrors.utr}</FieldError>
        </div>
      )}

      <div>
        <Label htmlFor="addressLines">Address (optional)</Label>
        <Textarea
          id="addressLines"
          name="addressLines"
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.addressLines)}
          aria-describedby={
            fieldErrors.addressLines ? "addressLines-error" : undefined
          }
          onChange={() => clearField("addressLines")}
        />
        <FieldError id="addressLines-error">
          {fieldErrors.addressLines}
        </FieldError>
      </div>

      <div>
        <Label htmlFor="email">Contact email (optional)</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={defaultEmail ?? ""}
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={fieldErrors.email ? "email-error" : undefined}
          onChange={() => clearField("email")}
        />
        <FieldError id="email-error">{fieldErrors.email}</FieldError>
      </div>

      <div>
        <Label htmlFor="financialYearEndMonth" required>
          Financial year end
        </Label>
        <select
          id="financialYearEndMonth"
          name="financialYearEndMonth"
          defaultValue="3"
          disabled={pending}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
          aria-invalid={Boolean(fieldErrors.financialYearEndMonth)}
          onChange={() => clearField("financialYearEndMonth")}
        >
          {MONTHS.map((label, i) => (
            <option key={label} value={i + 1}>
              {label}
            </option>
          ))}
        </select>
        <FieldError id="financialYearEndMonth-error">
          {fieldErrors.financialYearEndMonth}
        </FieldError>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-surface/50 p-4">
        <Label htmlFor="logo">Company logo (optional)</Label>
        {logoPreview ? (
          // eslint-disable-next-line @next/next/no-img-element -- local file preview
          <img
            src={logoPreview}
            alt="Company logo preview"
            className="max-h-24 rounded-md border border-border bg-surface object-contain p-2"
          />
        ) : null}
        <Input
          id="logo"
          name="logo"
          type="file"
          accept="image/*"
          disabled={pending}
          aria-invalid={Boolean(fieldErrors.logo)}
          aria-describedby={fieldErrors.logo ? "logo-error" : undefined}
          onChange={(event) => {
            const file = event.target.files?.[0] ?? null;
            setLogoFile(file);
            clearField("logo");
            if (!file) {
              setLogoPreview(null);
            }
          }}
        />
        <p className="text-xs text-muted">
          Shown in the app and on invoices. PNG or JPG, under 2 MB.
        </p>
        <FieldError id="logo-error">{fieldErrors.logo}</FieldError>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-surface/50 p-4">
        <h2 className="font-display text-base font-semibold">Bank details</h2>
        <BankFields
          disabled={pending}
          required={false}
          showAccountDetails
          optionalHint="Optional — needed for invoice payment details and CSV import."
          errors={fieldErrors}
          onClearError={clearField}
        />
      </div>

      <FormStickyActions error={error}>
        <Button type="submit" disabled={pending}>
          {pending
            ? "Creating…"
            : planChoice.plan === "trial"
              ? "Create account"
              : "Continue — start free trial"}
        </Button>
      </FormStickyActions>
    </form>
  );
}
