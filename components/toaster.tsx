"use client";

import { useSyncExternalStore } from "react";
import { AlertCircle, X } from "lucide-react";

import { dismissToast, getServerToasts, getToasts, subscribeToToasts } from "@/lib/client/toast-store";

/* Renders the toast stack raised through showToast(). Mounted once in
   AppProviders, above every dialog, so background-save failures and undo
   prompts show up wherever the user has moved on to. */
export function Toaster() {
  const toasts = useSyncExternalStore(subscribeToToasts, getToasts, getServerToasts);

  return (
    <div
      aria-label="Notifications"
      className="pointer-events-none fixed inset-x-0 bottom-0 z-[120] flex flex-col items-center gap-2 px-4 pb-4 sm:items-end sm:pr-6 sm:pb-6"
      role="region"
    >
      {toasts.map((toast) => {
        const error = toast.tone === "error";

        return (
          <div
            className={`pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border bg-surface px-4 py-3 text-sm text-ink shadow-[0_18px_50px_rgb(0_0_0/0.28)] ${
              error ? "border-danger/40" : "border-ink/10"
            }`}
            key={toast.id}
            role={error ? "alert" : "status"}
          >
            {error ? <AlertCircle aria-hidden="true" className="mt-0.5 size-4 shrink-0 text-danger" /> : null}
            <div className="min-w-0 flex-1">
              <p className="font-semibold leading-5">{toast.message}</p>
              {toast.description ? <p className="mt-0.5 leading-5 text-ink/60">{toast.description}</p> : null}
            </div>
            {toast.action ? (
              <button
                className="shrink-0 rounded-full px-2 py-0.5 font-semibold text-pine underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-pine"
                onClick={() => {
                  dismissToast(toast.id);
                  toast.action?.onClick();
                }}
                type="button"
              >
                {toast.action.label}
              </button>
            ) : null}
            <button
              aria-label="Dismiss notification"
              className="-mr-1 grid size-6 shrink-0 place-items-center rounded-full text-ink/45 hover:bg-ink/5 hover:text-ink"
              onClick={() => dismissToast(toast.id)}
              type="button"
            >
              <X aria-hidden="true" className="size-3.5" />
            </button>
          </div>
        );
      })}
    </div>
  );
}
