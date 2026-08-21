"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError } from "@/components/ui/form";
import { markReimbursementPaid } from "@/actions/reimbursements";

export function ReimbursementActions({
  id,
  status,
  canWrite,
}: {
  id: string;
  status: string;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="flex flex-wrap gap-2">
      <a href={`/api/reimbursements/${id}/export`}>
        <Button type="button" variant="secondary">
          Export CSV
        </Button>
      </a>
      {canWrite && status === "pending" && (
        <Button
          type="button"
          disabled={pending}
          onClick={() => {
            if (!confirm("Mark this reimbursement as paid?")) return;
            setError(null);
            startTransition(async () => {
              const result = await markReimbursementPaid(id);
              if (!result.ok) setError(result.error);
              else router.refresh();
            });
          }}
        >
          {pending ? "Saving…" : "Mark as paid"}
        </Button>
      )}
      <FieldError>{error}</FieldError>
    </div>
  );
}
