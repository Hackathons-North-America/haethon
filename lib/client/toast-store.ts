/* A tiny module-level toast store. Toasts are raised from event handlers and
   background requests that may outlive the component that started them (a
   removed card, a closed dialog), so the store lives outside React and the
   <Toaster /> mounted in AppProviders subscribes to it. */

export type ToastTone = "neutral" | "error";

export type ToastAction = {
  label: string;
  onClick: () => void;
};

export type Toast = {
  id: number;
  message: string;
  /** Secondary line, e.g. the server's reason for a failure. */
  description?: string;
  tone: ToastTone;
  action?: ToastAction;
};

export type ShowToastInput = Omit<Toast, "id" | "tone"> & {
  tone?: ToastTone;
  /** Milliseconds before the toast hides itself. */
  duration?: number;
};

const MAX_VISIBLE = 3;
const DEFAULT_DURATION = { neutral: 5000, error: 8000 } as const;

let toasts: Toast[] = [];
let nextId = 1;
const timers = new Map<number, ReturnType<typeof setTimeout>>();
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) {
    listener();
  }
}

export function showToast({ duration, tone = "neutral", ...toast }: ShowToastInput) {
  const id = nextId++;
  const next = [...toasts, { ...toast, id, tone }];

  // Drop the oldest toasts beyond the visible cap.
  for (const dropped of next.slice(0, Math.max(0, next.length - MAX_VISIBLE))) {
    clearTimeout(timers.get(dropped.id));
    timers.delete(dropped.id);
  }

  toasts = next.slice(-MAX_VISIBLE);
  timers.set(id, setTimeout(() => dismissToast(id), duration ?? DEFAULT_DURATION[tone]));
  emit();

  return id;
}

export function dismissToast(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);

  if (!toasts.some((toast) => toast.id === id)) {
    return;
  }

  toasts = toasts.filter((toast) => toast.id !== id);
  emit();
}

export function subscribeToToasts(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getToasts() {
  return toasts;
}

const EMPTY: Toast[] = [];

export function getServerToasts() {
  return EMPTY;
}
