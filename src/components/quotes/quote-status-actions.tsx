"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition } from "react";
import { updateQuoteStatus } from "@/actions/quotes";
import { allowedQuoteTransitions } from "@/lib/quotes/transitions";
import {
  quoteStatusLabel,
  type QuoteStatus,
} from "@/lib/quotes/status";
import { parseDeclineQuoteInput } from "@/lib/quotes/schema";
import { Button, buttonClasses } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label, Select, Textarea } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { SplitButton } from "@/components/ui/split-button";

function transitionLabel(target: QuoteStatus, from: QuoteStatus): string {
  if (target === "accepted") return "Accept & create order";
  if (target === "declined") return "Decline";
  if (target === "draft" && from === "declined") return "Reopen";
  return `Mark as ${quoteStatusLabel(target).toLowerCase()}`;
}

/** Preferred primary action when multiple transitions are available. */
function primaryTransition(transitions: QuoteStatus[]): QuoteStatus {
  if (transitions.includes("accepted")) return "accepted";
  if (transitions.includes("sent")) return "sent";
  return transitions[0];
}

export function QuoteStatusActions({
  quoteId,
  status,
  canWrite,
  declineCategories,
}: {
  quoteId: string;
  status: QuoteStatus;
  canWrite: boolean;
  declineCategories: string[];
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
    applyActionResult,
    setError,
  } = useFieldErrors();
  const [pending, startTransition] = useTransition();
  const [declineOpen, setDeclineOpen] = useState(false);
  const [category, setCategory] = useState("");
  const [customCategory, setCustomCategory] = useState("");
  const [narrative, setNarrative] = useState("");
  const formRef = useRef<HTMLFormElement>(null);

  if (!canWrite) return null;

  const transitions = allowedQuoteTransitions(status);
  if (transitions.length === 0) {
    return (
      <p className="text-sm text-muted">
        Status: <span className="font-medium text-foreground">{quoteStatusLabel(status)}</span>{" "}
        (locked)
      </p>
    );
  }

  async function runTransition(target: QuoteStatus) {
    clearAll();
    if (target === "declined") {
      setCategory(declineCategories[0] ?? "Other");
      setCustomCategory("");
      setNarrative("");
      setDeclineOpen(true);
      return;
    }

    if (target === "accepted") {
      const accepted = await confirm({
        title: "Accept quote",
        message:
          "Accept this quote and create an order? The quote will be locked after acceptance.",
        confirmLabel: "Accept & create order",
      });
      if (!accepted) return;
    }

    if (target === "draft" && status === "declined") {
      const reopened = await confirm({
        title: "Reopen quote",
        message: "Reopen this quote for editing? Decline details will be cleared.",
        confirmLabel: "Reopen",
      });
      if (!reopened) return;
    }

    startTransition(async () => {
      const result = await updateQuoteStatus(quoteId, target);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (target === "accepted" && result.id) {
        router.push(`/orders/${result.id}`);
      } else {
        router.refresh();
      }
    });
  }

  const primary = primaryTransition(transitions);
  const menuTransitions = transitions.filter((t) => t !== primary);

  return (
    <>
      <SplitButton
        primaryLabel={transitionLabel(primary, status)}
        onPrimary={() => runTransition(primary)}
        options={menuTransitions.map((target) => ({
          key: target,
          label: transitionLabel(target, status),
          onSelect: () => runTransition(target),
        }))}
        disabled={pending}
        menuAriaLabel="Other status transitions"
      />
      <FieldError>{error && !declineOpen ? error : null}</FieldError>

      <Dialog open={declineOpen} onClose={() => setDeclineOpen(false)} title="Decline quote">
        <form
          ref={formRef}
          noValidate
          className="space-y-3"
          onSubmit={preventResetSubmit((_formData) => {
            clearAll();
            const resolvedCategory =
              category === "__custom__" ? customCategory.trim() : category;
            const clientParsed = parseDeclineQuoteInput({
              category: resolvedCategory,
              narrative,
            });
            if (!clientParsed.ok) {
              applyFail(clientParsed);
              scheduleFocusFirstFieldError(
                formRef.current,
                clientParsed.fieldErrors,
              );
              return;
            }
            startTransition(async () => {
              const result = await updateQuoteStatus(quoteId, "declined", {
                category: resolvedCategory,
                narrative,
              });
              if (applyActionResult(result)) {
                setDeclineOpen(false);
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
          <div>
            <Label htmlFor="decline-category" required>
              Reason category
            </Label>
            <Select
              id="decline-category"
              value={category}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.category)}
              aria-describedby={
                fieldErrors.category ? "decline-category-error" : undefined
              }
              onChange={(e) => {
                clearField("category");
                setCategory(e.target.value);
              }}
            >
              <option value="">Select…</option>
              {declineCategories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
              <option value="__custom__">Custom…</option>
            </Select>
            <FieldError id="decline-category-error">{fieldErrors.category}</FieldError>
          </div>
          {category === "__custom__" ? (
            <div>
              <Label htmlFor="decline-custom-category" required>
                Custom category
              </Label>
              <Input
                id="decline-custom-category"
                value={customCategory}
                disabled={pending}
                aria-invalid={Boolean(fieldErrors.category)}
                onChange={(e) => {
                  clearField("category");
                  setCustomCategory(e.target.value);
                }}
              />
            </div>
          ) : null}
          <div>
            <Label htmlFor="decline-narrative" required>
              Explanation
            </Label>
            <Textarea
              id="decline-narrative"
              rows={4}
              value={narrative}
              disabled={pending}
              aria-invalid={Boolean(fieldErrors.narrative)}
              aria-describedby={
                fieldErrors.narrative ? "decline-narrative-error" : undefined
              }
              onChange={(e) => {
                clearField("narrative");
                setNarrative(e.target.value);
              }}
            />
            <FieldError id="decline-narrative-error">{fieldErrors.narrative}</FieldError>
          </div>
          <FieldError>{error}</FieldError>
          <DialogActions>
            <button
              type="button"
              className={buttonClasses("ghost")}
              disabled={pending}
              onClick={() => setDeclineOpen(false)}
            >
              Cancel
            </button>
            <Button type="submit" disabled={pending}>
              {pending ? "Saving…" : "Decline quote"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
