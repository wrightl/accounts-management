"use client";

import { useEffect } from "react";
import {
  UI_PREFS_COOKIE,
  parseUiPrefs,
  serializeUiPrefsCookie,
  uiPrefsDocumentCookie,
  uiPrefsHtmlAttributes,
  type UiPrefs,
} from "@/lib/ui-prefs";

const UI_ATTR_KEYS = [
  "data-ui-motion",
  "data-ui-text",
  "data-ui-contrast",
  "data-ui-font",
  "data-ui-toasts",
] as const;

function applyHtmlAttrs(prefs: UiPrefs) {
  const root = document.documentElement;
  const next = uiPrefsHtmlAttributes(prefs);
  for (const key of UI_ATTR_KEYS) {
    if (next[key]) root.setAttribute(key, next[key]);
    else root.removeAttribute(key);
  }
}

/** Writes display prefs to a cookie and mirrors them onto `<html data-ui-*>`. */
export function SyncUiPrefsCookie({ prefs }: { prefs: UiPrefs }) {
  const prefsKey = serializeUiPrefsCookie(prefs);
  useEffect(() => {
    const nextPrefs = parseUiPrefs(JSON.parse(prefsKey));
    applyHtmlAttrs(nextPrefs);
    const existing = document.cookie
      .split("; ")
      .find((row) => row.startsWith(`${UI_PREFS_COOKIE}=`));
    const decodedExisting = existing
      ? (() => {
          try {
            return decodeURIComponent(existing.slice(UI_PREFS_COOKIE.length + 1));
          } catch {
            return existing.slice(UI_PREFS_COOKIE.length + 1);
          }
        })()
      : null;
    if (decodedExisting === prefsKey) return;
    document.cookie = uiPrefsDocumentCookie(nextPrefs);
  }, [prefsKey]);

  return null;
}
