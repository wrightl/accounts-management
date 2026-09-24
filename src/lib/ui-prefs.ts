import { z } from "zod";
import { parseWithFieldErrors } from "@/lib/validation/field-errors";

export const UI_PREFS_COOKIE = "alfa_ui_prefs";

export const uiMotionSchema = z.enum(["system", "reduce", "full"]);
export const uiTextSchema = z.enum(["default", "large"]);
export const uiContrastSchema = z.enum(["default", "high"]);
export const uiFontSchema = z.enum(["default", "readable"]);
export const uiToastsSchema = z.enum(["auto", "stay"]);

export const uiPrefsSchema = z.object({
  motion: uiMotionSchema.default("system"),
  text: uiTextSchema.default("default"),
  contrast: uiContrastSchema.default("default"),
  font: uiFontSchema.default("default"),
  toasts: uiToastsSchema.default("auto"),
});

export type UiPrefs = z.infer<typeof uiPrefsSchema>;

export const DEFAULT_UI_PREFS: UiPrefs = {
  motion: "system",
  text: "default",
  contrast: "default",
  font: "default",
  toasts: "auto",
};

/** Normalise unknown JSON (DB / cookie) into a full prefs object. */
export function parseUiPrefs(raw: unknown): UiPrefs {
  const result = uiPrefsSchema.safeParse(raw ?? {});
  if (!result.success) return { ...DEFAULT_UI_PREFS };
  return result.data;
}

export function uiPrefsFromFormData(formData: FormData): Record<string, unknown> {
  return {
    motion: formData.get("motion") || "system",
    text: formData.get("text") || "default",
    contrast: formData.get("contrast") || "default",
    font: formData.get("font") || "default",
    toasts: formData.get("toasts") || "auto",
  };
}

export function parseUiPrefsInput(raw: unknown) {
  return parseWithFieldErrors(uiPrefsSchema, raw);
}

/** Attributes for `<html data-ui-*>`. Omits defaults that match CSS without attrs. */
export function uiPrefsHtmlAttributes(prefs: UiPrefs): Record<string, string> {
  const attrs: Record<string, string> = {};
  if (prefs.motion !== "system") attrs["data-ui-motion"] = prefs.motion;
  if (prefs.text !== "default") attrs["data-ui-text"] = prefs.text;
  if (prefs.contrast !== "default") attrs["data-ui-contrast"] = prefs.contrast;
  if (prefs.font !== "default") attrs["data-ui-font"] = prefs.font;
  if (prefs.toasts !== "auto") attrs["data-ui-toasts"] = prefs.toasts;
  return attrs;
}

/** Raw cookie value for Next.js `cookies().set` / `.get` (no encodeURIComponent). */
export function serializeUiPrefsCookie(prefs: UiPrefs): string {
  return JSON.stringify(prefs);
}

export function parseUiPrefsCookie(value: string | undefined | null): UiPrefs | null {
  if (!value) return null;
  try {
    const decoded = value.includes("%") ? decodeURIComponent(value) : value;
    return parseUiPrefs(JSON.parse(decoded));
  } catch {
    return null;
  }
}

/** `document.cookie` assignment (URI-encoded). */
export function uiPrefsDocumentCookie(prefs: UiPrefs): string {
  return `${UI_PREFS_COOKIE}=${encodeURIComponent(serializeUiPrefsCookie(prefs))}; Path=/; Max-Age=31536000; SameSite=Lax`;
}
