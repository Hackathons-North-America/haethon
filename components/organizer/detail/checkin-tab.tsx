"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { AlertTriangle, Check, Copy, KeyRound, Maximize2, RefreshCw, RotateCcw, X } from "lucide-react";

import {
  apiErrorMessage,
  cardClassName,
  eyebrowClassName,
  formatDateTime,
  primaryButtonClassName,
  secondaryButtonClassName,
  statusTextClassName,
} from "@/components/organizer/detail/shared";
import { trackEvent } from "@/lib/analytics/events";

type CheckinCode = {
  code: string;
  createdAt: string;
  expiresAt: string | null;
};

type LoadState = "loading" | "ready" | "error";
type Message = { tone: "error" | "success"; text: string };

const LOAD_ERROR = "Could not load the check-in code.";

/* Codes are 9 characters; three groups of three are easier to read aloud and
   retype from a projector. Grouping is visual only: copy uses the raw code. */
function codeGroups(code: string) {
  return code.match(/.{1,3}/g) ?? [code];
}

function CodeGlyphs({ code, className, wrap = true }: { code: string; className: string; wrap?: boolean }) {
  return (
    <span className={className}>
      <span className="sr-only">{code.split("").join(" ")}</span>
      <span
        aria-hidden="true"
        className={`inline-flex justify-center gap-x-[0.45em] gap-y-1 ${wrap ? "flex-wrap" : "flex-nowrap whitespace-nowrap"}`}
      >
        {codeGroups(code).map((group, index) => (
          <span key={`${group}-${index}`}>{group}</span>
        ))}
      </span>
    </span>
  );
}

function PresentationOverlay({ code, onClose }: { code: string; onClose: () => void }) {
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const previousOverflow = document.body.style.overflow;

    document.body.style.overflow = "hidden";
    closeRef.current?.focus();

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }

      // Only one focusable control: keep Tab inside the dialog.
      if (event.key === "Tab") {
        event.preventDefault();
        closeRef.current?.focus();
      }
    }

    document.addEventListener("keydown", onKeyDown);

    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [onClose]);

  /* Portaled to <body> so it sits above the organizer shell: inside <main>
     (its own z-10 stacking context) the mobile nav's z-30 would cover it,
     Close button included. Only ever rendered after a click, so document
     exists; the guard just keeps a stray server render from throwing. */
  if (typeof document === "undefined") {
    return null;
  }

  return createPortal(
    <div
      aria-label="Check-in code, full screen"
      aria-modal="true"
      className="fixed inset-0 z-50 flex flex-col bg-paper px-4 py-6 text-ink sm:px-8"
      role="dialog"
    >
      <div className="flex justify-end">
        <button
          className={`${secondaryButtonClassName} px-4`}
          onClick={onClose}
          ref={closeRef}
          type="button"
        >
          <X aria-hidden="true" className="size-4" />
          Close
          <span className="hidden text-xs font-normal text-ink/55 sm:inline">(Esc)</span>
        </button>
      </div>
      <div className="flex flex-1 flex-col items-center justify-center gap-6 text-center sm:gap-10">
        <p className="text-base font-semibold text-ink/55 sm:text-2xl">Check-in code</p>
        {/* One line at any width: Geist Mono is 0.6em per glyph, so nine glyphs
            with 0.08em tracking plus two 0.45em group gaps come to ~7em. At
            10.5vw that's ~74vw (277px of the 343px usable at 375; 943px of
            1216px at 1280), and the 11rem cap only kicks in past ~1676px. */}
        <CodeGlyphs
          className="block font-mono text-[min(10.5vw,11rem)] font-semibold leading-none tracking-[0.08em] text-ink"
          code={code}
          wrap={false}
        />
        <p className="max-w-xl text-sm leading-6 text-ink/55 sm:text-xl sm:leading-8">
          Mark this hackathon as attended, then open it under Hackathons attended on your account page and choose
          &ldquo;Have a check-in code?&rdquo;
        </p>
      </div>
    </div>,
    document.body
  );
}

function CodeSkeleton() {
  return (
    <div aria-hidden="true" className="mt-4 space-y-4">
      <div className="h-24 animate-pulse rounded-2xl bg-ink/10 motion-reduce:animate-none" />
      <div className="h-4 w-2/3 animate-pulse rounded-full bg-ink/10 motion-reduce:animate-none" />
      <div className="flex gap-2">
        <div className="h-11 w-28 animate-pulse rounded-full bg-ink/10 motion-reduce:animate-none" />
        <div className="h-11 w-36 animate-pulse rounded-full bg-ink/10 motion-reduce:animate-none" />
      </div>
    </div>
  );
}

const STEPS = [
  {
    title: "Share the code at the venue",
    body: "Project it full screen or post it somewhere hackers can see. Check-in opens when the hackathon starts and stays open for 30 days after it ends.",
  },
  {
    title: "Hackers enter it on their account",
    body: "After marking your event as attended in My hackathons, they open it under Hackathons attended on their account page and choose “Have a check-in code?”. Codes aren’t case-sensitive.",
  },
  {
    title: "Attendance is verified",
    body: "Each hacker who redeems the code is marked organizer-verified for the event’s days and shows as Verified in the Attendees tab.",
  },
] as const;

