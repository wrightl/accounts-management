"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Input, Label, Select } from "@/components/ui/form";
import {
  archiveShareholder,
  createShareholder,
  updateShareholder,
} from "@/actions/shareholders";

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
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canWrite && mode === "create") {
    return (
      <p className="text-sm text-muted">
        You do not have permission to manage shareholders.
      </p>
    );
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createShareholder(formData)
          : await updateShareholder(shareholder!.id, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push(
        mode === "edit" && shareholder
          ? `/dashboard/shareholders/${shareholder.id}`
          : result.id
            ? `/dashboard/shareholders/${result.id}`
            : "/dashboard/shareholders",
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
    setError(null);
    startTransition(async () => {
      const result = await archiveShareholder(shareholder.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/dashboard/shareholders");
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="mx-auto max-w-xl space-y-4">
      <div>
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={shareholder?.name ?? ""}
          disabled={!canWrite || pending}
        />
      </div>
      <div>
        <Label htmlFor="shareCount">Number of shares</Label>
        <Input
          id="shareCount"
          name="shareCount"
          type="number"
          min={1}
          step={1}
          required
          defaultValue={shareholder?.shareCount ?? ""}
          disabled={!canWrite || pending}
        />
      </div>
      <div>
        <Label htmlFor="userId">Linked user (optional)</Label>
        <Select
          id="userId"
          name="userId"
          defaultValue={shareholder?.userId ?? ""}
          disabled={!canWrite || pending}
        >
          <option value="">None</option>
          {users.map((u) => (
            <option key={u.id} value={u.id}>
              {u.name ? `${u.name} (${u.email})` : u.email}
            </option>
          ))}
        </Select>
      </div>
      <FieldError>{error}</FieldError>
      <div className="flex flex-wrap gap-2">
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
      </div>
    </form>
  );
}
