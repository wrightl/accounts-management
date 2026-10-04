import { describe, expect, it } from "vitest";
import {
  mergeChannelPrefs,
  parseChannelMatrix,
  resolveChannelsForEvent,
} from "@/lib/notifications/prefs-merge";
import {
  builtInChannelDefaults,
  NOTIFICATION_EVENT_TYPES,
} from "@/lib/notifications/types";
import { formatNotifyDate, todayKey } from "@/lib/notifications/queries";

describe("parseChannelMatrix", () => {
  it("ignores invalid entries", () => {
    expect(
      parseChannelMatrix({
        "quote.accepted": { inApp: true, email: false, push: true },
        bad: { inApp: "yes" },
        alsoBad: null,
      }),
    ).toEqual({
      "quote.accepted": { inApp: true, email: false, push: true },
    });
  });
});

describe("mergeChannelPrefs", () => {
  it("applies company then user overrides on top of built-ins", () => {
    const merged = mergeChannelPrefs(
      {
        "quote.accepted": { inApp: true, email: true, push: false },
      },
      {
        "quote.accepted": { inApp: true, email: false, push: true },
      },
    );
    expect(merged["quote.accepted"]).toEqual({
      inApp: true,
      email: false,
      push: true,
    });
  });

  it("covers every catalog event", () => {
    const merged = mergeChannelPrefs({}, {});
    for (const type of NOTIFICATION_EVENT_TYPES) {
      expect(merged[type]).toEqual(builtInChannelDefaults()[type]);
    }
  });
});

describe("resolveChannelsForEvent", () => {
  it("falls back to built-in for unknown types", () => {
    expect(resolveChannelsForEvent({}, "custom.event")).toEqual({
      inApp: true,
      email: false,
      push: false,
    });
  });
});

describe("todayKey / formatNotifyDate", () => {
  it("formats ISO dates", () => {
    expect(todayKey(new Date("2026-10-02T15:00:00Z"))).toBe("2026-10-02");
    expect(formatNotifyDate("2026-10-02")).toMatch(/2/);
  });
});
