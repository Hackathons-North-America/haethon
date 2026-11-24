"use client";

import { useState } from "react";
import type { FormEvent } from "react";
import { Link2, Pin, Trophy, Undo2 } from "lucide-react";

import type { PastResultFields } from "@/components/past-hackathon-card";

const buttonClassName =
  "inline-flex rounded-full min-h-8 items-center gap-1.5 border px-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em] transition-colors";

const outlineButtonClassName = `${buttonClassName} border-pine/40 bg-surface text-pine hover:bg-pine hover:text-paper`;

const inputClassName = "h-8 border border-ink/15 bg-surface px-3 text-sm text-ink outline-none focus:border-pine";

const submitButtonClassName =
  "inline-flex rounded-full min-h-8 items-center bg-pine px-3 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-paper transition hover:bg-pine/90 disabled:opacity-50";

const cancelButtonClassName =
  "min-h-8 px-2 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink/55 hover:text-ink";

/** One background save of a past hackathon's result fields. */
export type ResultSave = {
  /* Saves with the same key replace each other (last click wins). */
  key: "pin" | "result" | "link";
  patch: Partial<PastResultFields>;
  failureMessage: string;
  /* Called when the save fails, after the fields are rolled back. */
  onFailed?: () => void;
};

/* Pin, win and project-link controls for an attended past hackathon. Every
   action is applied immediately by the owning PastHackathonCard (onSave) and
   saved in the background; forms close on submit and reopen with what was
   typed if the server rejects it. */
export function HackathonResultActions({
  awardName,
  devpostUrl,
  hackathonName,
  isPinned,
  onSave,
  status,
}: {
  awardName: string | null;
  devpostUrl: string | null;
  hackathonName: string;
  isPinned: boolean;
  onSave: (save: ResultSave) => void;
  status: "attended" | "won";
}) {
  const won = status === "won";
  const [openForm, setOpenForm] = useState<"win" | "link" | null>(null);
  const [award, setAward] = useState(awardName ?? "");
  const [link, setLink] = useState(devpostUrl ?? "");

  function toggleForm(form: "win" | "link") {
    setAward(awardName ?? "");
    setLink(devpostUrl ?? "");
    setOpenForm((current) => (current === form ? null : form));
  }

  function togglePinned() {
    const nextPinned = !isPinned;

    onSave({
      key: "pin",
      patch: { isPinned: nextPinned },
      failureMessage: nextPinned ? `Couldn't pin ${hackathonName} to your profile.` : `Couldn't unpin ${hackathonName}.`,
    });
  }

  function submitWin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!award.trim()) {
      return;
    }

    const typedAward = award;
    const typedLink = link;

    setOpenForm(null);
    onSave({
      key: "result",
      patch: { status: "won", awardName: award.trim(), devpostUrl: link.trim() || null },
      failureMessage: `Couldn't save your win for ${hackathonName}.`,
      // Reopen the form with what was typed so nothing has to be re-entered.
      onFailed: () => {
        setAward(typedAward);
        setLink(typedLink);
        setOpenForm("win");
      },
    });
  }

  function undoWin() {
    setOpenForm(null);
    setAward("");
    onSave({
      key: "result",
      patch: { status: "attended", awardName: null },
      failureMessage: `Couldn't undo the win for ${hackathonName}.`,
    });
  }

  function submitLink(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const typedLink = link;

    setOpenForm(null);
    onSave({
      key: "link",
      patch: { devpostUrl: link.trim() || null },
      failureMessage: `Couldn't save the project link for ${hackathonName}.`,
      onFailed: () => {
        setLink(typedLink);
        setOpenForm("link");
      },
    });
  }

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <button
          aria-pressed={isPinned}
          className={`${buttonClassName} ${
            isPinned
              ? "border-pine bg-pine text-paper hover:bg-pine/90"
              : "border-pine/40 bg-surface text-pine hover:bg-pine hover:text-paper"
          }`}
          onClick={togglePinned}
          type="button"
        >
          <Pin aria-hidden="true" className={`size-3.5 ${isPinned ? "fill-current" : ""}`} />
          {isPinned ? "Unpin from profile" : "Pin to profile"}
        </button>

        <button className={outlineButtonClassName} onClick={() => toggleForm("win")} type="button">
          <Trophy aria-hidden="true" className="size-3.5" />
          {won ? "Edit win" : "Log a win"}
        </button>

        {won ? (
          <button className={outlineButtonClassName} onClick={undoWin} type="button">
            <Undo2 aria-hidden="true" className="size-3.5" />
            Undo win
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
          <button className={submitButtonClassName} disabled={!award.trim()} type="submit">
            Save win
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
          <button className={submitButtonClassName} type="submit">
            Save link
          </button>
          <button className={cancelButtonClassName} onClick={() => setOpenForm(null)} type="button">
            Cancel
          </button>
          {devpostUrl ? (
            <span className="text-xs text-ink/55">Clear the field and save to remove the link.</span>
          ) : null}
        </form>
      ) : null}

    </div>
  );
}
