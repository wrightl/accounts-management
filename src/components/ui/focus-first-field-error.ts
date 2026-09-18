/**
 * After validation fails, scroll to and focus the first invalid control.
 * Call after React has painted `aria-invalid` (see {@link scheduleFocusFirstFieldError}).
 */
export function focusFirstFieldError(
  root: HTMLElement | null,
  fieldErrors?: Record<string, string>,
): void {
  if (!root || typeof document === "undefined") return;

  const invalid = root.querySelector<HTMLElement>(
    '[aria-invalid="true"]:not([disabled])',
  );
  if (invalid) {
    focusControl(invalid);
    return;
  }

  if (!fieldErrors) return;
  for (const key of Object.keys(fieldErrors)) {
    const el = resolveFieldControl(root, key);
    if (el) {
      focusControl(el);
      return;
    }
  }
}

/** Run focus after the next paint so aria-invalid / FieldError nodes exist. */
export function scheduleFocusFirstFieldError(
  root: HTMLElement | null,
  fieldErrors?: Record<string, string>,
): void {
  if (typeof window === "undefined") return;
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      focusFirstFieldError(root, fieldErrors);
    });
  });
}

function resolveFieldControl(
  root: HTMLElement,
  key: string,
): HTMLElement | null {
  // Nested paths like lines.0.quantity → try name/id suffixes
  const leaf = key.includes(".") ? (key.split(".").pop() ?? key) : key;
  const candidates = [
    root.querySelector<HTMLElement>(`#${cssEscape(key)}`),
    root.querySelector<HTMLElement>(`[name="${cssEscape(key)}"]`),
    root.querySelector<HTMLElement>(`#${cssEscape(leaf)}`),
    root.querySelector<HTMLElement>(`[name="${cssEscape(leaf)}"]`),
  ];
  for (const el of candidates) {
    if (el) return el;
  }

  // Line drafts: lines.0.quantity → data-line-index / name patterns
  const lineMatch = /^lines\.(\d+)\.(.+)$/.exec(key);
  if (lineMatch) {
    const [, index, field] = lineMatch;
    const byData = root.querySelector<HTMLElement>(
      `[data-line-index="${index}"][name="${cssEscape(field)}"], [data-line-index="${index}"] [name="${cssEscape(field)}"]`,
    );
    if (byData) return byData;
    const named = root.querySelectorAll<HTMLElement>(
      `[name="${cssEscape(field)}"]`,
    );
    const i = Number(index);
    if (Number.isFinite(i) && named[i]) return named[i] ?? null;
  }

  return null;
}

function focusControl(el: HTMLElement): void {
  el.scrollIntoView({ behavior: "smooth", block: "center" });
  if (typeof el.focus === "function") {
    try {
      el.focus({ preventScroll: true });
    } catch {
      el.focus();
    }
  }
}

function cssEscape(value: string): string {
  if (typeof CSS !== "undefined" && typeof CSS.escape === "function") {
    return CSS.escape(value);
  }
  return value.replace(/([^a-zA-Z0-9_-])/g, "\\$1");
}
