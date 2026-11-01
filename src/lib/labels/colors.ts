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

/** Full class names, so Tailwind can find them when it scans this file. */
export const LABEL_CHIP_CLASSES: Record<LabelColor, string> = {
  slate: "bg-slate-200 text-slate-800 dark:bg-slate-700 dark:text-slate-100",
  red: "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-200",
  orange: "bg-orange-100 text-orange-800 dark:bg-orange-950 dark:text-orange-200",
  amber: "bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200",
  green: "bg-green-100 text-green-800 dark:bg-green-950 dark:text-green-200",
  teal: "bg-teal-100 text-teal-800 dark:bg-teal-950 dark:text-teal-200",
  blue: "bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200",
  indigo: "bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-200",
  purple: "bg-purple-100 text-purple-800 dark:bg-purple-950 dark:text-purple-200",
  pink: "bg-pink-100 text-pink-800 dark:bg-pink-950 dark:text-pink-200",
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
