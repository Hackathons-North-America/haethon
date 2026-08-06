"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, Share2, X } from "lucide-react";

import { profileShareUrl } from "@/lib/profile/username";

const headingClassName = "text-sm font-semibold uppercase tracking-[0.2em] text-pine";
const primaryButtonClassName =
  "inline-flex min-h-10 items-center gap-2 rounded-full bg-pine px-4 text-sm font-semibold text-paper transition hover:bg-pine/90 disabled:opacity-60 dark:bg-paper dark:text-[#141414] dark:hover:bg-white";

export function ShareProfileDialog({ username }: { username: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);
  const [origin, setOrigin] = useState("");

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setIsOpen(false);
      }
    }

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  const shareUrl = origin ? profileShareUrl(origin, username) : "";

  async function copyLink() {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {}
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setCopied(false);
          setOrigin(window.location.origin);
          setIsOpen(true);
        }}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium text-ink transition-colors hover:bg-pine hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
      >
        <Share2 aria-hidden="true" className="size-4" />
        Share
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Share profile"
        >
          <div
            className="flex h-dvh items-center justify-center px-4 py-8"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setIsOpen(false);
              }
            }}
          >
            <div className="flex max-h-full w-full max-w-xl flex-col rounded-xl border border-ink/10 bg-white text-left shadow-2xl dark:border-white/10 dark:bg-[#1b1b1b]">
              <div className="flex shrink-0 items-center justify-between gap-3 px-6 pb-4 pt-6">
                <h2 className={headingClassName}>Share profile</h2>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close"
                  className="inline-flex size-8 items-center justify-center rounded-xl text-ink/55 transition hover:bg-ink/5 hover:text-ink dark:text-paper/55 dark:hover:bg-white/10 dark:hover:text-paper"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                <p className="text-sm text-ink/65 dark:text-paper/65">
                  Anyone can view your public profile without signing in. It shows your name, school, bio, socials,
                  skills, pinned events, activity, and hackathons attended. Your email address and account settings are
                  never included.
                </p>

                <div className="mt-4 flex items-stretch overflow-hidden rounded-xl border border-ink/15 bg-paper dark:border-white/15 dark:bg-white/5">
                  <span aria-hidden="true" className="flex select-none items-center pl-3 text-ink/45 dark:text-paper/45">
                    <Link2 className="size-4" />
                  </span>
                  <input
                    readOnly
                    value={shareUrl}
                    aria-label="Your profile share link"
                    onFocus={(event) => event.currentTarget.select()}
                    className="w-full min-w-0 flex-1 bg-transparent px-3 py-2.5 text-sm text-ink outline-none"
                  />
                </div>

                <div className="mt-4">
                  <button type="button" onClick={copyLink} className={primaryButtonClassName} disabled={!shareUrl}>
                    {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
                    {copied ? "Copied" : "Copy link"}
                  </button>
                </div>

                <p className="mt-4 text-xs text-ink/50 dark:text-paper/50">
                  This link is based on your username and stays the same.
                </p>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
