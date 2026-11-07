"use client";

import { useRouter } from "next/navigation";
import { useState, type ReactNode } from "react";
import { NewClientDialog, type CreatedClient } from "@/components/clients/new-client-dialog";
import { Select } from "@/components/ui/form";
import type { SelectOption } from "@/components/ui/select";
import { clientDisplayName, type ClientNameFields } from "@/lib/clients/display";

/** Never a client id, so choosing it can't be mistaken for a real choice. */
const NEW_CLIENT = "__new_client__";

export type ClientSelectOption = ClientNameFields & { id: string };

/**
 * A client dropdown with a "New client…" option that creates one in a dialog
 * and selects it. Submits the chosen id through `name`, like Select.
 */
export function ClientSelect({
  clients,
  id,
  name,
  value,
  defaultValue = "",
  onChange,
  leadingOptions = [],
  placeholder,
  required,
  disabled,
  canCreate = true,
  labelFor = clientDisplayName,
  className,
  "aria-invalid": ariaInvalid,
  "aria-describedby": ariaDescribedBy,
  "aria-label": ariaLabel,
}: {
  clients: readonly ClientSelectOption[];
  id?: string;
  name?: string;
  value?: string;
  defaultValue?: string;
  onChange?: (clientId: string) => void;
  /** Options listed before the clients, such as "No client". */
  leadingOptions?: SelectOption[];
  placeholder?: string;
  required?: boolean;
  disabled?: boolean;
  canCreate?: boolean;
  labelFor?: (client: ClientSelectOption) => ReactNode;
  className?: string;
  "aria-invalid"?: boolean | "true" | "false";
  "aria-describedby"?: string;
  "aria-label"?: string;
}) {
  const router = useRouter();
  const [own, setOwn] = useState(defaultValue);
  const [created, setCreated] = useState<CreatedClient[]>([]);
  const [creating, setCreating] = useState(false);
  const current = value ?? own;

  const all = [...clients, ...created.filter((c) => !clients.some((k) => k.id === c.id))];
  const options: SelectOption[] = [
    ...leadingOptions,
    ...all.map((c) => ({ value: c.id, label: labelFor(c) })),
    ...(canCreate ? [{ value: NEW_CLIENT, label: "+ New client…" }] : []),
  ];

  function choose(next: string) {
    if (next === NEW_CLIENT) {
      setCreating(true);
      return;
    }
    setOwn(next);
    onChange?.(next);
  }

  function onCreated(client: CreatedClient) {
    setCreated((prev) => [...prev, client]);
    setOwn(client.id);
    onChange?.(client.id);
    router.refresh();
  }

  return (
    <>
      <Select
        id={id}
        name={name}
        value={current}
        onChange={(e) => choose(e.target.value)}
        options={options}
        placeholder={placeholder}
        required={required}
        disabled={disabled}
        className={className}
        aria-invalid={ariaInvalid}
        aria-describedby={ariaDescribedBy}
        aria-label={ariaLabel}
      />
      {canCreate ? (
        <NewClientDialog
          open={creating}
          onClose={() => setCreating(false)}
          onCreated={onCreated}
        />
      ) : null}
    </>
  );
}
