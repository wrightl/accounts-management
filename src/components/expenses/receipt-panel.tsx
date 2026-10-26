"use client";

import { useRouter } from "next/navigation";
import { useRef, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { deleteReceipt, uploadReceipt } from "@/actions/expenses";
import { isPreviewableReceipt } from "@/lib/expenses/receipt-file";

export function ReceiptPanel({
  expenseId,
  receipts,
  canWrite,
}: {
  expenseId: string;
  receipts: {
    id: string;
    filename: string;
    contentType: string | null;
    sizeBytes: number | null;
  }[];
  canWrite: boolean;
}) {
  const router = useRouter();
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
    applyActionResult,
  } = useFieldErrors();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="space-y-4">
      <h2 className="font-display text-lg font-semibold">Receipts</h2>
      {receipts.length === 0 ? (
        <p className="text-sm text-muted">No receipts uploaded.</p>
      ) : (
        <ul className="space-y-2">
          {receipts.map((r) => (
            <li
              key={r.id}
              className="rounded-lg border border-border px-3 py-2 text-sm"
            >
              <div className="flex items-center justify-between gap-3">
                <a
                  href={`/api/receipts/${r.id}`}
                  className="text-foreground hover:underline"
                >
                  {r.filename}
                </a>
                {canWrite && (
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={pending}
                    onClick={() => {
                      clearAll();
                      startTransition(async () => {
                        const result = await deleteReceipt(r.id);
                        if (applyActionResult(result)) {
                          router.refresh();
                        } else if (!result.ok) {
                          scheduleFocusFirstFieldError(
                            formRef.current,
                            result.fieldErrors,
                          );
                        }
                      });
                    }}
                  >
                    Remove
                  </Button>
                )}
              </div>
              <ReceiptPreview receipt={r} />
            </li>
          ))}
        </ul>
      )}

      {canWrite && (
        <form
          ref={formRef}
          noValidate
          className="flex flex-wrap items-end gap-3"
          onSubmit={preventResetSubmit((formData) => {
            clearAll();
            const file = formData.get("receipt");
            if (!(file instanceof File) || file.size === 0) {
              const fail = {
                error: "Choose a receipt file",
                fieldErrors: { receipt: "Choose a receipt file" },
              };
              applyFail(fail);
              scheduleFocusFirstFieldError(formRef.current, fail.fieldErrors);
              return;
            }
            startTransition(async () => {
              const result = await uploadReceipt(expenseId, formData);
              if (applyActionResult(result)) {
                router.refresh();
              } else if (!result.ok) {
                scheduleFocusFirstFieldError(
                  formRef.current,
                  result.fieldErrors,
                );
              }
            });
          })}
        >
          <div className="flex-1">
            <Label htmlFor="receipt" required>
              Upload receipt
            </Label>
            <Input
              id="receipt"
              name="receipt"
              type="file"
              accept="image/*,application/pdf"
              required
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.receipt)}
              aria-describedby={
                fieldErrors.receipt ? "receipt-error" : undefined
              }
              onChange={() => clearField("receipt")}
            />
            <FieldError id="receipt-error">{fieldErrors.receipt}</FieldError>
          </div>
          <Button type="submit" variant="secondary" disabled={pending}>
            {pending ? "Uploading…" : "Upload"}
          </Button>
        </form>
      )}
      <FieldError>{error}</FieldError>
    </div>
  );
}

/** The receipt shown in the page; the filename link above still downloads it. */
function ReceiptPreview({
  receipt,
}: {
  receipt: { id: string; filename: string; contentType: string | null };
}) {
  const src = `/api/receipts/${receipt.id}?inline=1`;
  if (receipt.contentType === "application/pdf") {
    return (
      <iframe
        src={src}
        title={`Preview of ${receipt.filename}`}
        className="mt-2 h-[32rem] w-full rounded border border-border bg-white"
      />
    );
  }
  if (isPreviewableReceipt(receipt.contentType)) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- private, auth-gated file; next/image can't fetch it
      <img
        src={src}
        alt={`Preview of ${receipt.filename}`}
        loading="lazy"
        className="mt-2 max-h-[32rem] w-full rounded border border-border object-contain"
      />
    );
  }
  return null;
}
