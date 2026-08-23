"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { convertQuoteToInvoice, sendQuote } from "@/actions/quotes";
import { Button, buttonClasses } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/form";

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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [sendOpen, setSendOpen] = useState(false);
  const [to, setTo] = useState(clientEmail);
  const [message, setMessage] = useState(defaultMessage);

  if (!canWrite) return null;

  const canSend = status !== "converted" && status !== "declined";
  const canConvert = status !== "converted" && status !== "declined";

  function refresh() {
    router.refresh();
  }

  function openSendDialog() {
    setError(null);
    setTo(clientEmail);
    setMessage(defaultMessage);
    setSendOpen(true);
  }

  return (
    <div className="space-y-4">
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
        {canConvert && (
          <Button
            type="button"
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                const result = await convertQuoteToInvoice(quoteId);
                if (!result.ok) setError(result.error);
                else {
                  router.push(`/dashboard/invoices/${result.id}`);
                  router.refresh();
                }
              });
            }}
          >
            {pending ? "Converting…" : "Convert to invoice"}
          </Button>
        )}
      </div>

      <Dialog open={sendOpen} onClose={() => setSendOpen(false)} title="Send quote PDF">
        <form
          className="space-y-3"
          action={(formData) => {
            setError(null);
            formData.set("to", to);
            formData.set("message", message);
            startTransition(async () => {
              const result = await sendQuote(quoteId, formData);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              setSendOpen(false);
              refresh();
            });
          }}
        >
          <div>
            <Label htmlFor="send-to">To</Label>
            <Input
              id="send-to"
              type="email"
              required
              value={to}
              disabled={pending}
              onChange={(e) => setTo(e.target.value)}
            />
          </div>
          <div>
            <Label htmlFor="send-message">Message</Label>
            <Textarea
              id="send-message"
              rows={8}
              required
              value={message}
              disabled={pending}
              onChange={(e) => setMessage(e.target.value)}
            />
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
    </div>
  );
}
