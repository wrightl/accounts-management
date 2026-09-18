"use client";

import { useRouter } from "next/navigation";
import { useRef, useState, useTransition, type ChangeEvent } from "react";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Input, Label, Select } from "@/components/ui/form";
import { FormStickyActions } from "@/components/ui/form-sticky-actions";
import { scheduleFocusFirstFieldError } from "@/components/ui/focus-first-field-error";
import { preventResetSubmit } from "@/components/ui/prevent-reset-submit";
import { useFieldErrors } from "@/components/ui/use-field-errors";
import {
  archiveShareholder,
  createShareholder,
  updateShareholder,
} from "@/actions/shareholders";
import {
  parseShareholderInput,
  shareholderRawFromFormData,
} from "@/lib/shareholders/schema";

type UserOption = { id: string; name: string | null; email: string };

export function ShareholderForm({
  mode,
  shareholder,
  users,
  canWrite,
}: {
  mode: "create" | "edit";
  shareholder?: {
    id: string;
    name: string;
    shareCount: number;
    userId: string | null;
  };
  users: UserOption[];
  canWrite: boolean;
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
  } = useFieldErrors();
  const formRef = useRef<HTMLFormElement>(null);
  const [pending, startTransition] = useTransition();
  const [name, setName] = useState(shareholder?.name ?? "");

  function onLinkedUserChange(event: ChangeEvent<HTMLSelectElement>) {
    clearField("userId");
    const userId = event.target.value;
    if (!userId) return;
    const user = users.find((u) => u.id === userId);
    if (!user) return;
    setName(user.name?.trim() || user.email);
    clearField("name");
  }

  if (!canWrite && mode === "create") {
    return (
      <p className="text-sm text-muted">
        You do not have permission to manage shareholders.
      </p>
    );
  }

  function onSubmit(formData: FormData) {
    formData.set("name", name);
    clearAll();
    const clientParsed = parseShareholderInput(shareholderRawFromFormData(formData));
    if (!clientParsed.ok) {
      applyFail(clientParsed);
      scheduleFocusFirstFieldError(formRef.current, clientParsed.fieldErrors);
      return;
    }
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createShareholder(formData)
          : await updateShareholder(shareholder!.id, formData);
      if (!applyActionResult(result)) {
        if (!result.ok) {
          scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
        }
        return;
      }
      router.push(
        mode === "edit" && shareholder
          ? `/shareholders/${shareholder.id}`
          : "/shareholders",
      );
      router.refresh();
    });
  }

  async function onArchive() {
    if (!shareholder) return;
    const ok = await confirm({
      title: "Archive shareholder",
      message:
        "Archive this shareholder? They will be excluded from future dividends. Total shares will be reduced to match remaining holders.",
      confirmLabel: "Archive",
      variant: "destructive",
    });
    if (!ok) return;
    clearAll();
    startTransition(async () => {
      const result = await archiveShareholder(shareholder.id);
      if (!applyActionResult(result)) {
        if (!result.ok) {
          scheduleFocusFirstFieldError(formRef.current, result.fieldErrors);
        }
        return;
      }
      router.push("/shareholders");
      router.refresh();
    });
  }

  return (
    <form ref={formRef} noValidate onSubmit={preventResetSubmit(onSubmit)} className="mx-auto max-w-xl space-y-4">
      <div>
        <Label htmlFor="name" required>
          Name
        </Label>
        <Input
          id="name"
          name="name"
          required
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            clearField("name");
          }}
          disabled={!canWrite || pending}
          aria-invalid={Boolean(fieldErrors.name)}
          aria-describedby={fieldErrors.name ? "name-error" : undefined}
        />
        <FieldError id="name-error">{fieldErrors.name}</FieldError>
      </div>
      <div>
        <Label htmlFor="shareCount" required>
          Number of shares
        </Label>
        <Input
          id="shareCount"
          name="shareCount"
          type="number"
          min={1}
          step={1}
          required
          defaultValue={shareholder?.shareCount ?? ""}
          disabled={!canWrite || pending}
          aria-invalid={Boolean(fieldErrors.shareCount)}
          aria-describedby={
            fieldErrors.shareCount ? "shareCount-error" : undefined
          }
          onChange={() => clearField("shareCount")}
        />
        <FieldError id="shareCount-error">{fieldErrors.shareCount}</FieldError>
      </div>
      <div>
        <Label htmlFor="userId">Linked user (optional)</Label>
        <Select
          id="userId"
          name="userId"
          defaultValue={shareholder?.userId ?? ""}
          onChange={onLinkedUserChange}
          disabled={!canWrite || pending}
          aria-invalid={Boolean(fieldErrors.userId)}
          aria-describedby={fieldErrors.userId ? "userId-error" : undefined}
        >
          <option value="">None</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ? `${u.name} (${u.email})` : u.email}
            </option>
          ))}
        </Select>
        <FieldError id="userId-error">{fieldErrors.userId}</FieldError>
      </div>
      <FormStickyActions error={error}>
        <Button type="submit" disabled={!canWrite || pending}>
          {mode === "create" ? "Add shareholder" : "Save"}
        </Button>
        {mode === "edit" && canWrite && (
          <Button
            type="button"
            variant="ghost"
            disabled={pending}
            onClick={onArchive}
          >
            Archive
          </Button>
        )}
      </FormStickyActions>
    </form>
  );
}
