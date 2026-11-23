"use client";

import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { DOCUMENT_CURRENCIES, STERLING } from "@/lib/currency";

export type ClientFieldValues = {
  name: string;
  companyName: string | null;
  email: string | null;
  addressLines: string | null;
  notes: string | null;
  defaultCurrency?: string | null;
};

/**
 * The inputs for a client's details, shared by the client page and the
 * "Create client" dialog. Field names match `clientRawFromFormData`.
 */
export function ClientFields({
  client,
  disabled,
  fieldErrors,
  clearField,
  idPrefix = "",
}: {
  client?: ClientFieldValues;
  disabled: boolean;
  fieldErrors: Record<string, string | undefined>;
  clearField: (field: string) => void;
  /** Keeps ids unique when the fields sit inside another page's form. */
  idPrefix?: string;
}) {
  const id = (field: string) => `${idPrefix}${field}`;
  const describedBy = (field: string) =>
    fieldErrors[field] ? `${id(field)}-error` : undefined;

  return (
    <>
      <div>
        <Label htmlFor={id("companyName")}>Company name (optional)</Label>
        <Input
          id={id("companyName")}
          name="companyName"
          defaultValue={client?.companyName ?? ""}
          disabled={disabled}
          aria-invalid={Boolean(fieldErrors.companyName)}
          aria-describedby={describedBy("companyName")}
          onChange={() => clearField("companyName")}
        />
        <FieldError id={`${id("companyName")}-error`}>{fieldErrors.companyName}</FieldError>
      </div>
      <div>
        <Label htmlFor={id("name")} required>
          Contact name
        </Label>
        <Input
          id={id("name")}
          name="name"
          required
          defaultValue={client?.name ?? ""}
          disabled={disabled}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={describedBy("name")}
          onChange={() => clearField("name")}
        />
        <FieldError id={`${id("name")}-error`}>{fieldErrors.name}</FieldError>
      </div>
      <div>
        <Label htmlFor={id("email")}>Email (optional)</Label>
        <Input
          id={id("email")}
          name="email"
          type="email"
          defaultValue={client?.email ?? ""}
          disabled={disabled}
          aria-invalid={Boolean(fieldErrors.email)}
          aria-describedby={describedBy("email")}
          onChange={() => clearField("email")}
        />
        <FieldError id={`${id("email")}-error`}>{fieldErrors.email}</FieldError>
      </div>
      <div>
        <Label htmlFor={id("addressLines")}>Address (optional)</Label>
        <Textarea
          id={id("addressLines")}
          name="addressLines"
          rows={3}
          defaultValue={client?.addressLines ?? ""}
          disabled={disabled}
          aria-invalid={Boolean(fieldErrors.addressLines)}
          aria-describedby={describedBy("addressLines")}
          onChange={() => clearField("addressLines")}
        />
        <FieldError id={`${id("addressLines")}-error`}>{fieldErrors.addressLines}</FieldError>
      </div>
      <div>
        <Label htmlFor={id("defaultCurrency")}>Invoice currency</Label>
        <Select
          id={id("defaultCurrency")}
          name="defaultCurrency"
          defaultValue={client?.defaultCurrency ?? STERLING}
          disabled={disabled}
          aria-invalid={Boolean(fieldErrors.defaultCurrency)}
          aria-describedby={
            fieldErrors.defaultCurrency
              ? `${id("defaultCurrency")}-error ${id("defaultCurrency")}-hint`
              : `${id("defaultCurrency")}-hint`
          }
          onChange={() => clearField("defaultCurrency")}
        >
          {DOCUMENT_CURRENCIES.map((code) => (
            <option key={code} value={code}>
              {code}
            </option>
          ))}
        </Select>
        <FieldError id={`${id("defaultCurrency")}-error`}>{fieldErrors.defaultCurrency}</FieldError>
        <p id={`${id("defaultCurrency")}-hint`} className="mt-1 text-xs text-muted">
          New invoices for this client start in this currency.
        </p>
      </div>
      <div>
        <Label htmlFor={id("notes")}>Notes (optional)</Label>
        <Textarea
          id={id("notes")}
          name="notes"
          rows={3}
          defaultValue={client?.notes ?? ""}
          disabled={disabled}
          aria-invalid={Boolean(fieldErrors.notes)}
          aria-describedby={describedBy("notes")}
          onChange={() => clearField("notes")}
        />
        <FieldError id={`${id("notes")}-error`}>{fieldErrors.notes}</FieldError>
      </div>
    </>
  );
}
