import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  dismissToast,
  getToastSnapshot,
  resetToasts,
  toast,
} from "@/components/ui/toast-store";

describe("toast store", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    resetToasts();
  });

  afterEach(() => {
    resetToasts();
    vi.useRealTimers();
  });

  it("adds a toast and auto-dismisses it", () => {
    toast("Settings saved.");
    expect(getToastSnapshot()).toEqual([
      { id: expect.any(Number), message: "Settings saved." },
    ]);

    vi.advanceTimersByTime(4000);
    expect(getToastSnapshot()).toEqual([]);
  });

  it("can dismiss a toast early", () => {
    toast("Saved.");
    const id = getToastSnapshot()[0]!.id;
    dismissToast(id);
    expect(getToastSnapshot()).toEqual([]);
  });
});
