"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { sendQuote } from "@/actions/quotes";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import {
  parseSendQuoteInput,
  sendQuoteRawFromFormData,
} from "@/lib/quotes/schema";

export function QuoteActions({
  quoteId,
  status,
  canWrite,
  clientEmail,
  defaultMessage,
}: {
  quoteId: string;
  status: string;
  canWrite: boolean;
  clientEmail: string;
  defaultMessage: string;
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
  const [pending, startTransition] = useTransition();
  const [sendOpen, setSendOpen] = useState(false);
  const [to, setTo] = useState(clientEmail);
  const [message, setMessage] = useState(defaultMessage);
  const formRef = useRef<HTMLFormElement>(null);

  if (!canWrite) return null;

  const canSend = status === "draft" || status === "sent";

  function refresh() {
    router.refresh();
  }

  function openSendDialog() {
    clearAll();
    setTo(clientEmail);
    setMessage(defaultMessage);
    setSendOpen(true);
  }

  return (
    <>
      <div className="flex flex-wrap gap-2">
        <a href={`/api/quotes/${quoteId}/pdf`}>
          <Button type="button" variant="secondary" disabled={pending}>
            Download PDF
          </Button>
        </a>
        {canSend && (
          <Button type="button" disabled={pending} onClick={openSendDialog}>
            Send PDF
          </Button>
        )}
      </div>

      <Dialog open={sendOpen} onClose={() => setSendOpen(false)} title="Send quote PDF">
        <form
          ref={formRef}
          noValidate
          className="space-y-3"
          onSubmit={preventResetSubmit((formData) => {
            clearAll();
            formData.set("to", to);
            formData.set("message", message);
            const clientParsed = parseSendQuoteInput(
              sendQuoteRawFromFormData(formData),
            );
            if (!clientParsed.ok) {
              applyFail(clientParsed);
              scheduleFocusFirstFieldError(
                formRef.current,
                clientParsed.fieldErrors,
              );
              return;
            }
            startTransition(async () => {
              const result = await sendQuote(quoteId, formData);
              if (applyActionResult(result)) {
                setSendOpen(false);
                refresh();
              } else if (!result.ok) {
                scheduleFocusFirstFieldError(
                  formRef.current,
                  result.fieldErrors,
                );
              }
            });
          })}
        >
          <div>
            <Label htmlFor="send-to" required>
              To
            </Label>
            <Input
              id="send-to"
              type="email"
              value={to}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.to)}
              aria-describedby={fieldErrors.to ? "send-to-error" : undefined}
              onChange={(e) => {
                clearField("to");
                setTo(e.target.value);
              }}
            />
            <FieldError id="send-to-error">{fieldErrors.to}</FieldError>
          </div>
          <div>
            <Label htmlFor="send-message" required>
              Message
            </Label>
            <Textarea
              id="send-message"
              rows={8}
              value={message}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.message)}
              aria-describedby={
                fieldErrors.message ? "send-message-error" : undefined
              }
              onChange={(e) => {
                clearField("message");
                setMessage(e.target.value);
              }}
            />
            <FieldError id="send-message-error">{fieldErrors.message}</FieldError>
          </div>
          <FieldError>{error}</FieldError>
          <DialogActions>
            <button
              type="button"
              className={buttonClasses("ghost")}
              disabled={pending}
              onClick={() => setSendOpen(false)}
            >
              Cancel
            </button>
            <Button type="submit" disabled={pending}>
              {pending ? "Sending…" : "Send"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>

      <FieldError>{error && !sendOpen ? error : null}</FieldError>
    </>
  );
}
