"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  disconnectStripeAccount,
  startStripeConnectOnboarding,
} from "@/actions/online-payments";
import { Button, buttonClasses } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError } from "@/components/ui/form";
import type { OnlinePaymentsStatus } from "@/lib/payments/online-status";

const STATUS_COPY: Record<OnlinePaymentsStatus, { title: string; body: string }> = {
  not_connected: {
    title: "Not connected",
    body: "Connect a Stripe account and clients can pay invoices by card, Apple Pay or Google Pay from the invoice link. Money goes straight to your Stripe account; Stripe's standard card fees apply and Alfa takes nothing.",
  },
  pending: {
    title: "Setup not finished",
    body: "Stripe needs a few more details before you can take payments. Pick up where you left off.",
  },
  enabled: {
    title: "Taking card payments",
    body: "Invoice emails include a pay link, and payments are recorded against the invoice automatically. Stripe pays out to your bank on its usual schedule, net of fees.",
  },
};

export function OnlinePaymentsPanel({
  status,
  accountId,
  configured,
}: {
  status: OnlinePaymentsStatus;
  accountId: string | null;
  configured: boolean;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const copy = STATUS_COPY[status];

  function connect() {
    setError(null);
    startTransition(async () => {
      try {
        const result = await startStripeConnectOnboarding();
        // Success redirects to Stripe; only errors return.
        if (!result.ok) setError(result.error);
      } catch (err) {
        const { isRedirectError } = await import(
          "next/dist/client/components/redirect-error"
        );
        if (isRedirectError(err)) throw err;
        setError("Couldn't open Stripe. Try again.");
      }
    });
  }

  async function disconnect() {
    const ok = await confirm({
      title: "Stop online payments",
      message:
        "Pay links will stop working. Your Stripe account and past payments aren't affected, and you can reconnect later.",
      confirmLabel: "Stop online payments",
      variant: "destructive",
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await disconnectStripeAccount();
      if (!result.ok) setError(result.error);
      else router.refresh();
    });
  }

  if (!configured) {
    return (
      <p className="rounded-xl bg-wash px-4 py-3 text-sm text-muted">
        Online payments aren&apos;t available on this installation yet.
      </p>
    );
  }

  return (
    <div className="max-w-2xl space-y-4 rounded-2xl border border-border bg-surface p-6">
      <div>
        <h2 className="font-display text-lg font-semibold">{copy.title}</h2>
        <p className="mt-1 text-sm text-muted">{copy.body}</p>
        {accountId ? (
          <p className="mt-2 text-xs text-muted">
            Stripe account <span className="font-mono">{accountId}</span>
          </p>
        ) : null}
      </div>
      <div className="flex flex-wrap gap-2">
        {status === "not_connected" ? (
          <Button type="button" disabled={pending} onClick={connect}>
            {pending ? "Opening Stripe…" : "Connect Stripe"}
          </Button>
        ) : null}
        {status === "pending" ? (
          <Button type="button" disabled={pending} onClick={connect}>
            {pending ? "Opening Stripe…" : "Continue setup"}
          </Button>
        ) : null}
        {status === "enabled" ? (
          <a
            href="https://dashboard.stripe.com"
            target="_blank"
            rel="noreferrer"
            className={buttonClasses("secondary")}
          >
            Open Stripe dashboard
          </a>
        ) : null}
        {status !== "not_connected" ? (
          <Button type="button" variant="ghost" disabled={pending} onClick={disconnect}>
            Stop online payments
          </Button>
        ) : null}
      </div>
      <FieldError>{error}</FieldError>
    </div>
  );
}
