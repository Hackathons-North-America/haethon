"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Link2, Pin, Trophy, Undo2 } from "lucide-react";

function handleUnauthenticated() {
  window.location.href = "/sign-in";
}

const buttonClassName =
  "inline-flex min-h-8 items-center gap-1.5 border px-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em] transition-colors disabled:cursor-wait disabled:opacity-60";

const outlineButtonClassName = `${buttonClassName} border-[#660000]/40 bg-white text-[#660000] hover:bg-[#660000] hover:text-white`;

const inputClassName = "h-8 border border-black/15 bg-white px-3 text-sm text-black outline-none focus:border-[#660000]";

const submitButtonClassName =
  "inline-flex min-h-8 items-center bg-[#660000] px-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-white transition hover:bg-[#4d0000] disabled:opacity-50";

const cancelButtonClassName =
  "min-h-8 px-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-[#706F6B] hover:text-black";

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
  awardName,
  devpostUrl,
}: {
  userHackathonId: string;
  status: "attended" | "won";
  isPinned: boolean;
  awardName: string | null;
  devpostUrl: string | null;
}) {
  const router = useRouter();
  const won = status === "won";
  const [pinned, setPinned] = useState(isPinned);
  const [openForm, setOpenForm] = useState<"win" | "link" | null>(null);
  const [award, setAward] = useState(awardName ?? "");
  const [link, setLink] = useState(devpostUrl ?? "");
  const [pending, setPending] = useState<"pin" | "win" | "undo" | "link" | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function runPatch(kind: "pin" | "win" | "undo" | "link", body: Record<string, unknown>) {
    setPending(kind);
    setError(null);

    const result = await patchUserHackathon(userHackathonId, body);

    if (!result.ok) {
      if (result.error) {
        setError(result.error);
      }
      setPending(null);
      return false;
    }

    router.refresh();
    setPending(null);
    return true;
  }

  function toggleForm(form: "win" | "link") {
    setError(null);
    setAward(awardName ?? "");
    setLink(devpostUrl ?? "");
    setOpenForm((current) => (current === form ? null : form));
  }

  async function togglePinned() {
    if (pending) {
      return;
    }

    const nextPinned = !pinned;
    setPinned(nextPinned);

    if (!(await runPatch("pin", { isPinned: nextPinned }))) {
      setPinned(!nextPinned);
    }
  }

  async function submitWin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!award.trim() || pending) {
      return;
    }

    const saved = await runPatch("win", {
      applicationStatus: "won",
      awardName: award.trim(),
      devpostUrl: link.trim() || null,
    });

    if (saved) {
      setOpenForm(null);
    }
  }

  async function undoWin() {
    if (pending) {
      return;
    }

    if (await runPatch("undo", { applicationStatus: "attended", awardName: null })) {
      setOpenForm(null);
      setAward("");
    }
  }

  async function submitLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (pending) {
      return;
    }

    if (await runPatch("link", { devpostUrl: link.trim() || null })) {
      setOpenForm(null);
    }
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          aria-pressed={pinned}
          className={`${buttonClassName} ${
            pinned
              ? "border-[#660000] bg-[#660000] text-white hover:bg-[#4d0000]"
              : "border-[#660000]/40 bg-white text-[#660000] hover:bg-[#660000] hover:text-white"
          }`}
          disabled={pending === "pin"}
          onClick={togglePinned}
          type="button"
        >
          <Pin aria-hidden="true" className={`size-3.5 ${pinned ? "fill-current" : ""}`} />
          {pinned ? "Unpin from profile" : "Pin to profile"}
        </button>

        <button className={outlineButtonClassName} onClick={() => toggleForm("win")} type="button">
          <Trophy aria-hidden="true" className="size-3.5" />
          {won ? "Edit win" : "Log a win"}
        </button>

        {won ? (
          <button className={outlineButtonClassName} disabled={pending === "undo"} onClick={undoWin} type="button">
            <Undo2 aria-hidden="true" className="size-3.5" />
            {pending === "undo" ? "Undoing…" : "Undo win"}
          </button>
        ) : null}

        <button className={outlineButtonClassName} onClick={() => toggleForm("link")} type="button">
          <Link2 aria-hidden="true" className="size-3.5" />
          {devpostUrl ? "Edit project link" : "Add project link"}
        </button>
      </div>

      {openForm === "win" ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={submitWin}>
          <input
            aria-label="Prize or award you won"
            autoFocus
            className={`${inputClassName} w-52`}
            maxLength={180}
            onChange={(event) => setAward(event.target.value)}
            placeholder="Prize won (e.g. Best AI Hack)"
            value={award}
          />
          <input
            aria-label="Devpost project link"
            className={`${inputClassName} w-52`}
            onChange={(event) => setLink(event.target.value)}
            placeholder="Devpost link (optional)"
            type="url"
            value={link}
          />
          <button className={submitButtonClassName} disabled={pending === "win" || !award.trim()} type="submit">
            {pending === "win" ? "Saving…" : "Save win"}
          </button>
          <button className={cancelButtonClassName} onClick={() => setOpenForm(null)} type="button">
            Cancel
          </button>
        </form>
      ) : null}

      {openForm === "link" ? (
        <form className="flex flex-wrap items-center gap-2" onSubmit={submitLink}>
          <input
            aria-label="Devpost project link"
            autoFocus
            className={`${inputClassName} w-72`}
            onChange={(event) => setLink(event.target.value)}
            placeholder="https://devpost.com/software/your-project"
            type="url"
            value={link}
          />
          <button className={submitButtonClassName} disabled={pending === "link"} type="submit">
            {pending === "link" ? "Saving…" : "Save link"}
          </button>
          <button className={cancelButtonClassName} onClick={() => setOpenForm(null)} type="button">
            Cancel
          </button>
          {devpostUrl ? (
            <span className="text-xs text-[#706F6B]">Clear the field and save to remove the link.</span>
          ) : null}
        </form>
      ) : null}

      {error ? <p className="text-sm text-[#B3261E]">{error}</p> : null}
    </div>
  );
}
