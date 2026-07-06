"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";

type Feedback = {
  tone: "error" | "success";
  text: string;
};

export function HackathonCheckinForm({ hackathonId }: { hackathonId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState("");
  const [pending, setPending] = useState(false);
  const [feedback, setFeedback] = useState<Feedback | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!code.trim() || pending) {
      return;
    }

    setPending(true);
    setFeedback(null);

    try {
      const response = await fetch(`/api/hackathons/${hackathonId}/check-in`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: code.trim() }),
      });
      const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;

      if (response.ok) {
        setCode("");
        setOpen(false);
        setFeedback({ tone: "success", text: "Attendance verified by the organizer." });
        router.refresh();
      } else {
        setFeedback({
          tone: "error",
          text: typeof payload?.error === "string" ? payload.error : "That code couldn't be redeemed.",
        });
      }
    } catch {
      setFeedback({ tone: "error", text: "Something went wrong. Try again." });
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="mt-3">
      {open ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={handleSubmit}>
          <input
            aria-label="Check-in code"
            autoFocus
            className="h-9 w-36 rounded-lg border border-black/15 bg-white px-3 font-mono text-sm uppercase tracking-widest text-black outline-none focus:border-[#660000]"
            maxLength={20}
            onChange={(event) => setCode(event.target.value.toUpperCase())}
            placeholder="CODE"
            value={code}
          />
          <button
            className="h-9 rounded-lg bg-[#660000] px-3 text-sm font-semibold text-white transition hover:bg-[#4d0000] disabled:opacity-50"
            disabled={pending || !code.trim()}
            type="submit"
          >
            {pending ? "Checking…" : "Check in"}
          </button>
          <button
            className="h-9 px-2 text-sm text-[#706F6B] hover:text-black"
            onClick={() => {
              setOpen(false);
              setFeedback(null);
            }}
            type="button"
          >
            Cancel
          </button>
        </form>
      ) : (
        <button
          className="text-sm font-semibold text-[#660000] underline-offset-2 hover:underline"
          onClick={() => setOpen(true)}
          type="button"
        >
          Have a check-in code?
        </button>
      )}
      {feedback ? (
        <p className={`mt-1 text-sm ${feedback.tone === "error" ? "text-[#B3261E]" : "text-[#18785C]"}`}>{feedback.text}</p>
      ) : null}
    </div>
  );
}
