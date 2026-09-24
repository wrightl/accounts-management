import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  DEFAULT_UI_PREFS,
  parseUiPrefs,
  parseUiPrefsCookie,
  parseUiPrefsInput,
  serializeUiPrefsCookie,
  uiPrefsHtmlAttributes,
} from "@/lib/ui-prefs";
import {
  dismissToast,
  resetToasts,
  toast,
  toastHasTimer,
  getToastSnapshot,
} from "@/components/ui/toast-store";

describe("ui prefs", () => {
  it("fills defaults for empty objects", () => {
    expect(parseUiPrefs({})).toEqual(DEFAULT_UI_PREFS);
    expect(parseUiPrefs(null)).toEqual(DEFAULT_UI_PREFS);
  });

  it("round-trips through cookie serialize/parse", () => {
    const prefs = parseUiPrefs({
      motion: "reduce",
      text: "large",
      contrast: "high",
      font: "readable",
      toasts: "stay",
    });
    const raw = serializeUiPrefsCookie(prefs);
    expect(parseUiPrefsCookie(raw)).toEqual(prefs);
    expect(parseUiPrefsCookie(encodeURIComponent(raw))).toEqual(prefs);
  });

  it("emits html attributes only for non-defaults", () => {
    expect(uiPrefsHtmlAttributes(DEFAULT_UI_PREFS)).toEqual({});
    expect(
      uiPrefsHtmlAttributes(
        parseUiPrefs({ motion: "reduce", toasts: "stay" }),
      ),
    ).toEqual({
      "data-ui-motion": "reduce",
      "data-ui-toasts": "stay",
    });
  });

  it("rejects invalid form values", () => {
    const result = parseUiPrefsInput({
      motion: "nope",
      text: "default",
      contrast: "default",
      font: "default",
      toasts: "auto",
    });
    expect(result.ok).toBe(false);
  });
});

describe("toast store", () => {
  beforeEach(() => {
    resetToasts();
    vi.useFakeTimers();
    const attrs = new Map<string, string>();
    vi.stubGlobal("document", {
      documentElement: {
        getAttribute: (name: string) => attrs.get(name) ?? null,
        setAttribute: (name: string, value: string) => {
          attrs.set(name, value);
        },
        removeAttribute: (name: string) => {
          attrs.delete(name);
        },
      },
    });
    vi.stubGlobal("window", {
      matchMedia: () => ({ matches: false }),
    });
  });

  afterEach(() => {
    resetToasts();
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("auto-dismisses after a few seconds by default", () => {
    toast("Saved");
    const id = getToastSnapshot()[0]?.id;
    expect(id).toBeDefined();
    expect(toastHasTimer(id!)).toBe(true);
    vi.advanceTimersByTime(4000);
    expect(getToastSnapshot()).toEqual([]);
  });

  it("does not auto-dismiss when toasts stay", () => {
    document.documentElement.setAttribute("data-ui-toasts", "stay");
    toast("Saved");
    const id = getToastSnapshot()[0]?.id;
    expect(id).toBeDefined();
    expect(toastHasTimer(id!)).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(getToastSnapshot()).toHaveLength(1);
    dismissToast(id!);
    expect(getToastSnapshot()).toEqual([]);
  });

  it("does not auto-dismiss when motion is reduced", () => {
    document.documentElement.setAttribute("data-ui-motion", "reduce");
    toast("Saved");
    const id = getToastSnapshot()[0]?.id;
    expect(toastHasTimer(id!)).toBe(false);
    vi.advanceTimersByTime(10_000);
    expect(getToastSnapshot()).toHaveLength(1);
  });
});
