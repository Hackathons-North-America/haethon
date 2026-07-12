"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Trash2 } from "lucide-react";

/* Trash button + a self-contained confirmation dialog used on the My Hackathons
   cards. Confirming hits DELETE /api/hackathons/{id}/track, which drops the
   tracking row entirely — undoing the interested/applied/accepted tag and
   clearing any reminders — then calls onRemoved so the parent can drop the card
   from view. The dialog is portaled to <body> so it escapes the card's
   hover:scale transform (a transformed ancestor would otherwise trap a fixed
   overlay) and any overflow clipping. */
export function RemoveHackathonControl({
  className,
  hackathonId,
  hackathonName,
  listLabel,
  onRemoved,
}: {
  className?: string;
  hackathonId: string;
  hackathonName: string;
  /* The list the card currently sits in — "Interested", "Applied", "Accepted",
     or "Past" — surfaced in the confirmation copy. */
  listLabel: string;
  onRemoved?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!open) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen((current) => (pending ? current : false));
      }
    }

    document.addEventListener("keydown", handleKeyDown);

    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, pending]);

  function stopPropagation(event: { stopPropagation: () => void }) {
    event.stopPropagation();
  }

  async function confirmRemove() {
    if (pending) {
      return;
    }

    setPending(true);

    try {
      const response = await fetch(`/api/hackathons/${encodeURIComponent(hackathonId)}/track`, {
        method: "DELETE",
      });

      if (response.status === 401) {
        window.location.href = "/sign-in";
        return;
      }

      if (!response.ok) {
        throw new Error("Could not remove hackathon.");
      }

      setOpen(false);
      onRemoved?.();
    } catch {
      setPending(false);
    }
  }

  return (
    <>
      <button
        aria-label={`Remove ${hackathonName} from your ${listLabel} list`}
        className={
          className ??
          "relative z-20 grid size-8 place-items-center rounded-full text-navy/55 dark:text-wheat/55 transition-colors hover:bg-cabernet/10 hover:text-cabernet dark:hover:text-[#e4a3ab] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40"
        }
        draggable={false}
        onClick={(event) => {
          stopPropagation(event);
          setOpen(true);
        }}
        onMouseDown={stopPropagation}
        onPointerDown={stopPropagation}
        title="Remove from my hackathons"
        type="button"
      >
        <Trash2 aria-hidden="true" className="size-4" />
      </button>

      {open
        ? createPortal(
            <div
              aria-modal="true"
              className="fixed inset-0 z-[100] flex items-center justify-center p-4"
              onMouseDown={stopPropagation}
              onPointerDown={stopPropagation}
              role="dialog"
            >
              <button
                aria-label="Cancel"
                className="absolute inset-0 bg-navy/40 dark:bg-black/60 backdrop-blur-[2px]"
                disabled={pending}
                onClick={() => setOpen(false)}
                tabIndex={-1}
                type="button"
              />
              <div className="relative w-full max-w-md rounded-2xl border border-navy/10 dark:border-white/10 bg-white dark:bg-[#1b1b1b] p-6 shadow-[0_30px_80px_rgb(0_0_0/0.45)]">
                <h2 className="text-lg font-semibold leading-6 text-navy dark:text-wheat">
                  Are you no longer interested in {hackathonName}?
                </h2>
                <p className="mt-2 text-sm leading-5 text-navy/60 dark:text-wheat/60">
                  This will remove it from your {listLabel} list and clear any reminders you set for it.
                </p>
                <div className="mt-6 flex items-center justify-end gap-3">
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-full border border-navy/15 dark:border-white/15 px-5 text-sm font-semibold text-navy dark:text-wheat transition-colors hover:bg-navy/5 dark:hover:bg-white/5 disabled:opacity-60"
                    disabled={pending}
                    onClick={() => setOpen(false)}
                    type="button"
                  >
                    No
                  </button>
                  <button
                    className="inline-flex min-h-10 items-center justify-center rounded-full bg-cabernet px-5 text-sm font-semibold text-wheat transition-colors hover:bg-cabernet/90 dark:bg-[#e4a3ab] dark:text-[#141414] dark:hover:bg-[#e9b3ba] disabled:cursor-wait disabled:opacity-70"
                    disabled={pending}
                    onClick={confirmRemove}
                    type="button"
                  >
                    {pending ? "Removing…" : "Yes"}
                  </button>
                </div>
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
