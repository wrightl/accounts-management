/**
 * Content widths, picked by what a page is for rather than per page.
 * Tables, dashboards and charts use the full width and need no class.
 */
export const PAGE_WIDTH = {
  /** Short field forms and prose. Kept narrow so lines stay readable. */
  reading: "max-w-2xl",
  /** Forms with a line-item table (invoices, quotes, orders). */
  editor: "max-w-5xl",
} as const;
