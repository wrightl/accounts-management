"use client";

import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog } from "@/components/ui/dialog";
import { CreateReimbursementForm } from "@/components/reimbursements/create-form";

export function CreateReimbursementButton({
  canWrite,
  founders,
  expenses,
  initialPayeeUserId,
  defaultOpen = false,
}: {
  canWrite: boolean;
  founders: { id: string; name: string | null; email: string }[];
  expenses: {
    id: string;
    description: string;
    amountPence: number;
    spentAt: string | null;
    paidByUserId: string | null;
  }[];
  initialPayeeUserId?: string;
  defaultOpen?: boolean;
}) {
  const [open, setOpen] = useState(defaultOpen);

  if (!canWrite || founders.length === 0) return null;

  return (
    <>
      <Button type="button" onClick={() => setOpen(true)}>
        New reimbursement run
      </Button>

      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        title="New reimbursement run"
        className="max-w-xl"
      >
        <CreateReimbursementForm
          founders={founders}
          expenses={expenses}
          initialPayeeUserId={initialPayeeUserId}
        />
      </Dialog>
    </>
  );
}
