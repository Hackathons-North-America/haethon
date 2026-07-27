"use client";

import { useEffect, useState } from "react";
import { Check, Copy, Link2, RefreshCw, Share2, X } from "lucide-react";

import { profileShareUrl } from "@/lib/profile/share-token";

type ShareStatus = "idle" | "working" | "error";

const headingClassName = "text-sm font-semibold uppercase tracking-[0.2em] text-pine";
const primaryButtonClassName =
  "inline-flex min-h-10 items-center gap-2 rounded-full bg-pine px-4 text-sm font-semibold text-wheat transition hover:bg-pine/90 disabled:opacity-60 dark:bg-wheat dark:text-[#141414] dark:hover:bg-white";
const secondaryButtonClassName =
  "inline-flex min-h-10 items-center gap-2 rounded-full border border-navy/15 px-4 text-sm font-semibold text-navy transition hover:bg-navy/5 disabled:opacity-60 dark:border-white/15 dark:text-wheat dark:hover:bg-white/10";

export function ShareProfileDialog({ initialShareToken }: { initialShareToken: string | null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [shareToken, setShareToken] = useState(initialShareToken);
  const [status, setStatus] = useState<ShareStatus>("idle");
  const [copied, setCopied] = useState(false);
  // The origin is only known in the browser, and rendering the URL on the
  // server would put the token into the account page's HTML for no reason.
  // Captured when the dialog opens, which keeps the first render SSR-safe.
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

  const shareUrl = shareToken && origin ? profileShareUrl(origin, shareToken) : "";

  async function mutate(method: "POST" | "DELETE") {
    setStatus("working");
    setCopied(false);

    const response = await fetch("/api/account/share", { method }).catch(() => null);

    if (!response?.ok) {
      setStatus("error");
      return;
    }

    const body = await response.json().catch(() => null);
    setShareToken(body?.data?.shareToken ?? null);
    setStatus("idle");
  }

  async function copyLink() {
    if (!shareUrl) {
      return;
    }

    try {
      await navigator.clipboard.writeText(shareUrl);
      setCopied(true);
    } catch {
      setStatus("error");
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setStatus("idle");
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
            className="flex h-dvh items-center justify-center px-4 py-8 lg:pl-[17rem]"
            onMouseDown={(event) => {
              if (event.target === event.currentTarget) {
                setIsOpen(false);
              }
            }}
          >
            <div className="flex max-h-full w-full max-w-xl flex-col rounded-xl border border-navy/10 bg-white text-left shadow-2xl dark:border-white/10 dark:bg-[#1b1b1b]">
              <div className="flex shrink-0 items-center justify-between gap-3 px-6 pb-4 pt-6">
                <h2 className={headingClassName}>Share profile</h2>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  aria-label="Close"
                  className="inline-flex size-8 items-center justify-center rounded-xl text-navy/55 transition hover:bg-navy/5 hover:text-navy dark:text-wheat/55 dark:hover:bg-white/10 dark:hover:text-wheat"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto px-6 py-4">
                {shareToken ? (
                  <>
                    <p className="text-sm text-navy/65 dark:text-wheat/65">
                      Anyone with this link can view your profile — no account needed. It shows your name, school, bio,
                      socials, skills, pinned events, activity, and hackathons attended. Your email address and account
                      settings are never included.
                    </p>

                    <div className="mt-4 flex items-stretch overflow-hidden rounded-xl border border-navy/15 bg-ivory dark:border-white/15 dark:bg-white/5">
                      <span aria-hidden="true" className="flex select-none items-center pl-3 text-navy/45 dark:text-wheat/45">
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

                    <div className="mt-4 flex flex-wrap items-center gap-3">
                      <button type="button" onClick={copyLink} className={primaryButtonClassName} disabled={!shareUrl}>
                        {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
                        {copied ? "Copied" : "Copy link"}
                      </button>
                      <button
                        type="button"
                        onClick={() => mutate("POST")}
                        disabled={status === "working"}
                        className={secondaryButtonClassName}
                      >
                        <RefreshCw aria-hidden="true" className="size-4" />
                        Regenerate
                      </button>
                      <button
                        type="button"
                        onClick={() => mutate("DELETE")}
                        disabled={status === "working"}
                        className="inline-flex min-h-10 items-center gap-2 rounded-full px-4 text-sm font-semibold text-[#B42318] transition hover:bg-[#B42318]/10 disabled:opacity-60"
                      >
                        Turn off sharing
                      </button>
                    </div>

                    <p className="mt-4 text-xs text-navy/50 dark:text-wheat/50">
                      Regenerating replaces the link, and turning sharing off removes it. In both cases the old link stops
                      working right away.
                    </p>
                  </>
                ) : (
                  <>
                    <p className="text-sm text-navy/65 dark:text-wheat/65">
                      Create a link you can put on a resume or send to a recruiter. Anyone with the link can view your
                      profile without signing in — your name, school, bio, socials, skills, pinned events, activity, and
                      hackathons attended. Your email address and account settings are never included.
                    </p>
                    <p className="mt-3 text-sm text-navy/65 dark:text-wheat/65">
                      The link is unlisted and search engines are asked not to index it. You can regenerate or turn it off
                      at any time.
                    </p>
                    <div className="mt-5">
                      <button
                        type="button"
                        onClick={() => mutate("POST")}
                        disabled={status === "working"}
                        className={primaryButtonClassName}
                      >
                        <Link2 aria-hidden="true" className="size-4" />
                        {status === "working" ? "Creating" : "Create share link"}
                      </button>
                    </div>
                  </>
                )}

                {status === "error" ? (
                  <p className="mt-4 text-sm font-semibold text-[#B42318]">Something went wrong. Please try again.</p>
                ) : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
