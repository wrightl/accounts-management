/** Portal overlay menus into an open dialog so they stay in the top layer. */
export function overlayPortalTarget(anchor: HTMLElement | null): HTMLElement | null {
  if (typeof document === "undefined") return null;
  const dialog = anchor?.closest("dialog");
  if (dialog?.open) return dialog;
  return document.body;
}
