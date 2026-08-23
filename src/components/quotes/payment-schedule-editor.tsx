"use client";

import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input, Label, Select } from "@/components/ui/form";
import {
  draftToMilestoneInput,
  newMilestoneDraft,
  type PaymentMilestoneDraft,
} from "@/lib/quotes/payment-schedule";

function milestoneFromDb(row: {
  label: string;
  amountPence: number | null;
  percentBasisPoints: number | null;
  dueDate: string | null;
  dueInDays: number | null;
}): PaymentMilestoneDraft {
  return {
    key: crypto.randomUUID(),
    label: row.label,
    amountMode: row.percentBasisPoints != null ? "percent" : "amount",
    amountPounds:
      row.amountPence != null ? (row.amountPence / 100).toFixed(2) : "",
    percent:
      row.percentBasisPoints != null
        ? String(row.percentBasisPoints / 100)
        : "",
    dueMode: row.dueDate != null ? "date" : "days",
    dueDate: row.dueDate ?? "",
    dueInDays: row.dueInDays != null ? String(row.dueInDays) : "30",
  };
}

export function PaymentScheduleEditor({
  grossPence,
  initialMilestones,
  disabled,
}: {
  grossPence: number;
  initialMilestones?: Array<{
    label: string;
    amountPence: number | null;
    percentBasisPoints: number | null;
    dueDate: string | null;
    dueInDays: number | null;
  }>;
  disabled?: boolean;
}) {
  const [milestones, setMilestones] = useState<PaymentMilestoneDraft[]>(
    initialMilestones?.length
      ? initialMilestones.map(milestoneFromDb)
      : [],
  );

  const serialized = milestones
    .map((draft, index) => draftToMilestoneInput(draft, index, grossPence))
    .filter(Boolean);

  return (
    <div className="space-y-3 rounded-xl border border-border p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <h3 className="font-medium">Payment schedule</h3>
          <p className="text-xs text-muted">Optional — copied to the order when accepted.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {[30, 60, 90].map((days) => (
            <Button
              key={days}
              type="button"
              variant="secondary"
              disabled={disabled}
              onClick={() =>
                setMilestones([
                  {
                    key: crypto.randomUUID(),
                    label: `Net ${days}`,
                    amountMode: "amount",
                    amountPounds: (grossPence / 100).toFixed(2),
                    percent: "",
                    dueMode: "days",
                    dueDate: "",
                    dueInDays: String(days),
                  },
                ])
              }
            >
              Net {days}
            </Button>
          ))}
        </div>
      </div>

      {milestones.map((milestone, index) => (
        <div
          key={milestone.key}
          className="grid gap-2 rounded-lg border border-border p-3 sm:grid-cols-2"
        >
          <div className="sm:col-span-2">
            <Label>Label</Label>
            <Input
              value={milestone.label}
              disabled={disabled}
              onChange={(e) =>
                setMilestones((prev) =>
                  prev.map((m, i) =>
                    i === index ? { ...m, label: e.target.value } : m,
                  ),
                )
              }
            />
          </div>
          <div>
            <Label>Amount type</Label>
            <Select
              value={milestone.amountMode}
              disabled={disabled}
              onChange={(e) =>
                setMilestones((prev) =>
                  prev.map((m, i) =>
                    i === index
                      ? { ...m, amountMode: e.target.value as "amount" | "percent" }
                      : m,
                  ),
                )
              }
            >
              <option value="amount">Fixed amount</option>
              <option value="percent">Percentage</option>
            </Select>
          </div>
          <div>
            <Label>{milestone.amountMode === "percent" ? "Percent" : "Amount £"}</Label>
            <Input
              value={
                milestone.amountMode === "percent"
                  ? milestone.percent
                  : milestone.amountPounds
              }
              disabled={disabled}
              onChange={(e) =>
                setMilestones((prev) =>
                  prev.map((m, i) =>
                    i === index
                      ? milestone.amountMode === "percent"
                        ? { ...m, percent: e.target.value }
                        : { ...m, amountPounds: e.target.value }
                      : m,
                  ),
                )
              }
            />
          </div>
          <div>
            <Label>Due type</Label>
            <Select
              value={milestone.dueMode}
              disabled={disabled}
              onChange={(e) =>
                setMilestones((prev) =>
                  prev.map((m, i) =>
                    i === index
                      ? { ...m, dueMode: e.target.value as "date" | "days" }
                      : m,
                  ),
                )
              }
            >
              <option value="days">Days from acceptance</option>
              <option value="date">Specific date</option>
            </Select>
          </div>
          <div>
            <Label>{milestone.dueMode === "date" ? "Due date" : "Due in days"}</Label>
            <Input
              type={milestone.dueMode === "date" ? "date" : "number"}
              min={milestone.dueMode === "days" ? 1 : undefined}
              value={milestone.dueMode === "date" ? milestone.dueDate : milestone.dueInDays}
              disabled={disabled}
              onChange={(e) =>
                setMilestones((prev) =>
                  prev.map((m, i) =>
                    i === index
                      ? milestone.dueMode === "date"
                        ? { ...m, dueDate: e.target.value }
                        : { ...m, dueInDays: e.target.value }
                      : m,
                  ),
                )
              }
            />
          </div>
          <div className="flex items-end sm:col-span-2">
            <Button
              type="button"
              variant="ghost"
              className="size-9 px-0"
              aria-label="Remove milestone"
              disabled={disabled}
              onClick={() =>
                setMilestones((prev) => prev.filter((_, i) => i !== index))
              }
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </div>
        </div>
      ))}

      <Button
        type="button"
        variant="secondary"
        disabled={disabled}
        onClick={() => setMilestones((prev) => [...prev, newMilestoneDraft()])}
      >
        <Plus className="h-4 w-4" /> Add milestone
      </Button>

      <input
        type="hidden"
        name="milestonesJson"
        value={JSON.stringify(serialized)}
        readOnly
      />
    </div>
  );
}
