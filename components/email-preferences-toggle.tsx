"use client";

import { useState } from "react";

/**
 * Global email on/off switch shown in account settings. Mirrors the state a
 * user can also reach through the unsubscribe link in any email footer.
 */
export function EmailPreferencesToggle({ initialEnabled }: { initialEnabled: boolean }) {
  const [enabled, setEnabled] = useState(initialEnabled);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function toggle() {
    const next = !enabled;

    setIsSaving(true);
    setError(null);
    setEnabled(next);

    try {
      const response = await fetch("/api/email/preferences", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ enabled: next }),
      });

      if (!response.ok) {
        throw new Error("Failed to update email preferences.");
      }
    } catch {
      setEnabled(!next);
      setError("Could not save your email preference. Try again in a moment.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <div className="flex flex-wrap items-center justify-between gap-4 border border-ink/15 bg-paper p-5">
      <div className="min-w-0">
        <p className="text-sm font-semibold text-ink">Email notifications</p>
        <p className="mt-1 text-sm text-ink/55">
          {enabled
            ? "Reminders and submission updates are sent to your email."
            : "All Haethon emails are turned off, including your saved reminders."}
        </p>
        {error ? <p className="mt-1 text-sm font-semibold text-pine dark:text-moss">{error}</p> : null}
      </div>
      <button
        aria-pressed={enabled}
        className={`relative inline-flex h-7 w-12 shrink-0 items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine disabled:cursor-wait ${
          enabled ? "bg-pine" : "bg-ink/20"
        }`}
        disabled={isSaving}
        onClick={() => void toggle()}
        type="button"
      >
        <span className="sr-only">{enabled ? "Turn off all emails" : "Turn on emails"}</span>
        <span
          aria-hidden="true"
          className={`inline-block size-5 rounded-full bg-paper transition-transform ${
            enabled ? "translate-x-6" : "translate-x-1"
          }`}
        />
      </button>
    </div>
  );
}
