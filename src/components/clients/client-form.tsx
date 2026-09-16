"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";
import { FieldError, Input, Label, Textarea } from "@/components/ui/form";
import { createClient, updateClient, deleteClient } from "@/actions/clients";

export function ClientForm({
  mode,
  client,
  canWrite,
}: {
  mode: "create" | "edit";
  client?: {
    id: string;
    name: string;
    companyName: string | null;
    email: string | null;
    addressLines: string | null;
    notes: string | null;
  };
  canWrite: boolean;
}) {
  const router = useRouter();
  const { confirm } = useAlert();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canWrite && mode === "create") {
    return <p className="text-sm text-muted">You do not have permission to create clients.</p>;
  }

  function onSubmit(formData: FormData) {
    setError(null);
    startTransition(async () => {
      const result =
        mode === "create"
          ? await createClient(formData)
          : await updateClient(client!.id, formData);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      if (mode === "edit") {
        router.push(`/clients/${client!.id}`);
      } else {
        router.push(result.id ? `/clients/${result.id}` : "/clients");
      }
      router.refresh();
    });
  }

  async function onDelete() {
    if (!client) return;
    const ok = await confirm({
      title: "Delete client",
      message: "Delete this client?",
      confirmLabel: "Delete",
      variant: "destructive",
    });
    if (!ok) return;
    setError(null);
    startTransition(async () => {
      const result = await deleteClient(client.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.push("/clients");
      router.refresh();
    });
  }

  return (
    <form action={onSubmit} className="mx-auto max-w-xl space-y-4">
      <div>
        <Label htmlFor="companyName">Company name</Label>
        <Input
          id="companyName"
          name="companyName"
          defaultValue={client?.companyName ?? ""}
          disabled={!canWrite || pending}
        />
      </div>
      <div>
        <Label htmlFor="name">Contact name</Label>
        <Input
          id="name"
          name="name"
          required
          defaultValue={client?.name ?? ""}
          disabled={!canWrite || pending}
        />
      </div>
      <div>
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          defaultValue={client?.email ?? ""}
          disabled={!canWrite || pending}
        />
      </div>
      <div>
        <Label htmlFor="addressLines">Address</Label>
        <Textarea
          id="addressLines"
          name="addressLines"
          rows={3}
          defaultValue={client?.addressLines ?? ""}
          disabled={!canWrite || pending}
        />
      </div>
      <div>
        <Label htmlFor="notes">Notes</Label>
        <Textarea
          id="notes"
          name="notes"
          rows={3}
          defaultValue={client?.notes ?? ""}
          disabled={!canWrite || pending}
        />
      </div>
      <FieldError>{error}</FieldError>
      {canWrite && (
        <div className="flex items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Saving…" : mode === "create" ? "Create client" : "Save changes"}
          </Button>
          {mode === "edit" && (
            <Button
              type="button"
              variant="ghost"
              disabled={pending}
              onClick={onDelete}
            >
              Delete
            </Button>
          )}
        </div>
      )}
    </form>
  );
}
