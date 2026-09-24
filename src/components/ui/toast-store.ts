const TOAST_MS = 4000;
export const EMPTY_TOASTS: ToastItem[] = [];

export type ToastItem = {
  id: number;
  message: string;
};

let nextId = 1;
let items: ToastItem[] = EMPTY_TOASTS;
const listeners = new Set<() => void>();
const timeouts = new Map<number, ReturnType<typeof setTimeout>>();
const remainingMs = new Map<number, number>();
const startedAt = new Map<number, number>();

function emit() {
  for (const listener of listeners) listener();
}

function shouldAutoDismiss(): boolean {
  if (typeof document === "undefined") return true;
  const root = document.documentElement;
  if (root.getAttribute("data-ui-toasts") === "stay") return false;
  if (root.getAttribute("data-ui-motion") === "reduce") return false;
  if (
    root.getAttribute("data-ui-motion") !== "full" &&
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  ) {
    return false;
  }
  return true;
}

function clearTimer(id: number) {
  const timeoutId = timeouts.get(id);
  if (timeoutId != null) {
    clearTimeout(timeoutId);
    timeouts.delete(id);
  }
  startedAt.delete(id);
}

export function dismissToast(id: number) {
  clearTimer(id);
  remainingMs.delete(id);
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return;
  items = next.length === 0 ? EMPTY_TOASTS : next;
  emit();
}

function scheduleDismiss(id: number, ms: number) {
  clearTimer(id);
  remainingMs.set(id, ms);
  startedAt.set(id, Date.now());
  timeouts.set(
    id,
    setTimeout(() => dismissToast(id), ms),
  );
}

export function pauseToast(id: number) {
  const timeoutId = timeouts.get(id);
  if (timeoutId == null) return;
  const started = startedAt.get(id) ?? Date.now();
  const remaining = Math.max(0, (remainingMs.get(id) ?? TOAST_MS) - (Date.now() - started));
  clearTimer(id);
  remainingMs.set(id, remaining);
}

export function resumeToast(id: number) {
  if (!shouldAutoDismiss()) return;
  if (!items.some((item) => item.id === id)) return;
  if (timeouts.has(id)) return;
  const remaining = remainingMs.get(id) ?? TOAST_MS;
  if (remaining <= 0) {
    dismissToast(id);
    return;
  }
  scheduleDismiss(id, remaining);
}

export function toast(message: string) {
  const id = nextId++;
  items = [...items, { id, message }];
  emit();
  if (shouldAutoDismiss()) {
    scheduleDismiss(id, TOAST_MS);
  } else {
    remainingMs.set(id, TOAST_MS);
  }
}

export function subscribeToasts(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getToastSnapshot() {
  return items;
}

export function resetToasts() {
  for (const timeoutId of timeouts.values()) clearTimeout(timeoutId);
  timeouts.clear();
  remainingMs.clear();
  startedAt.clear();
  items = EMPTY_TOASTS;
  emit();
}

/** Test helper: whether a toast currently has an auto-dismiss timer. */
export function toastHasTimer(id: number): boolean {
  return timeouts.has(id);
}
