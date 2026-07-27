"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Check, Copy, Download, Loader2, ScanSearch, Trophy, X } from "lucide-react";

export type DevpostImportState = {
  handle: string | null;
  verified: boolean;
  lastImportedAt: string | null;
};

type ScanItem = {
  id: string;
  projectTitle: string;
  projectUrl: string;
  hackathonName: string;
  awards: string[];
  isWin: boolean;
  submittedAt: string | null;
  matchedHackathon: { id: string; name: string } | null;
  alreadyTracked: boolean;
};

type ScanResult = {
  batchId: string;
  handle: string;
  projectCount: number;
  truncated: boolean;
  items: ScanItem[];
};

type ImportSummary = {
  importedCount: number;
  createdHackathonCount: number;
  winCount: number;
  warnings: string[];
};

const headingClassName = "text-sm font-semibold uppercase tracking-[0.2em] text-pine";
const primaryButtonClassName =
  "inline-flex min-h-10 items-center gap-2 rounded-full bg-pine px-4 text-sm font-semibold text-wheat transition hover:bg-pine/90 disabled:opacity-60 dark:bg-wheat dark:text-[#141414] dark:hover:bg-white";
const secondaryButtonClassName =
  "inline-flex min-h-10 items-center gap-2 rounded-full border border-navy/15 px-4 text-sm font-semibold text-navy transition hover:bg-navy/5 disabled:opacity-60 dark:border-white/15 dark:text-wheat dark:hover:bg-white/10";
const mutedTextClassName = "text-sm text-navy/65 dark:text-wheat/65";

async function postJson<T>(url: string, body?: unknown): Promise<{ data?: T; error?: string }> {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  }).catch(() => null);

  if (!response) {
    return { error: "Network error. Please try again." };
  }

  const parsed = (await response.json().catch(() => null)) as { data?: T; error?: string } | null;

  if (!response.ok) {
    return { error: typeof parsed?.error === "string" ? parsed.error : "Something went wrong. Please try again." };
  }

  return { data: parsed?.data };
}

function formatItemDate(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en-US", { month: "short", year: "numeric" }).format(date);
}