export function CheckinTab({ hackathonId }: { hackathonId: string }) {
  const [code, setCode] = useState<CheckinCode | null>(null);
  const [loadState, setLoadState] = useState<LoadState>("loading");
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [generating, setGenerating] = useState(false);
  const [confirmingRegenerate, setConfirmingRegenerate] = useState(false);
  const [message, setMessage] = useState<Message | null>(null);
  const [copied, setCopied] = useState(false);
  const [presenting, setPresenting] = useState(false);
  const copiedTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelRegenerateRef = useRef<HTMLButtonElement>(null);
  const regenerateRef = useRef<HTMLButtonElement>(null);
  /* Closing the confirm panel unmounts the focused button (Cancel or
     "Regenerate code"). Set when that happens so focus lands back on
     Regenerate once it's rendered and enabled again, not on <body>. */
  const restoreRegenerateFocus = useRef(false);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/organizer/hackathons/${hackathonId}/checkin-code`)
      .then(async (response) => {
        const result = (await response.json().catch(() => null)) as { data?: CheckinCode | null; error?: unknown } | null;

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setLoadState("error");
          setMessage({ tone: "error", text: apiErrorMessage(result, LOAD_ERROR) });
          return;
        }

        setCode(result?.data ?? null);
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState("error");
          setMessage({ tone: "error", text: LOAD_ERROR });
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hackathonId, loadAttempt]);

  useEffect(() => {
    return () => {
      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }
    };
  }, []);

  useEffect(() => {
    if (confirmingRegenerate) {
      cancelRegenerateRef.current?.focus();
      return;
    }

    if (!generating && restoreRegenerateFocus.current) {
      restoreRegenerateFocus.current = false;
      regenerateRef.current?.focus();
    }
  }, [confirmingRegenerate, generating]);

  function closeRegenerateConfirm() {
    restoreRegenerateFocus.current = true;
    setConfirmingRegenerate(false);
  }

  const closePresentation = useCallback(() => setPresenting(false), []);

  function retryLoad() {
    setLoadState("loading");
    setMessage(null);
    setLoadAttempt((attempt) => attempt + 1);
  }

  async function generateCode() {
    setGenerating(true);

    if (confirmingRegenerate) {
      closeRegenerateConfirm();
    }

    setMessage(null);

    try {
      const response = await fetch(`/api/organizer/hackathons/${hackathonId}/checkin-code`, { method: "POST" });
      const result = (await response.json().catch(() => null)) as { data?: CheckinCode; error?: unknown } | null;

      if (!response.ok || !result?.data) {
        setMessage({ tone: "error", text: apiErrorMessage(result, "Could not generate a code. Please try again.") });
        return;
      }

      setCode(result.data);
      setCopied(false);
      setMessage({ tone: "success", text: "New code generated. Previous codes are now revoked." });
      trackEvent("organizer_checkin_code_generated", { hackathon_id: hackathonId });
    } catch {
      setMessage({ tone: "error", text: "Could not reach the server. Please try again." });
    } finally {
      setGenerating(false);
    }
  }

  async function copyCode() {
    if (!code) {
      return;
    }

    try {
      if (!navigator.clipboard?.writeText) {
        throw new Error("Clipboard unavailable");
      }

      await navigator.clipboard.writeText(code.code);
      setCopied(true);
      setMessage({ tone: "success", text: "Code copied to clipboard." });

      if (copiedTimer.current) {
        clearTimeout(copiedTimer.current);
      }

      copiedTimer.current = setTimeout(() => setCopied(false), 2000);
    } catch {
      setMessage({ tone: "error", text: "Couldn't copy automatically. Select the code and copy it manually." });
    }
  }

  const loadFailed = loadState === "error";

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-5">
      <section aria-labelledby="checkin-code-heading" className={`${cardClassName} p-4 sm:p-5`}>
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink" id="checkin-code-heading">
          <KeyRound aria-hidden="true" className="size-4 text-pine" />
          Attendance check-in code
        </h2>
        <p className="mt-1.5 text-sm leading-6 text-ink/55">
          Share this code with hackers at the venue so they can verify their attendance.
        </p>

        {loadState === "loading" ? (
          <>
            <span className="sr-only" role="status">
              Loading code...
            </span>
            <CodeSkeleton />
          </>
        ) : loadFailed ? (
          <div className="mt-4 rounded-2xl border border-danger/20 bg-danger-soft p-4">
            <p className="flex items-start gap-2 text-sm font-semibold text-danger">
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
              {message?.text ?? LOAD_ERROR}
            </p>
            <button className={`${secondaryButtonClassName} mt-3`} onClick={retryLoad} type="button">
              <RotateCcw aria-hidden="true" className="size-4" />
              Try again
            </button>
          </div>
        ) : code ? (
          <>
            <div className="mt-4 rounded-2xl border border-ink/10 bg-paper px-3 py-6 text-center sm:px-6 sm:py-8">
              <p className={eyebrowClassName}>Current code</p>
              <CodeGlyphs
                className="mt-3 block select-all font-mono text-[clamp(2rem,10vw,3.75rem)] font-semibold leading-none tracking-[0.12em] text-ink"
                code={code.code}
              />
            </div>

            <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-ink/55 sm:grid-cols-2">
              <div className="flex gap-1.5">
                <dt>Created</dt>
                <dd className="font-medium text-ink/80">{formatDateTime(code.createdAt)}</dd>
              </div>
              <div className="flex gap-1.5">
                <dt>Expires</dt>
                <dd className="font-medium text-ink/80">
                  {code.expiresAt ? formatDateTime(code.expiresAt) : "Never, until you regenerate it"}
                </dd>
              </div>
            </dl>

            <div className="mt-4 flex flex-wrap gap-2">
              <button className={secondaryButtonClassName} onClick={copyCode} type="button">
                {copied ? (
                  <Check aria-hidden="true" className="size-4 text-success" />
                ) : (
                  <Copy aria-hidden="true" className="size-4" />
                )}
                {copied ? "Copied" : "Copy"}
              </button>
              <button className={secondaryButtonClassName} onClick={() => setPresenting(true)} type="button">
                <Maximize2 aria-hidden="true" className="size-4" />
                Show full screen
              </button>
              {!confirmingRegenerate ? (
                <button
                  className={secondaryButtonClassName}
                  disabled={generating}
                  onClick={() => {
                    setMessage(null);
                    setConfirmingRegenerate(true);
                  }}
                  ref={regenerateRef}
                  type="button"
                >
                  <RefreshCw aria-hidden="true" className={`size-4 ${generating ? "animate-spin motion-reduce:animate-none" : ""}`} />
                  {generating ? "Generating..." : "Regenerate"}
                </button>
              ) : null}
            </div>

            {confirmingRegenerate ? (
              <div
                aria-labelledby="checkin-regenerate-warning"
                className="mt-4 rounded-2xl border border-warning/25 bg-warning-soft p-4"
                role="group"
              >
                <p className="flex items-start gap-2 text-sm leading-6 text-warning-ink" id="checkin-regenerate-warning">
                  <AlertTriangle aria-hidden="true" className="mt-1 size-4 shrink-0" />
                  Regenerating revokes the current code. Hackers who haven&rsquo;t checked in yet will need the new one.
                </p>
                <div className="mt-3 flex flex-wrap gap-2">
                  <button className={primaryButtonClassName} onClick={generateCode} type="button">
                    <RefreshCw aria-hidden="true" className="size-4" />
                    Regenerate code
                  </button>
                  <button
                    className={secondaryButtonClassName}
                    onClick={closeRegenerateConfirm}
                    ref={cancelRegenerateRef}
                    type="button"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : null}
          </>
        ) : (
          <div className="mt-4 rounded-2xl border border-dashed border-ink/15 bg-paper px-4 py-8 text-center">
            <KeyRound aria-hidden="true" className="mx-auto size-6 text-ink/35" />
            <p className="mt-2 text-sm font-semibold text-ink">No active code yet</p>
            <p className="mx-auto mt-1 max-w-xs text-sm leading-6 text-ink/55">
              Generate one when you&rsquo;re ready to start checking hackers in.
            </p>
            <button className={`${primaryButtonClassName} mt-4`} disabled={generating} onClick={generateCode} type="button">
              <RefreshCw aria-hidden="true" className={`size-4 ${generating ? "animate-spin motion-reduce:animate-none" : ""}`} />
              {generating ? "Generating..." : "Generate code"}
            </button>
          </div>
        )}

        {/* Always mounted so screen readers announce changes. The load error is
            shown in its own panel above, so it isn't repeated here. */}
        <p aria-live="polite" className="mt-3 min-h-5 text-sm font-semibold" role="status">
          {message && !loadFailed ? <span className={statusTextClassName(message.tone)}>{message.text}</span> : null}
          {loadFailed ? <span className="sr-only">{message?.text ?? LOAD_ERROR}</span> : null}
        </p>
      </section>

      <section aria-labelledby="checkin-how-heading" className={`${cardClassName} p-4 sm:p-5`}>
        <h2 className="text-base font-semibold text-ink" id="checkin-how-heading">
          How check-in works
        </h2>
        <ol className="mt-4 space-y-4">
          {STEPS.map((step, index) => (
            <li className="flex gap-3" key={step.title}>
              <span
                aria-hidden="true"
                className="flex size-7 shrink-0 items-center justify-center rounded-full bg-pine-soft text-sm font-semibold text-pine"
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="text-sm font-semibold text-ink">{step.title}</p>
                <p className="mt-0.5 text-sm leading-6 text-ink/55">{step.body}</p>
              </div>
            </li>
          ))}
        </ol>
      </section>

      {presenting && code ? <PresentationOverlay code={code.code} onClose={closePresentation} /> : null}
    </div>
  );
}
