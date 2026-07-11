"use client";

import { useState } from "react";
import { Send } from "lucide-react";

import { reminderTypeLabels } from "@/lib/hackathons/reminder-labels";
import { selectableReminderTypes, type SelectableReminderType } from "@/lib/hackathons/reminder-plan";

type HackathonOption = {
  id: string;
  name: string;
  startsAt: string | null;
};

type Status = { kind: "idle" } | { kind: "sending" } | { kind: "success"; message: string } | { kind: "error"; message: string };

function formatStartLabel(startsAt: string | null) {
  if (!startsAt) {
    return "date TBA";
  }

  return new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric", timeZone: "UTC" }).format(
    new Date(startsAt)
  );
}

export function EmailTestForm({ hackathons }: { hackathons: HackathonOption[] }) {
  const [email, setEmail] = useState("");
  const [hackathonId, setHackathonId] = useState(hackathons[0]?.id ?? "");
  const [type, setType] = useState<SelectableReminderType>(selectableReminderTypes[0]);
  const [status, setStatus] = useState<Status>({ kind: "idle" });

  const disabled = status.kind === "sending" || !hackathons.length;

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (disabled) {
      return;
    }

    setStatus({ kind: "sending" });

    try {
      const response = await fetch("/api/admin/email-test", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, hackathonId, type }),
      });

      const payload = (await response.json().catch(() => null)) as
        | { data?: { sentTo: string }; error?: unknown }
        | null;

      if (!response.ok) {
        const message =
          typeof payload?.error === "string" ? payload.error : "Could not send the test email. Check the logs.";
        setStatus({ kind: "error", message });
        return;
      }

      setStatus({ kind: "success", message: `Sent to ${payload?.data?.sentTo ?? email}. Check the inbox.` });
    } catch {
      setStatus({ kind: "error", message: "Network error while sending the test email." });
    }
  }

  if (!hackathons.length) {
    return <p className="text-sm text-navy/55 dark:text-wheat/55">No hackathons available to test against yet.</p>;
  }

  return (
    <form className="grid max-w-2xl gap-5" onSubmit={handleSubmit}>
      <label className="grid gap-2">
        <span className="text-sm font-semibold text-navy dark:text-wheat">Send test to</span>
        <input
          className="min-h-11 rounded-md border border-navy/15 dark:border-white/15 bg-white dark:bg-white/[0.06] px-3 text-sm text-navy dark:text-wheat outline-none focus:border-cabernet"
          onChange={(event) => setEmail(event.target.value)}
          placeholder="you@example.com"
          required
          type="email"
          value={email}
        />
        <span className="text-xs text-navy/55 dark:text-wheat/55">
          The reminder is sent here instead of to hackers, so you can preview the real thing.
        </span>
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-semibold text-navy dark:text-wheat">Hackathon</span>
        <select
          className="min-h-11 rounded-md border border-navy/15 dark:border-white/15 bg-white dark:bg-white/[0.06] px-3 text-sm text-navy dark:text-wheat outline-none focus:border-cabernet"
          onChange={(event) => setHackathonId(event.target.value)}
          value={hackathonId}
        >
          {hackathons.map((hackathon) => (
            <option key={hackathon.id} value={hackathon.id}>
              {hackathon.name} ({formatStartLabel(hackathon.startsAt)})
            </option>
          ))}
        </select>
      </label>

      <label className="grid gap-2">
        <span className="text-sm font-semibold text-navy dark:text-wheat">Reminder type</span>
        <select
          className="min-h-11 rounded-md border border-navy/15 dark:border-white/15 bg-white dark:bg-white/[0.06] px-3 text-sm text-navy dark:text-wheat outline-none focus:border-cabernet"
          onChange={(event) => setType(event.target.value as SelectableReminderType)}
          value={type}
        >
          {selectableReminderTypes.map((reminderType) => (
            <option key={reminderType} value={reminderType}>
              {reminderTypeLabels[reminderType] ?? reminderType}
            </option>
          ))}
        </select>
      </label>

      <div className="flex items-center gap-3">
        <button
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-cabernet px-4 text-sm font-semibold text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white transition-opacity hover:opacity-90 disabled:opacity-50"
          disabled={disabled}
          type="submit"
        >
          <Send aria-hidden="true" className="size-4" />
          {status.kind === "sending" ? "Sending…" : "Send test email"}
        </button>

        {status.kind === "success" ? <span className="text-sm text-[#166534]">{status.message}</span> : null}
        {status.kind === "error" ? <span className="text-sm text-[#B91C1C]">{status.message}</span> : null}
      </div>
    </form>
  );
}
