"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import {
  refreshFromCompaniesHouse,
  saveCompaniesHouseDetails,
} from "@/actions/companies-house";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Textarea } from "@/components/ui/form";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { toast } from "@/components/ui/toast-store";
import { useFieldErrors } from "@/components/ui/use-field-errors";

export function CompaniesHouseForm({
  incorporatedOn,
  accountsDue,
  confirmationStatementDue,
  directorNames,
  canRefresh,
}: {
  incorporatedOn: string | null;
  accountsDue: string | null;
  confirmationStatementDue: string | null;
  directorNames: string | null;
  /** A company number is set and the server has a Companies House key. */
  canRefresh: boolean;
}) {
  const router = useRouter();
  const { fieldErrors, error, clearAll, clearField, setError, applyActionResult } =
    useFieldErrors();
  const [pending, startTransition] = useTransition();

  function refresh() {
    clearAll();
    startTransition(async () => {
      const result = await refreshFromCompaniesHouse();
      if (!result.ok) {
        setError(result.error);
        return;
      }
      toast("Updated from Companies House");
      router.refresh();
    });
  }

  return (
    <form
      // Remount with fresh defaults after a refresh from Companies House.
      key={[incorporatedOn, accountsDue, confirmationStatementDue, directorNames].join("|")}
      noValidate
      className="mt-4 space-y-4"
      onSubmit={preventResetSubmit((formData) => {
        clearAll();
        startTransition(async () => {
          const result = await saveCompaniesHouseDetails(formData);
          if (applyActionResult(result)) {
            toast("Companies House details saved");
            router.refresh();
          }
        });
      })}
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <div>
          <Label htmlFor="incorporatedOn">Incorporated on</Label>
          <Input
            id="incorporatedOn"
            name="incorporatedOn"
            type="date"
            defaultValue={incorporatedOn ?? ""}
            disabled={pending}
            onChange={() => clearField("incorporatedOn")}
          />
          <FieldError>{fieldErrors.incorporatedOn}</FieldError>
        </div>
        <div>
          <Label htmlFor="confirmationStatementDue">Confirmation statement due</Label>
          <Input
            id="confirmationStatementDue"
            name="confirmationStatementDue"
            type="date"
            defaultValue={confirmationStatementDue ?? ""}
            disabled={pending}
            onChange={() => clearField("confirmationStatementDue")}
          />
          <FieldError>{fieldErrors.confirmationStatementDue}</FieldError>
        </div>
        <div>
          <Label htmlFor="accountsDue">Next accounts due</Label>
          <Input
            id="accountsDue"
            name="accountsDue"
            type="date"
            defaultValue={accountsDue ?? ""}
            disabled={pending}
            onChange={() => clearField("accountsDue")}
          />
          <FieldError>{fieldErrors.accountsDue}</FieldError>
        </div>
      </div>
      <div>
        <Label htmlFor="directorNames">Directors, one per line</Label>
        <Textarea
          id="directorNames"
          name="directorNames"
          rows={3}
          defaultValue={directorNames ?? ""}
          disabled={pending}
          onChange={() => clearField("directorNames")}
        />
        <FieldError>{fieldErrors.directorNames}</FieldError>
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" variant="secondary" disabled={pending}>
          {pending ? "Saving…" : "Save"}
        </Button>
        {canRefresh ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={refresh}>
            Refresh from Companies House
          </Button>
        ) : null}
        <FieldError>{error}</FieldError>
      </div>
    </form>
  );
}
