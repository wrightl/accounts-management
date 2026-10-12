"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { markDeadlineDone, undoDeadlineDone } from "@/actions/deadlines";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast-store";

export function DeadlineDoneButton({
  kind,
  dueDate,
  done,
  label,
}: {
  kind: string;
  dueDate: string;
  done: boolean;
  /** The deadline's name, for the accessible label. */
  label: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <Button
      type="button"
      variant={done ? "ghost" : "secondary"}
      disabled={pending}
      aria-label={done ? `Undo: ${label} done` : `Mark ${label} as done`}
      onClick={() =>
        startTransition(async () => {
          const result = done
            ? await undoDeadlineDone(kind, dueDate)
            : await markDeadlineDone(kind, dueDate);
          if (!result.ok) {
            toast(result.error);
            return;
          }
          router.refresh();
        })
      }
    >
      {done ? "Undo" : "Mark done"}
    </Button>
  );
}
