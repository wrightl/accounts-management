"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { updateCompany, uploadLogo } from "@/actions/settings";

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

export function SettingsForm({
  settings,
}: {
  settings: {
    name: string;
    legalName: string;
    companyNumber: string | null;
    addressLines: string | null;
    bankName: string;
    bankAccountName: string | null;
    sortCode: string | null;
    accountNumber: string | null;
    financialYearEndMonth: number;
    invoiceNumberPrefix: string;
    logoUrl: string | null;
  };
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mx-auto max-w-2xl space-y-10">
      <form
        action={(formData) => {
          setError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await updateCompany(formData);
            if (!result.ok) setError(result.error);
            else {
              setMessage("Settings saved.");
              router.refresh();
            }
          });
        }}
        className="space-y-4"
      >
        <h2 className="font-display text-lg font-semibold">Company profile</h2>
        <div>
          <Label htmlFor="name">Trading name</Label>
          <Input id="name" name="name" required defaultValue={settings.name} disabled={pending} />
        </div>
        <div>
          <Label htmlFor="legalName">Legal name</Label>
          <Input
            id="legalName"
            name="legalName"
            required
            defaultValue={settings.legalName}
            disabled={pending}
          />
        </div>
        <div>
          <Label htmlFor="companyNumber">Company number</Label>
          <Input
            id="companyNumber"
            name="companyNumber"
            defaultValue={settings.companyNumber ?? ""}
            disabled={pending}
          />
        </div>
        <div>
          <Label htmlFor="addressLines">Address</Label>
          <Textarea
            id="addressLines"
            name="addressLines"
            rows={3}
            defaultValue={settings.addressLines ?? ""}
            disabled={pending}
          />
        </div>

        <h2 className="pt-4 font-display text-lg font-semibold">Bank details (Starling)</h2>
        <div>
          <Label htmlFor="bankName">Bank</Label>
          <Input id="bankName" name="bankName" required defaultValue={settings.bankName} disabled={pending} />
        </div>
        <div>
          <Label htmlFor="bankAccountName">Account name</Label>
          <Input
            id="bankAccountName"
            name="bankAccountName"
            defaultValue={settings.bankAccountName ?? ""}
            disabled={pending}
          />
        </div>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="sortCode">Sort code</Label>
            <Input
              id="sortCode"
              name="sortCode"
              defaultValue={settings.sortCode ?? ""}
              disabled={pending}
            />
          </div>
          <div>
            <Label htmlFor="accountNumber">Account number</Label>
            <Input
              id="accountNumber"
              name="accountNumber"
              defaultValue={settings.accountNumber ?? ""}
              disabled={pending}
            />
          </div>
        </div>

        <h2 className="pt-4 font-display text-lg font-semibold">Invoicing</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <Label htmlFor="invoiceNumberPrefix">Invoice number prefix</Label>
            <Input
              id="invoiceNumberPrefix"
              name="invoiceNumberPrefix"
              required
              defaultValue={settings.invoiceNumberPrefix}
              disabled={pending}
            />
            <p className="mt-1 text-xs text-muted">e.g. DD → DD-2026-0001</p>
          </div>
          <div>
            <Label htmlFor="financialYearEndMonth">Financial year end</Label>
            <Select
              id="financialYearEndMonth"
              name="financialYearEndMonth"
              defaultValue={String(settings.financialYearEndMonth)}
              disabled={pending}
            >
              {MONTHS.map((m, i) => (
                <option key={m} value={i + 1}>
                  {m}
                </option>
              ))}
            </Select>
          </div>
        </div>

        <FieldError>{error}</FieldError>
        {message && <p className="text-sm text-emerald-700">{message}</p>}
        <Button type="submit" disabled={pending}>
          {pending ? "Saving…" : "Save settings"}
        </Button>
      </form>

      <form
        action={(formData) => {
          setError(null);
          setMessage(null);
          startTransition(async () => {
            const result = await uploadLogo(formData);
            if (!result.ok) setError(result.error);
            else {
              setMessage("Logo uploaded.");
              router.refresh();
            }
          });
        }}
        className="space-y-3 border-t border-border pt-8"
      >
        <h2 className="font-display text-lg font-semibold">Logo</h2>
        <p className="text-sm text-muted">
          {settings.logoUrl
            ? `Current logo stored at ${settings.logoUrl}`
            : "No logo uploaded yet."}
        </p>
        <Input id="logo" name="logo" type="file" accept="image/*" disabled={pending} />
        <Button type="submit" variant="secondary" disabled={pending}>
          Upload logo
        </Button>
      </form>
    </div>
  );
}
