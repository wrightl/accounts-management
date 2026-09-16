"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Dialog, DialogActions } from "@/components/ui/dialog";
import { FieldError, Input, Label } from "@/components/ui/form";
import { invitePlatformAdmin } from "@/actions/platform";

export function InvitePlatformAdminButton() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  function close() {
    if (pending) return;
    setOpen(false);
    setError(null);
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
          className="mt-4 space-y-4"
          onSubmit={(e) => {
            e.preventDefault();
            setError(null);
            const formData = new FormData(e.currentTarget);
            start(async () => {
              const result = await invitePlatformAdmin(formData);
              if (!result.ok) {
                setError(result.error);
                return;
              }
              e.currentTarget.reset();
              setOpen(false);
              router.refresh();
            });
          }}
        >
          <div>
            <Label htmlFor="platformAdminEmail">Email</Label>
            <Input
              id="platformAdminEmail"
              name="email"
              type="email"
              required
              disabled={pending}
              autoComplete="off"
            />
          </div>

          <div>
            <Label htmlFor="platformAdminName">Name (optional)</Label>
            <Input
              id="platformAdminName"
              name="name"
              type="text"
              disabled={pending}
              placeholder="Optional"
            />
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
