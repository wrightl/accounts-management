"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { completeOnboarding } from "@/actions/onboarding";
import { lookupCompaniesHouse } from "@/actions/companies-house";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { BankFields } from "@/components/settings/bank-fields";
import { SignupPlanPicker } from "@/components/signup/plan-picker";
import { MenuQuestions } from "@/components/menu/menu-questions";
import { bundlesFor } from "@/lib/menu/features";
import {
  onboardingRawFromFormData,
  parseOnboardingInput,
} from "@/lib/onboarding/schema";
import type { StripeCatalog } from "@/lib/billing/catalog-types";
import {
  suggestTradingName,
  type CompaniesHouseCompany,
} from "@/lib/companies-house/parse";
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
  companiesHouseEnabled = false,
}: {
  defaultEmail: string | null;
  defaultName: string | null;
  catalog: StripeCatalog | null;
  initialPlanChoice: SignupPlanChoice | null;
  /** Show the Companies House lookup (the server has an API key). */
  companiesHouseEnabled?: boolean;
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
  const [found, setFound] = useState<CompaniesHouseCompany | null>(null);
  const [lookupError, setLookupError] = useState<string | null>(null);
  const [lookingUp, startLookup] = useTransition();

  function fieldValue(name: string): string {
    const el = formRef.current?.elements.namedItem(name);
    return el && "value" in el ? String(el.value) : "";
  }

  function setFieldValue(name: string, value: string) {
    const el = formRef.current?.elements.namedItem(name);
    if (el && "value" in el) el.value = value;
    clearField(name);
  }

  function lookUpCompany() {
    setLookupError(null);
    startLookup(async () => {
      const result = await lookupCompaniesHouse(fieldValue("companyNumber"));
      if (!result.ok) {
        setFound(null);
        setLookupError(result.error);
        return;
      }
      const c = result.company;
      setFieldValue("companyNumber", c.companyNumber);
      setFieldValue("legalName", c.companyName);
      if (!fieldValue("name").trim()) setFieldValue("name", suggestTradingName(c.companyName));
      if (c.registeredOffice) setFieldValue("addressLines", c.registeredOffice);
      if (c.yearEndMonth) setFieldValue("financialYearEndMonth", String(c.yearEndMonth));
      setFound(c);
    });
  }

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
          <div className="flex gap-2">
            <Input
              id="companyNumber"
              name="companyNumber"
              required
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.companyNumber)}
              aria-describedby={
                fieldErrors.companyNumber ? "companyNumber-error" : undefined
              }
              onChange={() => {
                clearField("companyNumber");
                // Details from an earlier lookup belong to the old number.
                setFound(null);
                setLookupError(null);
              }}
              onKeyDown={(e) => {
                if (companiesHouseEnabled && e.key === "Enter") {
                  e.preventDefault();
                  lookUpCompany();
                }
              }}
            />
            {companiesHouseEnabled ? (
              <Button
                type="button"
                variant="secondary"
                className="shrink-0"
                disabled={pending || lookingUp}
                onClick={lookUpCompany}
              >
                {lookingUp ? "Looking up…" : "Look up"}
              </Button>
            ) : null}
          </div>
          <FieldError id="companyNumber-error">
            {fieldErrors.companyNumber ?? lookupError}
          </FieldError>
          {companiesHouseEnabled && !found && !lookupError ? (
            <p className="mt-1 text-sm text-muted">
              Look up your company to fill in the details below from Companies House.
            </p>
          ) : null}
          {found ? (
            <div className="mt-2 rounded-xl bg-wash px-3 py-2 text-sm" role="status">
              <p>
                Filled in from Companies House: <strong>{found.companyName}</strong>
                {found.status && found.status !== "active" ? ` (${found.status})` : ""}.
              </p>
              {found.directors.length ? (
                <p className="text-muted">Directors: {found.directors.join(", ")}</p>
              ) : null}
              <input type="hidden" name="incorporatedOn" value={found.incorporatedOn ?? ""} />
              <input type="hidden" name="accountsDue" value={found.accountsDue ?? ""} />
              <input
                type="hidden"
                name="confirmationStatementDue"
                value={found.confirmationStatementDue ?? ""}
              />
              <input type="hidden" name="directorNames" value={found.directors.join("\n")} />
            </div>
          ) : null}
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

      <div className="space-y-3 rounded-xl border border-border bg-surface/50 p-4">
        <div>
          <h2 className="font-display text-base font-semibold">
            How you run your business
          </h2>
          <p className="mt-1 text-sm text-muted">
            Your answers decide which pages show in your menu, so you only see
            what you use. Change them any time in Settings → Your menu.
          </p>
        </div>
        <MenuQuestions
          bundles={bundlesFor(entityType)}
          disabled={pending}
          idPrefix="onboarding-menu"
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
