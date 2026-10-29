"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";
import { updateMyInboundAlias } from "@/actions/inbound-alias";
import { Button } from "@/components/ui/button";
import { CopyButton } from "@/components/ui/copy-button";
import { FieldError, Input, Label } from "@/components/ui/form";
import {
  INBOUND_ALIAS_MAX,
  inboundAliasError,
  normalizeInboundAlias,
} from "@/lib/expenses/inbound-alias";

/** The person's address for emailing receipts, with a form to rename it. */
export function InboundAddress({
  alias,
  domain,
  legacyAddress,
}: {
  alias: string;
  domain: string;
  /** Their old long address, which still works. */
  legacyAddress: string | null;
}) {
  const router = useRouter();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(alias);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const address = `${alias}@${domain}`;

  function onSave(event: FormEvent) {
    event.preventDefault();
    const next = normalizeInboundAlias(draft);
    if (next === alias) {
      setEditing(false);
      return;
    }
    const invalid = inboundAliasError(next);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError(null);
    startTransition(async () => {
      const result = await updateMyInboundAlias(next);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setEditing(false);
      router.refresh();
    });
  }

  if (editing) {
    return (
      <form
        onSubmit={onSave}
        className="mt-4 rounded-lg border border-border bg-wash/50 px-4 py-3 text-sm"
      >
        <Label htmlFor="inbound-alias">Your address for emailing receipts</Label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex min-w-0 flex-1 items-center gap-1">
            <Input
              id="inbound-alias"
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={INBOUND_ALIAS_MAX}
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              autoFocus
              aria-invalid={error ? true : undefined}
              aria-describedby="inbound-alias-help inbound-alias-error"
              className="min-w-0 max-w-56"
            />
            <span className="truncate text-muted">@{domain}</span>
          </div>
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : "Save"}
          </Button>
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={() => {
              setDraft(alias);
              setError(null);
              setEditing(false);
            }}
          >
            Cancel
          </Button>
        </div>
        <FieldError id="inbound-alias-error">{error}</FieldError>
        <p id="inbound-alias-help" className="mt-1 text-muted">
          Letters and numbers, with dots or hyphens between them. {address} stops working
          as soon as you save. For 90 days only you can switch back to it.
        </p>
      </form>
    );
  }

  return (
    <div className="mt-4 rounded-lg border border-border bg-wash/50 px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center gap-3">
        <span className="min-w-0 flex-1 text-muted">
          Email receipts to{" "}
          <span className="font-medium text-foreground break-all">{address}</span>. Add
          #personal or #company to the subject to say how you paid.
        </span>
        <CopyButton value={address} />
        <Button type="button" variant="secondary" className="text-xs" onClick={() => setEditing(true)}>
          Change
        </Button>
      </div>
      <p className="mt-1 text-xs text-muted">
        Receipts from any other address, such as a supplier&apos;s, are marked for you to check.
        {legacyAddress ? (
          <>
            {" "}
            Your old address, <span className="break-all">{legacyAddress}</span>, still works.
          </>
        ) : null}
      </p>
    </div>
  );
}
