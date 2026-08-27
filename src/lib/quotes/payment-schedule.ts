import { z } from "zod";

export type PaymentMilestoneInput = {
  label: string;
  amountPence?: number | null;
  percentBasisPoints?: number | null;
  dueDate?: string | null;
  dueInDays?: number | null;
  position: number;
};

export type PaymentMilestoneDraft = {
  key: string;
  label: string;
  amountMode: "amount" | "percent";
  amountPounds: string;
  percent: string;
  dueMode: "date" | "days";
  dueDate: string;
  dueInDays: string;
};

const milestoneSchema = z.object({
  label: z.string().trim().min(1, "Milestone label is required"),
  amountPence: z.number().int().positive().optional().nullable(),
  percentBasisPoints: z.number().int().positive().max(10000).optional().nullable(),
  dueDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/)
    .optional()
    .nullable(),
  dueInDays: z.number().int().positive().optional().nullable(),
  position: z.number().int().min(0),
});

export function parseMilestonesJson(raw: string): PaymentMilestoneInput[] {
  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed
      .map((row, index) => {
        const item = row as Record<string, unknown>;
        const amountPence =
          item.amountPence != null ? Number(item.amountPence) : null;
        const percentBasisPoints =
          item.percentBasisPoints != null ? Number(item.percentBasisPoints) : null;
        const dueInDays = item.dueInDays != null ? Number(item.dueInDays) : null;
        return {
          label: String(item.label ?? "").trim(),
          amountPence: Number.isFinite(amountPence) ? amountPence : null,
          percentBasisPoints: Number.isFinite(percentBasisPoints)
            ? percentBasisPoints
            : null,
          dueDate: item.dueDate ? String(item.dueDate) : null,
          dueInDays: Number.isFinite(dueInDays) ? dueInDays : null,
          position: Number(item.position ?? index),
        };
      })
      .filter((m) => m.label.length > 0);
  } catch {
    return [];
  }
}

export function validateMilestones(
  milestones: PaymentMilestoneInput[],
  grossPence: number,
): string | null {
  if (milestones.length === 0) return null;

  for (const [i, m] of milestones.entries()) {
    const parsed = milestoneSchema.safeParse(m);
    if (!parsed.success) {
      return parsed.error.issues[0]?.message ?? `Invalid milestone ${i + 1}`;
    }
    const hasAmount = m.amountPence != null;
    const hasPercent = m.percentBasisPoints != null;
    if (hasAmount === hasPercent) {
      return `Milestone ${i + 1}: set either an amount or a percentage`;
    }
    const hasDate = m.dueDate != null;
    const hasDays = m.dueInDays != null;
    if (hasDate === hasDays) {
      return `Milestone ${i + 1}: set either a due date or days offset`;
    }
  }

  const allAmounts = milestones.every((m) => m.amountPence != null);
  if (allAmounts) {
    const sum = milestones.reduce((acc, m) => acc + (m.amountPence ?? 0), 0);
    if (sum !== grossPence) {
      return "Milestone amounts must sum to the quote total";
    }
  }

  const allPercents = milestones.every((m) => m.percentBasisPoints != null);
  if (allPercents) {
    const sum = milestones.reduce(
      (acc, m) => acc + (m.percentBasisPoints ?? 0),
      0,
    );
    if (sum !== 10000) {
      return "Milestone percentages must sum to 100%";
    }
  }

  return null;
}

export function netDaysPresetMilestone(
  netDays: 30 | 60 | 90,
  grossPence: number,
): PaymentMilestoneInput {
  return {
    label: `Net ${netDays}`,
    amountPence: grossPence,
    percentBasisPoints: null,
    dueDate: null,
    dueInDays: netDays,
    position: 0,
  };
}

export function newMilestoneDraft(): PaymentMilestoneDraft {
  return {
    key: crypto.randomUUID(),
    label: "",
    amountMode: "amount",
    amountPounds: "",
    percent: "",
    dueMode: "days",
    dueDate: "",
    dueInDays: "30",
  };
}

export function draftToMilestoneInput(
  draft: PaymentMilestoneDraft,
  position: number,
): PaymentMilestoneInput | null {
  const label = draft.label.trim();
  if (!label) return null;

  if (draft.amountMode === "percent") {
    const pct = Number(draft.percent);
    if (!Number.isFinite(pct) || pct <= 0) return null;
    return {
      label,
      amountPence: null,
      percentBasisPoints: Math.round(pct * 100),
      dueDate: draft.dueMode === "date" && draft.dueDate ? draft.dueDate : null,
      dueInDays:
        draft.dueMode === "days" && draft.dueInDays
          ? Number(draft.dueInDays)
          : null,
      position,
    };
  }

  const pounds = Number(draft.amountPounds);
  if (!Number.isFinite(pounds) || pounds <= 0) return null;
  return {
    label,
    amountPence: Math.round(pounds * 100),
    percentBasisPoints: null,
    dueDate: draft.dueMode === "date" && draft.dueDate ? draft.dueDate : null,
    dueInDays:
      draft.dueMode === "days" && draft.dueInDays ? Number(draft.dueInDays) : null,
    position,
  };
}
