"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Pin, Trophy } from "lucide-react";

function handleUnauthenticated() {
  window.location.href = "/sign-in";
}

const buttonClassName =
  "inline-flex min-h-8 items-center gap-1.5 border px-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em] transition-colors disabled:cursor-wait disabled:opacity-60";

async function patchUserHackathon(userHackathonId: string, body: Record<string, unknown>) {
  const response = await fetch(`/api/user-hackathons/${encodeURIComponent(userHackathonId)}`, {
    body: JSON.stringify(body),
    headers: { "Content-Type": "application/json" },
    method: "PATCH",
  });

  if (response.status === 401) {
    handleUnauthenticated();
    return { ok: false as const, error: null };
  }

  const payload = (await response.json().catch(() => null)) as { error?: unknown } | null;

  if (!response.ok) {
    return { ok: false as const, error: typeof payload?.error === "string" ? payload.error : "Something went wrong. Try again." };
  }

  return { ok: true as const, error: null };
}

export function HackathonResultActions({
  userHackathonId,
  status,
  isPinned,
}: {
  userHackathonId: string;
  status: "attended" | "won";
  isPinned: boolean;
}) {
  const router = useRouter();
  const [pinned, setPinned] = useState(isPinned);
  const [pinPending, setPinPending] = useState(false);
  const [winnerOpen, setWinnerOpen] = useState(false);
  const [award, setAward] = useState("");
  const [devpostUrl, setDevpostUrl] = useState("");
  const [winnerPending, setWinnerPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function togglePinned() {
    if (pinPending) {
      return;
    }

    const nextPinned = !pinned;
    setPinned(nextPinned);
    setPinPending(true);
    setError(null);

    const result = await patchUserHackathon(userHackathonId, { isPinned: nextPinned });

    if (!result.ok) {
      setPinned(!nextPinned);
      if (result.error) {
        setError(result.error);
      }
    } else {
      router.refresh();
    }

    setPinPending(false);
  }

  async function submitWinner(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!award.trim() || winnerPending) {
      return;
    }

    setWinnerPending(true);
    setError(null);

    const result = await patchUserHackathon(userHackathonId, {
      applicationStatus: "won",
      awardName: award.trim(),
      devpostUrl: devpostUrl.trim(),
    });

    if (!result.ok) {
      if (result.error) {
        setError(result.error);
      }
      setWinnerPending(false);
      return;
    }

    setWinnerOpen(false);
    setAward("");
    setDevpostUrl("");
    setWinnerPending(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center gap-2">
        <button
          aria-pressed={pinned}
          className={`${buttonClassName} ${
            pinned
              ? "border-[#660000] bg-[#660000] text-white"
              : "border-[#660000]/40 bg-white text-[#660000] hover:bg-[#660000] hover:text-white"
          }`}
          disabled={pinPending}
          onClick={togglePinned}
          type="button"
        >
          <Pin aria-hidden="true" className={`size-3.5 ${pinned ? "fill-current" : ""}`} />
          {pinned ? "Pinned" : "Pin to profile"}
        </button>

        {status === "attended" && !winnerOpen ? (
          <button
            className={`${buttonClassName} border-[#660000] bg-white text-[#660000] hover:bg-[#660000] hover:text-white`}
            onClick={() => {
              setWinnerOpen(true);
              setError(null);
            }}
            type="button"
          >
            <Trophy aria-hidden="true" className="size-3.5" />
            Winner
          </button>
        ) : null}
      </div>

      {status === "attended" && winnerOpen ? (
        <form className="flex flex-col gap-2" onSubmit={submitWinner}>
          <div className="flex flex-wrap items-center gap-2">
            <input
              aria-label="Prize or award you won"
              autoFocus
              className="h-8 w-52 border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-[#660000]"
              maxLength={180}
              onChange={(event) => setAward(event.target.value)}
              placeholder="Prize won (e.g. Best AI Hack)"
              value={award}
            />
            <input
              aria-label="Devpost link (optional)"
              className="h-8 w-64 border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-[#660000]"
              inputMode="url"
              onChange={(event) => setDevpostUrl(event.target.value)}
              placeholder="Devpost link (optional)"
              type="url"
              value={devpostUrl}
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="inline-flex min-h-8 items-center bg-[#660000] px-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-white transition hover:bg-[#4d0000] disabled:opacity-50"
              disabled={winnerPending || !award.trim()}
              type="submit"
            >
              {winnerPending ? "Saving…" : "Save win"}
            </button>
            <button
              className="min-h-8 px-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#706F6B] hover:text-black"
              onClick={() => {
                setWinnerOpen(false);
                setAward("");
                setDevpostUrl("");
                setError(null);
              }}
              type="button"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : null}

      {error ? <p className="text-sm text-[#B3261E]">{error}</p> : null}
    </div>
  );
}
