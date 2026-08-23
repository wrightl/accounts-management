import { describe, expect, it } from "vitest";
import {
  appendMileageDescription,
  mileageAmountPence,
} from "@/lib/expenses/mileage";

describe("mileageAmountPence", () => {
  it("multiplies miles by rate and rounds to whole pence", () => {
    expect(mileageAmountPence(84, 45)).toBe(3780);
    expect(mileageAmountPence(1, 45)).toBe(45);
    expect(mileageAmountPence(10.5, 45)).toBe(473);
  });

  it("rejects non-positive values", () => {
    expect(() => mileageAmountPence(0, 45)).toThrow();
    expect(() => mileageAmountPence(10, 0)).toThrow();
  });
});

describe("appendMileageDescription", () => {
  it("appends mileage suffix once", () => {
    const base = "Client visit";
    const once = appendMileageDescription(base, 84, 45);
    expect(once).toBe("Client visit (84 miles @ 45p/mi)");
    expect(appendMileageDescription(once, 84, 45)).toBe(once);
  });
});
