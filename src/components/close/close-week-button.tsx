"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { closeWeek } from "@/actions/close";
import { Button } from "@/components/ui/button";
import { useAlert } from "@/components/ui/alert-dialog";

export function CloseWeekButton({ outstanding }: { outstanding: number }) {
  const router = useRouter();
  const { confirm, alert } = useAlert();
  const [pending, startTransition] = useTransition();
  return (
    <Button
      type="button"
      disabled={pending}
      onClick={async () => {
        if (outstanding > 0) {
          const ok = await confirm({
            title: "Close with items open?",
            message: `${outstanding} item${outstanding === 1 ? " is" : "s are"} still open. They'll be recorded with this week's close so your accountant can see them.`,
            confirmLabel: "Close the week",
          });
          if (!ok) return;
        }
        startTransition(async () => {
          const result = await closeWeek();
          if (!result.ok) {
            await alert({ title: "Couldn't close the week", message: result.error });
            return;
          }
          router.refresh();
        });
      }}
    >
      {pending ? "Closing…" : "Close the week"}
    </Button>
  );
}
