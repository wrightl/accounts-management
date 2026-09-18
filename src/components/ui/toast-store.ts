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

function emit() {
  for (const listener of listeners) listener();
}

export function dismissToast(id: number) {
  const timeoutId = timeouts.get(id);
  if (timeoutId != null) {
    clearTimeout(timeoutId);
    timeouts.delete(id);
  }
  const next = items.filter((item) => item.id !== id);
  if (next.length === items.length) return;
  items = next.length === 0 ? EMPTY_TOASTS : next;
  emit();
}

export function toast(message: string) {
  const id = nextId++;
  items = [...items, { id, message }];
  emit();
  timeouts.set(
    id,
    setTimeout(() => dismissToast(id), TOAST_MS),
  );
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
  items = EMPTY_TOASTS;
  emit();
}
