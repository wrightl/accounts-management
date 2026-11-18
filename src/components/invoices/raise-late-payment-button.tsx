"use client";

import { FilePlus } from "lucide-react";
import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { raiseLatePaymentInvoice } from "@/actions/late-payment";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";

export function RaiseLatePaymentButton({ invoiceId }: { invoiceId: string }) {
  const router = useRouter();
  const { alert } = useAlert();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      variant="secondary"
      disabled={pending}
      onClick={() =>
        startTransition(async () => {
          const result = await raiseLatePaymentInvoice(invoiceId);
          if (!result.ok) {
            await alert({ title: "Couldn't raise the invoice", message: result.error });
            return;
          }
          router.push(`/invoices/${result.id}`);
        })
      }
    >
      <FilePlus className="h-4 w-4" />
      {pending ? "Raising…" : "Raise late payment invoice"}
    </Button>
  );
}
