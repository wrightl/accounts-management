"use client";

import { useState, useTransition } from "react";
import { startInvoiceCheckout } from "@/actions/public-invoices";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";

export function PublicInvoicePayButton({
  token,
  amountFormatted,
}: {
  token: string;
  amountFormatted: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div className="space-y-2">
      <Button
        type="button"
        disabled={pending}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const result = await startInvoiceCheckout(token);
              // On success the action redirects to Stripe; only errors return.
              if (!result.ok) setError(result.error);
            } catch (err) {
              const { isRedirectError } = await import(
                "next/dist/client/components/redirect-error"
              );
              if (isRedirectError(err)) throw err;
              setError("Couldn't start the payment. Try again.");
            }
          });
        }}
      >
        {pending ? "Opening secure payment…" : `Pay ${amountFormatted} by card`}
      </Button>
      <p className="text-xs text-muted">
        Card, Apple Pay or Google Pay. Payment is handled securely by Stripe.
      </p>
      <FieldError>{error}</FieldError>
    </div>
  );
}
