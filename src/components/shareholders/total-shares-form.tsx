"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button } from "@/components/ui/button";
import { FieldError, Input, Label } from "@/components/ui/form";
import { updateTotalShares } from "@/actions/shareholders";

export function TotalSharesForm({
  totalShares,
  activeShareSum,
  canWrite,
}: {
  totalShares: number | null;
  activeShareSum: number;
  canWrite: boolean;
}) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  if (!canWrite) {
    return (
      <p className="text-sm text-muted">
        Total shares:{" "}
        <span className="font-medium text-foreground">
          {totalShares ?? "not set"}
        </span>
        {totalShares != null && activeShareSum !== totalShares && (
          <span className="text-destructive">
            {" "}
            (active sum {activeShareSum} does not match)
          </span>
        )}
      </p>
    );
  }

  return (
    <form
      className="flex flex-wrap items-end gap-3"
      action={(formData) => {
        setError(null);
        startTransition(async () => {
          const result = await updateTotalShares(formData);
          if (!result.ok) setError(result.error);
          else router.refresh();
        });
      }}
    >
      <div>
        <Label htmlFor="totalShares">Total issued shares</Label>
        <Input
          id="totalShares"
          name="totalShares"
          type="number"
          min={1}
          step={1}
          defaultValue={totalShares ?? (activeShareSum > 0 ? String(activeShareSum) : "")}
          placeholder="e.g. 100"
          disabled={pending}
        />
        <p className="mt-1 text-xs text-muted">
          Active sum: {activeShareSum}
          {totalShares != null && activeShareSum === totalShares
            ? " — balanced"
            : totalShares != null
              ? " — does not match"
              : " — set total to lock the register"}
        </p>
      </div>
      <Button type="submit" variant="secondary" disabled={pending}>
        Save total
      </Button>
      <FieldError>{error}</FieldError>
    </form>
  );
}