export function DevpostImportDialog({ initialState }: { initialState: DevpostImportState }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);
  const [verified, setVerified] = useState(initialState.verified);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [working, setWorking] = useState<"code" | "confirm" | "scan" | "import" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [scan, setScan] = useState<ScanResult | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [summary, setSummary] = useState<ImportSummary | null>(null);

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

  async function requestCode() {
    setWorking("code");
    setError(null);
    const result = await postJson<{ code: string }>("/api/account/devpost/verification", { intent: "start" });
    setWorking(null);

    if (result.error || !result.data) {
      setError(result.error ?? "Could not create a verification code.");
      return;
    }

    setCode(result.data.code);
  }

  async function confirmVerification() {
    setWorking("confirm");
    setError(null);
    const result = await postJson<{ verified: boolean }>("/api/account/devpost/verification", { intent: "confirm" });
    setWorking(null);

    if (result.error || !result.data?.verified) {
      setError(result.error ?? "Verification failed. Please try again.");
      return;
    }

    setVerified(true);
  }

  async function runScan() {
    setWorking("scan");
    setError(null);
    const result = await postJson<ScanResult>("/api/account/devpost/scan");
    setWorking(null);

    if (result.error || !result.data) {
      setError(result.error ?? "Scan failed. Please try again.");
      return;
    }

    setScan(result.data);
    // Everything found is selected by default; entries already on the profile
    // stay selected too so a new win at a tracked event upgrades it.
    setSelected(new Set(result.data.items.map((item) => item.id)));
  }

  async function runImport() {
    if (!scan || selected.size === 0) {
      return;
    }

    setWorking("import");
    setError(null);
    const result = await postJson<ImportSummary>("/api/account/devpost/import", {
      batchId: scan.batchId,
      itemIds: [...selected],
    });
    setWorking(null);

    if (result.error || !result.data) {
      setError(result.error ?? "Import failed. Please try again.");
      return;
    }

    setSummary(result.data);
    // The heatmap, attended table, and pins on the page behind the dialog are
    // server-rendered — refresh so the imported activity shows immediately.
    router.refresh();
  }

  function toggleItem(id: string) {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }

      return next;
    });
  }

  async function copyCode() {
    if (!code) {
      return;
    }

    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setError("Could not copy the code — select and copy it manually.");
    }
  }

  const hasHandle = Boolean(initialState.handle);

  return (
    <>
      <button
        type="button"
        onClick={() => {
          setError(null);
          setSummary(null);
          setScan(null);
          setIsOpen(true);
        }}
        className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full px-5 text-sm font-medium text-ink transition-colors hover:bg-pine hover:text-paper focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine"
      >
        <Download aria-hidden="true" className="size-4" />
        Import from Devpost
      </button>

      {isOpen ? (
        <div
          className="fixed inset-0 z-50 overflow-hidden bg-black/40 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-label="Import from Devpost"
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
                <h2 className={headingClassName}>Import from Devpost</h2>
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
                {!hasHandle ? (
                  <p className={mutedTextClassName}>
                    Add your Devpost profile first — open <span className="font-semibold">Edit profile</span> and fill in
                    the Devpost field. Then come back here to import your hackathons and wins.
                  </p>
                ) : summary ? (
                  <>
                    <p className={mutedTextClassName}>
                      Imported <span className="font-semibold">{summary.importedCount}</span>{" "}
                      {summary.importedCount === 1 ? "hackathon" : "hackathons"} from Devpost
                      {summary.winCount > 0 ? (
                        <>
                          , including <span className="font-semibold">{summary.winCount}</span>{" "}
                          {summary.winCount === 1 ? "win" : "wins"}
                        </>
                      ) : null}
                      . Your activity and attended list are updated below.
                    </p>
                    {summary.warnings.length > 0 ? (
                      <ul className="mt-3 space-y-1 text-xs text-navy/55 dark:text-wheat/55">
                        {summary.warnings.map((warning) => (
                          <li key={warning}>{warning}</li>
                        ))}
                      </ul>
                    ) : null}
                    <p className="mt-4 text-xs text-navy/50 dark:text-wheat/50">
                      You can now remove the verification code from your Devpost bio. Run another import any time to pick
                      up new projects.
                    </p>
                    <div className="mt-5">
                      <button type="button" onClick={() => setIsOpen(false)} className={primaryButtonClassName}>
                        Done
                      </button>
                    </div>
                  </>
                ) : !verified ? (
                  <>
                    <p className={mutedTextClassName}>
                      First, prove that <span className="font-semibold">devpost.com/{initialState.handle}</span> is your
                      profile so nobody can import someone else&apos;s wins:
                    </p>
                    <ol className="mt-3 list-decimal space-y-2 pl-5 text-sm text-navy/65 dark:text-wheat/65">
                      <li>Copy your one-time code below.</li>
                      <li>
                        Paste it anywhere in the <span className="font-semibold">bio</span> of your Devpost profile
                        (Devpost → Settings) and save.
                      </li>
                      <li>Click Verify. You can remove the code afterwards.</li>
                    </ol>

                    {code ? (
                      <div className="mt-4 flex items-stretch overflow-hidden rounded-xl border border-navy/15 bg-ivory dark:border-white/15 dark:bg-white/5">
                        <input
                          readOnly
                          value={code}
                          aria-label="Your Devpost verification code"
                          onFocus={(event) => event.currentTarget.select()}
                          className="w-full min-w-0 flex-1 bg-transparent px-3 py-2.5 font-mono text-sm text-ink outline-none"
                        />
                        <button
                          type="button"
                          onClick={copyCode}
                          aria-label="Copy code"
                          className="flex items-center px-3 text-navy/55 transition hover:text-navy dark:text-wheat/55 dark:hover:text-wheat"
                        >
                          {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
                        </button>
                      </div>
                    ) : null}

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      {code ? (
                        <button
                          type="button"
                          onClick={confirmVerification}
                          disabled={working !== null}
                          className={primaryButtonClassName}
                        >
                          {working === "confirm" ? (
                            <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                          ) : (
                            <Check aria-hidden="true" className="size-4" />
                          )}
                          {working === "confirm" ? "Checking your bio" : "Verify"}
                        </button>
                      ) : (
                        <button
                          type="button"
                          onClick={requestCode}
                          disabled={working !== null}
                          className={primaryButtonClassName}
                        >
                          {working === "code" ? <Loader2 aria-hidden="true" className="size-4 animate-spin" /> : null}
                          Get my code
                        </button>
                      )}
                    </div>
                  </>
                ) : !scan ? (
                  <>
                    <p className={mutedTextClassName}>
                      We&apos;ll read the public projects on{" "}
                      <span className="font-semibold">devpost.com/{initialState.handle}</span> and find the hackathons you
                      submitted to — including the ones you won. You choose exactly what gets added before anything is
                      saved.
                    </p>
                    <div className="mt-5">
                      <button type="button" onClick={runScan} disabled={working !== null} className={primaryButtonClassName}>
                        {working === "scan" ? (
                          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                        ) : (
                          <ScanSearch aria-hidden="true" className="size-4" />
                        )}
                        {working === "scan" ? "Reading your Devpost profile" : "Scan my Devpost"}
                      </button>
                    </div>
                    {working === "scan" ? (
                      <p className="mt-3 text-xs text-navy/50 dark:text-wheat/50">
                        Reading each project page — this can take up to half a minute.
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className={mutedTextClassName}>
                      Found <span className="font-semibold">{scan.items.length}</span> hackathon{" "}
                      {scan.items.length === 1 ? "entry" : "entries"} across {scan.projectCount}{" "}
                      {scan.projectCount === 1 ? "project" : "projects"}. Untick anything you don&apos;t want on your
                      profile.
                      {scan.truncated ? " Only the first 40 projects were scanned." : ""}
                    </p>

                    <ul className="mt-4 space-y-2">
                      {scan.items.map((item) => {
                        const dateLabel = formatItemDate(item.submittedAt);

                        return (
                          <li key={item.id}>
                            <label className="flex cursor-pointer items-start gap-3 rounded-xl border border-navy/10 px-3 py-2.5 transition hover:bg-navy/[0.03] dark:border-white/10 dark:hover:bg-white/5">
                              <input
                                type="checkbox"
                                checked={selected.has(item.id)}
                                onChange={() => toggleItem(item.id)}
                                className="mt-1 size-4 accent-pine"
                              />
                              <span className="min-w-0">
                                <span className="flex flex-wrap items-center gap-2 text-sm font-semibold text-ink">
                                  {item.hackathonName}
                                  {item.isWin ? (
                                    <span className="inline-flex items-center gap-1 rounded-full bg-pine/10 px-2 py-0.5 text-xs font-semibold text-pine dark:bg-wheat/10 dark:text-wheat">
                                      <Trophy aria-hidden="true" className="size-3" />
                                      {item.awards[0] ?? "Winner"}
                                    </span>
                                  ) : null}
                                </span>
                                <span className="mt-0.5 block text-xs text-navy/55 dark:text-wheat/55">
                                  {item.projectTitle}
                                  {dateLabel ? ` · ${dateLabel}` : ""}
                                  {item.alreadyTracked
                                    ? " · already on your profile"
                                    : item.matchedHackathon
                                      ? ""
                                      : " · new listing will be created"}
                                </span>
                              </span>
                            </label>
                          </li>
                        );
                      })}
                    </ul>

                    <div className="mt-5 flex flex-wrap items-center gap-3">
                      <button
                        type="button"
                        onClick={runImport}
                        disabled={working !== null || selected.size === 0}
                        className={primaryButtonClassName}
                      >
                        {working === "import" ? (
                          <Loader2 aria-hidden="true" className="size-4 animate-spin" />
                        ) : (
                          <Download aria-hidden="true" className="size-4" />
                        )}
                        {working === "import"
                          ? "Importing"
                          : `Import ${selected.size} ${selected.size === 1 ? "entry" : "entries"}`}
                      </button>
                      <button
                        type="button"
                        onClick={() => setScan(null)}
                        disabled={working !== null}
                        className={secondaryButtonClassName}
                      >
                        Back
                      </button>
                    </div>
                  </>
                )}

                {error ? <p className="mt-4 text-sm font-semibold text-[#B42318]">{error}</p> : null}
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
