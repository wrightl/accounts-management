"use client";

import { useState, useTransition } from "react";
import { toast } from "@/components/ui/toast";
import { saveHidePushDetailsAction } from "@/actions/notifications";

/** Hide what push alerts say, for a phone or computer other people can see. */
export function LockScreenPrivacy({ initial }: { initial: boolean }) {
  const [hide, setHide] = useState(initial);
  const [pending, startTransition] = useTransition();

  function onChange(next: boolean) {
    setHide(next);
    startTransition(async () => {
      const result = await saveHidePushDetailsAction(next);
      if (!result.ok) {
        setHide(!next);
        toast(result.error ?? "Could not save");
        return;
      }
      toast(next ? "Push alerts will hide their details" : "Push alerts will show their details");
    });
  }

  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <label className="flex items-start gap-3">
        <input
          type="checkbox"
          checked={hide}
          disabled={pending}
          onChange={(e) => onChange(e.target.checked)}
          className="mt-0.5 h-4 w-4 accent-navy"
        />
        <span>
          <span className="block text-sm font-medium">Hide details on the lock screen</span>
          <span className="mt-1 block text-xs text-muted">
            Push alerts just say &ldquo;New notification in Alfa&rdquo;, without amounts or
            client names. Open the app or inbox to read them.
          </span>
        </span>
      </label>
    </div>
  );
}
