"use client";

import { useState, useTransition } from "react";
import {
  retrySignupCheckout,
  switchSignupToTrial,
} from "@/actions/billing";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";

export function SubscribeGateActions({
  planLabel,
  canceled,
}: {
  planLabel: string;
  canceled?: boolean;
}) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function onPay() {
    setError(null);
    start(async () => {
      try {
        const result = await retrySignupCheckout();
        if (result && !result.ok) {
          setError(result.error);
          toast(result.error);
        }
      } catch (err) {
        const { isRedirectError } = await import(
          "next/dist/client/components/redirect-error"
        );
        if (isRedirectError(err)) throw err;
        const message =
          err instanceof Error ? err.message : "Could not open Checkout.";
        setError(message);
        toast(message);
      }
    });
  }

  function onTrial() {
    setError(null);
    start(async () => {
      try {
        const result = await switchSignupToTrial();
        if (result && !result.ok) {
          setError(result.error);
          toast(result.error);
        }
      } catch (err) {
        const { isRedirectError } = await import(
          "next/dist/client/components/redirect-error"
        );
        if (isRedirectError(err)) throw err;
        const message =
          err instanceof Error ? err.message : "Could not start trial.";
        setError(message);
        toast(message);
      }
    });
  }

  return (
    <div className="space-y-4">
      {canceled ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          Checkout was canceled. Add a card for {planLabel} to start your 30-day
          free trial (first charge after the trial), or continue without a card
          on the Trial plan.
        </p>
      ) : (
        <p className="text-sm text-muted">
          Add a card for <strong>{planLabel}</strong> to open your books — you
          get 30 days free before the first charge — or continue without a card
          on the Trial plan.
        </p>
      )}

      {error ? (
        <p className="text-sm text-red-700" role="alert">
          {error}
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="button" onClick={onPay} disabled={pending}>
          {pending ? "Working…" : `Start ${planLabel} trial`}
        </Button>
        <Button
          type="button"
          variant="secondary"
          onClick={onTrial}
          disabled={pending}
        >
          Continue without a card
        </Button>
      </div>
    </div>
  );
}
