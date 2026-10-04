import {
  builtInChannelDefaults,
  type NotificationChannels,
  type NotificationEventType,
  NOTIFICATION_EVENT_TYPES,
} from "./types";

export type EventChannelMatrix = Record<string, NotificationChannels>;

function isChannels(value: unknown): value is NotificationChannels {
  if (!value || typeof value !== "object") return false;
  const v = value as Record<string, unknown>;
  return (
    typeof v.inApp === "boolean" &&
    typeof v.email === "boolean" &&
    typeof v.push === "boolean"
  );
}

/** Parse a sparse/partial matrix from JSON storage. */
export function parseChannelMatrix(raw: unknown): EventChannelMatrix {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: EventChannelMatrix = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!isChannels(value)) continue;
    out[key] = {
      inApp: value.inApp,
      email: value.email,
      push: value.push,
    };
  }
  return out;
}

/**
 * Merge built-in defaults ← company defaults ← user overrides.
 * Sparse overrides only replace channels present on that event.
 */
export function mergeChannelPrefs(
  companyDefaults: EventChannelMatrix,
  userOverrides: EventChannelMatrix,
): EventChannelMatrix {
  const builtIn = builtInChannelDefaults();
  const out: EventChannelMatrix = {};
  for (const type of NOTIFICATION_EVENT_TYPES) {
    out[type] = {
      ...builtIn[type],
      ...(companyDefaults[type] ?? {}),
      ...(userOverrides[type] ?? {}),
    };
  }
  for (const source of [companyDefaults, userOverrides]) {
    for (const [type, channels] of Object.entries(source)) {
      if (out[type]) continue;
      out[type] = { ...channels };
    }
  }
  return out;
}

export function resolveChannelsForEvent(
  matrix: EventChannelMatrix,
  type: string,
): NotificationChannels {
  const builtIn = builtInChannelDefaults();
  const fallback =
    builtIn[type as NotificationEventType] ?? {
      inApp: true,
      email: false,
      push: false,
    };
  return { ...fallback, ...(matrix[type] ?? {}) };
}
