"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/form";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import { invitePlatformAdmin } from "@/actions/platform";
import {
  parsePlatformInviteAdminInput,
  platformInviteAdminRawFromFormData,
} from "@/lib/platform/schema";

export function InvitePlatformAdminButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const {
    fieldErrors,
    error,
    clearAll,
    clearField,
    applyFail,
    applyActionResult,
  } = useFieldErrors();
  const formRef = useRef<HTMLFormElement>(null);

  function close() {
    if (pending) return;
    setOpen(false);
    clearAll();
  }

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        Invite admin
      </Button>

      <Dialog
        open={open}
        onClose={close}
        title="Invite platform admin"
        className="max-w-md"
      >
        <p className="text-sm text-muted">
          Sends a Clerk invitation. The email must not already exist as a user.
        </p>
        <form
          ref={formRef}
          noValidate
          className="mt-4 space-y-4"
          onSubmit={preventResetSubmit((formData, form) => {
            clearAll();
            const clientParsed = parsePlatformInviteAdminInput(
              platformInviteAdminRawFromFormData(formData),
            );
            if (!clientParsed.ok) {
              applyFail(clientParsed);
              scheduleFocusFirstFieldError(
                formRef.current,
                clientParsed.fieldErrors,
              );
              return;
            }
            start(async () => {
              const result = await invitePlatformAdmin(formData);
              if (!applyActionResult(result)) {
                if (!result.ok) {
                  scheduleFocusFirstFieldError(
                    formRef.current,
                    result.fieldErrors,
                  );
                }
                return;
              }
              form.reset();
              setOpen(false);
              router.refresh();
            });
          })}
        >
          <div>
            <Label htmlFor="platformAdminEmail" required>
              Email
            </Label>
            <Input
              id="platformAdminEmail"
              name="email"
              type="email"
              required
              disabled={pending}
              autoComplete="off"
              aria-invalid={Boolean(fieldErrors.email)}
              aria-describedby={fieldErrors.email ? "email-error" : undefined}
              onChange={() => clearField("email")}
            />
            <FieldError id="email-error">{fieldErrors.email}</FieldError>
          </div>

          <div>
            <Label htmlFor="platformAdminName">Name (optional)</Label>
            <Input
              id="platformAdminName"
              name="name"
              type="text"
              disabled={pending}
              placeholder="Optional"
              aria-invalid={Boolean(fieldErrors.name)}
              aria-describedby={fieldErrors.name ? "name-error" : undefined}
              onChange={() => clearField("name")}
            />
            <FieldError id="name-error">{fieldErrors.name}</FieldError>
          </div>

          <FieldError>{error}</FieldError>

          <DialogActions>
            <Button
              type="button"
              variant="secondary"
              disabled={pending}
              onClick={close}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Inviting…" : "Send invitation"}
            </Button>
          </DialogActions>
        </form>
      </Dialog>
    </>
  );
}
