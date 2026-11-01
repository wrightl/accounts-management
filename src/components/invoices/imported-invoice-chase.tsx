"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  chaseAllImportedInvoices,
  setInvoiceChase,
} from "@/actions/invoice-chase";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError } from "@/components/ui/form";

const OLD_DEBT_NOTE =
  "Clients get the next reminder on your schedule. Take care with very old debts, as a debt can become too old to recover.";

/** Banner on the invoice list: imported invoices nobody is chasing yet. */
export function UnchasedImportsBanner({
  count,
  totalFormatted,
  withoutEmail,
  canWrite,
}: {
  count: number;
  totalFormatted: string;
  withoutEmail: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const noEmailNote =
    withoutEmail > 0
      ? ` ${withoutEmail} can't be emailed because the client has no email address.`
      : "";

  async function onChase() {
    const ok = await confirm({
      title: `Chase ${count} imported invoices`,
      message: `Reminders can go out for ${totalFormatted}.${noEmailNote} ${OLD_DEBT_NOTE}`,
      confirmLabel: "Start chasing",
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await chaseAllImportedInvoices();
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="mt-6 rounded-xl bg-wash px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          {count} imported unpaid {count === 1 ? "invoice" : "invoices"} ({totalFormatted}){" "}
          {count === 1 ? "isn't" : "aren't"} being chased, so clients won&apos;t get
          reminders.{noEmailNote}
        </p>
        {canWrite ? (
          <Button type="button" variant="secondary" disabled={pending} onClick={onChase}>
            {pending ? "Saving…" : "Chase these invoices"}
          </Button>
        ) : null}
      </div>
      <FieldError id="chase-imports-error">{error}</FieldError>
    </div>
  );
}

/** Reminder switch on an open imported invoice. */
export function InvoiceChaseToggle({
  invoiceId,
  enabled,
  hasClientEmail,
}: {
  invoiceId: string;
  enabled: boolean;
  hasClientEmail: boolean;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  async function onToggle() {
    if (!enabled) {
      const ok = await confirm({
        title: "Chase this invoice",
        message: OLD_DEBT_NOTE,
        confirmLabel: "Start chasing",
      });
      if (!ok) return;
    }
    setError(null);
    startTransition(async () => {
      const result = await setInvoiceChase(invoiceId, !enabled);
      if (result.ok) router.refresh();
      else setError(result.error);
    });
  }

  return (
    <div className="mt-3 rounded-xl bg-wash px-4 py-3 text-sm">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p>
          {enabled
            ? "Imported invoice: reminders are on."
            : "Imported invoice: reminders are off, so the client won't be chased."}
          {!hasClientEmail ? " The client has no email address, so reminders can't be sent." : ""}
        </p>
        <Button type="button" variant="secondary" disabled={pending} onClick={onToggle}>
          {enabled ? "Stop chasing" : "Start chasing"}
        </Button>
      </div>
      <FieldError id="chase-invoice-error">{error}</FieldError>
    </div>
  );
}
