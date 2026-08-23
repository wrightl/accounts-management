import { describe, expect, it } from "vitest";
import {
  netDaysPresetMilestone,
  validateMilestones,
} from "@/lib/quotes/payment-schedule";

describe("payment schedule", () => {
  it("validates amount milestones sum to gross", () => {
    const err = validateMilestones(
      [
        { label: "Deposit", amountPence: 50000, position: 0, dueInDays: 30 },
        { label: "Final", amountPence: 40000, position: 1, dueInDays: 60 },
      ],
      100000,
    );
    expect(err).toMatch(/sum to the quote total/);

    expect(
      validateMilestones(
        [
          { label: "Deposit", amountPence: 50000, position: 0, dueInDays: 30 },
          { label: "Final", amountPence: 50000, position: 1, dueInDays: 60 },
        ],
        100000,
      ),
    ).toBeNull();
  });

  it("creates net day preset milestone", () => {
    const milestone = netDaysPresetMilestone(30, 100000);
    expect(milestone.label).toBe("Net 30");
    expect(milestone.amountPence).toBe(100000);
    expect(milestone.dueInDays).toBe(30);
  });
});
