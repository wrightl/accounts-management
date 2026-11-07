/** Keep in step with the `labels_color_known` check constraint. */
export const LABEL_COLORS = [
  "slate",
  "red",
  "orange",
  "amber",
  "green",
  "teal",
  "blue",
  "indigo",
  "purple",
  "pink",
] as const;

export type LabelColor = (typeof LABEL_COLORS)[number];

export const DEFAULT_LABEL_COLOR: LabelColor = "blue";

/**
 * Full class names, so Tailwind can find them when it scans this file.
 * 900 text and an inset ring keep chips readable on tinted rows (pending
 * expenses are amber-100).
 */
export const LABEL_CHIP_CLASSES: Record<LabelColor, string> = {
  slate: "bg-slate-200 text-slate-900 ring-1 ring-inset ring-slate-700/30",
  red: "bg-red-100 text-red-900 ring-1 ring-inset ring-red-700/30",
  orange: "bg-orange-100 text-orange-900 ring-1 ring-inset ring-orange-700/30",
  amber: "bg-amber-100 text-amber-900 ring-1 ring-inset ring-amber-700/30",
  green: "bg-green-100 text-green-900 ring-1 ring-inset ring-green-700/30",
  teal: "bg-teal-100 text-teal-900 ring-1 ring-inset ring-teal-700/30",
  blue: "bg-blue-100 text-blue-900 ring-1 ring-inset ring-blue-700/30",
  indigo: "bg-indigo-100 text-indigo-900 ring-1 ring-inset ring-indigo-700/30",
  purple: "bg-purple-100 text-purple-900 ring-1 ring-inset ring-purple-700/30",
  pink: "bg-pink-100 text-pink-900 ring-1 ring-inset ring-pink-700/30",
};

export const LABEL_SWATCH_CLASSES: Record<LabelColor, string> = {
  slate: "bg-slate-500",
  red: "bg-red-500",
  orange: "bg-orange-500",
  amber: "bg-amber-500",
  green: "bg-green-500",
  teal: "bg-teal-500",
  blue: "bg-blue-500",
  indigo: "bg-indigo-500",
  purple: "bg-purple-500",
  pink: "bg-pink-500",
};

export function isLabelColor(value: string): value is LabelColor {
  return (LABEL_COLORS as readonly string[]).includes(value);
}
