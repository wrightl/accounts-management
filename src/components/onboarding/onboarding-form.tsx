"use client";

import { useEffect, useState, useTransition } from "react";
import { completeOnboarding } from "@/actions/onboarding";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/form";
import { BankFields } from "@/components/settings/bank-fields";

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
}: {
  defaultEmail: string | null;
  defaultName: string | null;
}) {
  const [entityType, setEntityType] = useState<EntityChoice>(null);
  const [error, setError] = useState<string | null>(null);
  const [logoFile, setLogoFile] = useState<File | null>(null);
  const [logoPreview, setLogoPreview] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    if (!logoFile) {
      setLogoPreview(null);
      return;
    }
    const url = URL.createObjectURL(logoFile);
    setLogoPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [logoFile]);

  if (!entityType) {
    return (
      <div className="space-y-6">
        <div>
          <h1 className="font-display text-2xl font-semibold">
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
      className="mx-auto max-w-xl space-y-6"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await completeOnboarding(formData);
          if (result && !result.ok) setError(result.error);
        });
      }}
    >
      <input type="hidden" name="entityType" value={entityType} />
      <div>
        <button
          type="button"
          className="text-sm text-muted underline-offset-2 hover:underline"
          onClick={() => {
            setEntityType(null);
            setLogoFile(null);
          }}
          disabled={pending}
        >
          ← Change business type
        </button>
        <h1 className="mt-2 font-display text-2xl font-semibold">
          {isLtd ? "Limited company details" : "Sole trader details"}
        </h1>
        <p className="mt-2 text-muted">
          {isLtd
            ? "Enter your details and your company as registered at Companies House."
            : "Enter your details and trading name."}
        </p>
      </div>

      <div>
        <Label htmlFor="userName">Your name</Label>
        <Input
          id="userName"
          name="userName"
          required
          defaultValue={defaultName ?? ""}
          disabled={pending}
          autoComplete="name"
        />
      </div>

      <div>
        <Label htmlFor="name">Trading name</Label>
        <Input id="name" name="name" required disabled={pending} />
      </div>

      <div>
        <Label htmlFor="legalName">
          {isLtd ? "Legal name" : "Your full legal name"}
        </Label>
        <Input id="legalName" name="legalName" required disabled={pending} />
      </div>

      {isLtd ? (
        <div>
          <Label htmlFor="companyNumber">Company number</Label>
          <Input
            id="companyNumber"
            name="companyNumber"
            required
            disabled={pending}
          />
        </div>
      ) : (
        <div>
          <Label htmlFor="utr">UTR (optional)</Label>
          <Input id="utr" name="utr" disabled={pending} />
        </div>
      )}

      <div>
        <Label htmlFor="addressLines">Address</Label>
        <Textarea id="addressLines" name="addressLines" disabled={pending} />
      </div>

      <div>
        <Label htmlFor="email">Contact email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={defaultEmail ?? ""}
          disabled={pending}
        />
      </div>

      <div>
        <Label htmlFor="financialYearEndMonth">Financial year end</Label>
        <select
          id="financialYearEndMonth"
          name="financialYearEndMonth"
          defaultValue="3"
          disabled={pending}
          className="w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm"
        >
          {MONTHS.map((label, i) => (
            <option key={label} value={i + 1}>
              {label}
            </option>
          ))}
        </select>
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
          onChange={(event) => {
            setLogoFile(event.target.files?.[0] ?? null);
          }}
        />
        <p className="text-xs text-muted">
          Shown in the app and on invoices. PNG or JPG, under 2 MB.
        </p>
      </div>

      <div className="space-y-3 rounded-xl border border-border bg-surface/50 p-4">
        <h2 className="font-display text-base font-semibold">Bank details</h2>
        <BankFields
          disabled={pending}
          required={false}
          showAccountDetails
          optionalHint="Optional — needed for invoice payment details and CSV import."
        />
      </div>

      <FieldError>{error}</FieldError>

      <Button type="submit" disabled={pending}>
        {pending ? "Creating…" : "Create account"}
      </Button>
    </form>
  );
}
