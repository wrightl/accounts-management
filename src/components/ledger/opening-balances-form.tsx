"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { saveOpeningBalances } from "@/actions/ledger";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select } from "@/components/ui/form";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { useFieldErrors } from "@/components/ui/use-field-errors";

type Director = { userId: string; name: string; openingPence: number };

function pounds(pence: number | null | undefined): string {
  return pence ? (Math.abs(pence) / 100).toFixed(2) : "";
}

/**
 * Opening balances at the last year end before the company's records in
 * Alfa: retained earnings and each director's loan balance.
 */
export function OpeningBalancesForm({
  openingBalancesAsAt,
  openingReservesPence,
  associatedCompanies,
  suggestedDate,
  directors,
}: {
  openingBalancesAsAt: string | null;
  openingReservesPence: number | null;
  associatedCompanies: number;
  /** The last financial year end, as a default. */
  suggestedDate: string;
  directors: Director[];
}) {
  const router = useRouter();
  const formRef = useRef<HTMLFormElement>(null);
  const { fieldErrors, error, clearAll, clearField, applyActionResult } = useFieldErrors();
  const [pending, startTransition] = useTransition();
  const [saved, setSaved] = useState(false);

  return (
    <form
      ref={formRef}
      noValidate
      className="space-y-4"
      onSubmit={preventResetSubmit((formData) => {
        clearAll();
        setSaved(false);
        startTransition(async () => {
          const result = await saveOpeningBalances(formData);
          if (applyActionResult(result)) {
            setSaved(true);
            router.refresh();
          } else if (!result.ok) {
            scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
          }
        });
      })}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="openingBalancesAsAt">As at year end</Label>
          <Input
            id="openingBalancesAsAt"
            name="openingBalancesAsAt"
            type="date"
            defaultValue={openingBalancesAsAt ?? suggestedDate}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.openingBalancesAsAt)}
            aria-describedby="openingBalancesAsAt-error"
            onChange={() => clearField("openingBalancesAsAt")}
          />
          <FieldError id="openingBalancesAsAt-error">{fieldErrors.openingBalancesAsAt}</FieldError>
        </div>
        <div>
          <Label htmlFor="openingReservesPounds">Retained earnings (£)</Label>
          <Input
            id="openingReservesPounds"
            name="openingReservesPounds"
            inputMode="decimal"
            placeholder="0.00"
            defaultValue={
              openingReservesPence != null ? (openingReservesPence / 100).toFixed(2) : ""
            }
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.openingReservesPounds)}
            aria-describedby="openingReservesPounds-hint openingReservesPounds-error"
            onChange={() => clearField("openingReservesPounds")}
          />
          <p id="openingReservesPounds-hint" className="mt-1 text-xs text-muted">
            From the balance sheet (profit and loss reserve). Negative if in deficit.
          </p>
          <FieldError id="openingReservesPounds-error">
            {fieldErrors.openingReservesPounds}
          </FieldError>
        </div>
        <div>
          <Label htmlFor="associatedCompanies">Associated companies</Label>
          <Input
            id="associatedCompanies"
            name="associatedCompanies"
            type="number"
            min={0}
            step={1}
            defaultValue={associatedCompanies}
            disabled={pending}
            aria-invalid={Boolean(fieldErrors.associatedCompanies)}
            aria-describedby="associatedCompanies-hint associatedCompanies-error"
            onChange={() => clearField("associatedCompanies")}
          />
          <p id="associatedCompanies-hint" className="mt-1 text-xs text-muted">
            Other companies under the same control. They lower the tax band limits.
          </p>
          <FieldError id="associatedCompanies-error">{fieldErrors.associatedCompanies}</FieldError>
        </div>
      </div>

      {directors.length > 0 ? (
        <fieldset className="space-y-3">
          <legend className="text-sm font-medium">Director&apos;s loan balances at that date</legend>
          {directors.map((d) => (
            <div key={d.userId} className="grid items-start gap-3 sm:grid-cols-[1fr_10rem_14rem]">
              <Label htmlFor={`opening_${d.userId}`} className="sm:pt-2">
                {d.name}
              </Label>
              <div>
                <Input
                  id={`opening_${d.userId}`}
                  name={`opening_${d.userId}`}
                  inputMode="decimal"
                  placeholder="0.00"
                  defaultValue={pounds(d.openingPence)}
                  disabled={pending}
                  aria-invalid={Boolean(fieldErrors[`opening_${d.userId}`])}
                  aria-describedby={`opening_${d.userId}-error`}
                  onChange={() => clearField(`opening_${d.userId}`)}
                />
                <FieldError id={`opening_${d.userId}-error`}>
                  {fieldErrors[`opening_${d.userId}`]}
                </FieldError>
              </div>
              <Select
                name={`openingDirection_${d.userId}`}
                aria-label={`Who owed whom for ${d.name}`}
                defaultValue={d.openingPence < 0 ? "owed_by_director" : "owed_to_director"}
                disabled={pending}
              >
                <option value="owed_to_director">Company owed the director</option>
                <option value="owed_by_director">Director owed the company</option>
              </Select>
            </div>
          ))}
        </fieldset>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save opening balances"}
        </Button>
        {saved ? <span className="text-sm text-muted">Saved.</span> : null}
      </div>
      <FieldError>{error}</FieldError>
    </form>
  );
}
