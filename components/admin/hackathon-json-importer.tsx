"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, RotateCcw, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { HackathonCardPreview, HackathonPayloadDetails, type PreviewPayload } from "@/components/admin/hackathon-card-preview";

type DiscordPreview =
  | { eligible: false }
  | {
      action: "create" | "recycle";
      category: "canada" | "past" | "us";
      categoryName: string;
      eligible: true;
      existingChannelName: string | null;
      name: string;
    };

type EligibleDiscordPreview = Extract<DiscordPreview, { eligible: true }>;

type ImportResult = {
  discord?: DiscordPreview;
  duplicateScore: number;
  externalId?: string;
  hackathonId?: string;
  index: number;
  matchedHackathonId?: string;
  matchedName?: string | null;
  name: string;
  status: "imported" | "duplicate_flagged";
  submissionId?: string;
};

type DiscordSyncResult =
  | { action: "created" | "recycled"; categoryName: string; channelSnowflake: string; name: string; status: "synced" }
  | { reason?: string; status: "denied" | "skipped" };

type DiscordDecisionResponse = {
  data?: DiscordSyncResult;
  error?: unknown;
};

type ImportResponse = {
  data?: {
    duplicateCount: number;
    importedCount: number;
    results: ImportResult[];
    total: number;
  };
  error?: unknown;
};

const sampleJson = `[
  {
    "name": "Waterloo Build Weekend",
    "organizationName": "Waterloo Builders",
    "websiteUrl": "https://example.com",
    "imageUrl": "https://images.unsplash.com/photo-1517048676732-d65bc937f952",
    "sourceUrl": "https://example.com/event",
    "source": "mlh",
    "country": "Canada",
    "startDate": "2026-09-12",
    "endDate": "2026-09-14",
    "format": "in_person",
    "highSchoolersOnly": true,
    "shortDescription": "A weekend hackathon for students building useful software."
  }
]`;

function stringifyError(error: unknown) {
  return typeof error === "string" ? error : JSON.stringify(error, null, 2);
}

export function HackathonJsonImporter() {
  const router = useRouter();
  const [jsonText, setJsonText] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [queue, setQueue] = useState<PreviewPayload[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [pendingDiscord, setPendingDiscord] = useState<{ discord: EligibleDiscordPreview; hackathonId: string } | null>(null);
  const [pendingDuplicate, setPendingDuplicate] = useState<{ matchedName: string | null; duplicateScore: number } | null>(null);
  const [discordBusy, setDiscordBusy] = useState(false);

  const activePayload = queue[currentIndex];
  const remainingCount = Math.max(queue.length - currentIndex, 0);

  function payloadsFromJson(value: unknown) {
    if (Array.isArray(value)) {
      return value as PreviewPayload[];
    }

    if (value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).hackathons)) {
      return (value as { hackathons: PreviewPayload[] }).hackathons;
    }

    return [];
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setStatus("idle");
    setMessage(null);
    setResults([]);
    setSkippedCount(0);
    setCurrentIndex(0);
    setPendingDiscord(null);
    setPendingDuplicate(null);

    let parsed: unknown;

    try {
      parsed = JSON.parse(jsonText);
    } catch {
      setStatus("error");
      setMessage("Invalid JSON.");
      return;
    }

    const payloads = payloadsFromJson(parsed);

    if (!payloads.length) {
      setStatus("error");
      setMessage("JSON must be an array of hackathons or an object with a hackathons array.");
      return;
    }

    setQueue(payloads);
    setMessage(`${payloads.length} cards ready to review.`);
  }

  async function runImport(options?: { ignoreDuplicates?: boolean }) {
    if (!activePayload) {
      return;
    }

    setStatus("submitting");
    setMessage(null);
    setPendingDuplicate(null);

    const response = await fetch("/api/admin/hackathon-imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The bare array is the normal import; the wrapped form carries the override that
      // republishes a flagged card as a brand-new hackathon.
      body: JSON.stringify(
        options?.ignoreDuplicates ? { hackathons: [activePayload], ignoreDuplicates: true } : [activePayload]
      ),
    });
    const body = (await response.json()) as ImportResponse;

    if (!response.ok || !body.data) {
      setStatus("error");
      setMessage(body.error ? stringifyError(body.error) : "Import failed.");
      return;
    }

    const data = body.data;
    // Only genuinely imported cards count toward the approved tally; a flagged duplicate is
    // resolved inline and never lands in the results list.
    setResults((current) => [...current, ...data.results.filter((result) => result.status === "imported")]);
    router.refresh();

    const first = data.results[0];

    // A likely duplicate pauses here so the admin can decide right away instead of hunting
    // for it in the Submissions queue later.
    if (first?.status === "duplicate_flagged") {
      setStatus("idle");
      setMessage(null);
      setPendingDuplicate({ matchedName: first.matchedName ?? null, duplicateScore: first.duplicateScore });
      return;
    }

    // Canadian/US events pause here for a separate Discord channel decision. The
    // channel is not created until the admin approves it in decideDiscord.
    if (first?.status === "imported" && first.hackathonId && first.discord?.eligible) {
      setStatus("idle");
      setMessage(null);
      setPendingDiscord({ discord: first.discord, hackathonId: first.hackathonId });
      return;
    }

    setStatus("success");
    setMessage("Imported. Not a Canada/US event, so no Discord channel is offered.");
    setCurrentIndex((current) => current + 1);
  }

  function dismissDuplicate() {
    setPendingDuplicate(null);
    setSkippedCount((current) => current + 1);
    setCurrentIndex((current) => current + 1);
    setStatus("success");
    setMessage("Skipped the duplicate. Nothing was queued.");
  }

  async function decideDiscord(action: "approve" | "deny") {
    if (!pendingDiscord) {
      return;
    }

    setDiscordBusy(true);
    setMessage(null);

    const response = await fetch(`/api/admin/hackathons/${pendingDiscord.hackathonId}/discord-channel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action }),
    });
    const body = (await response.json()) as DiscordDecisionResponse;
    setDiscordBusy(false);

    if (!response.ok || !body.data) {
      setStatus("error");
      setMessage(body.error ? stringifyError(body.error) : "Discord channel action failed.");
      return;
    }

    const result = body.data;
    setStatus("success");

    if ("action" in result) {
      setMessage(
        result.action === "created"
          ? `Created a new channel #${result.name} in ${result.categoryName}.`
          : `Recycled the existing channel as #${result.name} in ${result.categoryName}.`
      );
    } else if (result.status === "denied") {
      setMessage("Discord channel denied. The hackathon stays published without one.");
    } else {
      setMessage(result.reason ?? "No Discord channel was created.");
    }

    setPendingDiscord(null);
    setCurrentIndex((current) => current + 1);
  }

  function skipActive() {
    setSkippedCount((current) => current + 1);
    setCurrentIndex((current) => current + 1);
    setStatus("idle");
    setMessage("Skipped.");
  }

  function resetImport() {
    setQueue([]);
    setCurrentIndex(0);
    setResults([]);
    setSkippedCount(0);
    setStatus("idle");
    setMessage(null);
    setPendingDiscord(null);
    setPendingDuplicate(null);
  }

  if (queue.length) {
    const complete = !activePayload;

    return (
      <div className="space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rust">Bulk import</p>
            <h2 className="mt-2 text-2xl font-semibold text-navy dark:text-wheat">{complete ? "Import review complete" : "Approve imported card"}</h2>
            <p className="mt-2 text-sm text-navy/55 dark:text-wheat/55">
              {complete
                ? `${results.length} approved, ${skippedCount} skipped.`
                : `${remainingCount} remaining · ${results.length} approved · ${skippedCount} skipped`}
            </p>
          </div>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-navy/15 dark:border-white/15 px-4 text-sm font-semibold text-navy dark:text-wheat hover:bg-ivory dark:hover:bg-white/10"
            onClick={resetImport}
            type="button"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            New import
          </button>
        </div>

        {activePayload ? (
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_16rem]">
            <div className="space-y-5">
              <HackathonCardPreview payload={activePayload} previewId={`import-preview-${currentIndex}`} />
              <HackathonPayloadDetails payload={activePayload} />
            </div>
            {pendingDuplicate ? (
              <div className="flex flex-col justify-between rounded-xl border border-[#B54708]/30 bg-[#FFFAEB] dark:border-[#f5b678]/40 dark:bg-[#f5b678]/10 p-4">
                <div>
                  <p className="text-sm font-semibold text-navy dark:text-wheat">Possible duplicate</p>
                  <p className="mt-2 text-sm leading-6 text-navy/55 dark:text-wheat/55">
                    This matches{" "}
                    <span className="font-semibold text-navy dark:text-wheat">
                      {pendingDuplicate.matchedName ?? "an existing hackathon"}
                    </span>{" "}
                    on both name and start date (match {pendingDuplicate.duplicateScore.toFixed(2)}). Import it as a
                    separate hackathon anyway, or skip it. Nothing is queued either way.
                  </p>
                </div>
                <div className="mt-5 grid gap-3">
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#027A48] px-4 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={status === "submitting"}
                    onClick={() => runImport({ ignoreDuplicates: true })}
                    type="button"
                  >
                    <Check aria-hidden="true" className="size-4" />
                    Import as new anyway
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#B42318] px-4 text-sm font-semibold text-[#B42318] disabled:opacity-50"
                    disabled={status === "submitting"}
                    onClick={dismissDuplicate}
                    type="button"
                  >
                    <X aria-hidden="true" className="size-4" />
                    Skip
                  </button>
                </div>
              </div>
            ) : pendingDiscord && pendingDiscord.discord.action !== "create" ? (
              <div className="flex flex-col justify-between rounded-xl border border-cabernet/20 dark:border-[#e4a3ab]/40 bg-cabernet/5 dark:bg-[#e4a3ab]/10 p-4">
                <div>
                  <p className="text-sm font-semibold text-navy dark:text-wheat">Create a Discord channel?</p>
                  <p className="mt-2 text-sm leading-6 text-navy/55 dark:text-wheat/55">
                    Imported. This qualifies for the{" "}
                    <span className="font-semibold text-navy dark:text-wheat">{pendingDiscord.discord.categoryName}</span> category.
                    Approving will recycle the existing{" "}
                    <span className="font-semibold text-navy dark:text-wheat">#{pendingDiscord.discord.existingChannelName}</span>{" "}
                    channel named <span className="font-semibold text-navy dark:text-wheat">#{pendingDiscord.discord.name}</span> and
                    place it there. Deny keeps the hackathon published without a channel.
                  </p>
                </div>
                <div className="mt-5 grid gap-3">
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#027A48] px-4 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={discordBusy}
                    onClick={() => decideDiscord("approve")}
                    type="button"
                  >
                    <Check aria-hidden="true" className="size-4" />
                    Approve channel
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#B42318] px-4 text-sm font-semibold text-[#B42318] disabled:opacity-50"
                    disabled={discordBusy}
                    onClick={() => decideDiscord("deny")}
                    type="button"
                  >
                    <X aria-hidden="true" className="size-4" />
                    Deny channel
                  </button>
                </div>
              </div>
            ) : pendingDiscord ? null : (
              <div className="flex flex-col justify-between rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 p-4">
                <div>
                  <p className="text-sm font-semibold text-navy dark:text-wheat">Does this card look right?</p>
                  <p className="mt-2 text-sm leading-6 text-navy/55 dark:text-wheat/55">
                    Yes imports this record. No skips it and shows the next card.
                  </p>
                </div>
                <div className="mt-5 grid gap-3">
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-[#027A48] px-4 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={status === "submitting"}
                    onClick={() => runImport()}
                    type="button"
                  >
                    <Check aria-hidden="true" className="size-4" />
                    Yes
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-[#B42318] px-4 text-sm font-semibold text-[#B42318] disabled:opacity-50"
                    disabled={status === "submitting"}
                    onClick={skipActive}
                    type="button"
                  >
                    <X aria-hidden="true" className="size-4" />
                    No
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : null}

        {pendingDiscord && pendingDiscord.discord.action === "create" ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
            <div className="w-full max-w-2xl rounded-2xl border border-cabernet/20 dark:border-[#e4a3ab]/40 bg-white dark:bg-[#141414] p-8 shadow-2xl sm:p-12">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rust">New Discord channel</p>
              <h2 className="mt-3 text-3xl font-semibold text-navy dark:text-wheat">Create a Discord channel?</h2>
              <p className="mt-4 text-base leading-7 text-navy/55 dark:text-wheat/55">
                Imported. This qualifies for the{" "}
                <span className="font-semibold text-navy dark:text-wheat">{pendingDiscord.discord.categoryName}</span> category.
                Approving will create a new channel named{" "}
                <span className="font-semibold text-navy dark:text-wheat">#{pendingDiscord.discord.name}</span> and place it there.
                Deny keeps the hackathon published without a channel.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-[#027A48] px-4 text-base font-semibold text-white disabled:opacity-50"
                  disabled={discordBusy}
                  onClick={() => decideDiscord("approve")}
                  type="button"
                >
                  <Check aria-hidden="true" className="size-5" />
                  Approve channel
                </button>
                <button
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border border-[#B42318] px-4 text-base font-semibold text-[#B42318] disabled:opacity-50"
                  disabled={discordBusy}
                  onClick={() => decideDiscord("deny")}
                  type="button"
                >
                  <X aria-hidden="true" className="size-5" />
                  Deny channel
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {message ? (
          <div
            className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${
              status === "error"
                ? "border-[#B42318]/30 bg-[#FEF3F2] text-[#B42318]"
                : "border-[#027A48]/25 bg-[#ECFDF3] text-[#027A48]"
            }`}
          >
            {status === "error" ? (
              <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            ) : (
              <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            )}
            <pre className="whitespace-pre-wrap font-sans">{message}</pre>
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rust">Bulk import</p>
          <h2 className="mt-2 text-2xl font-semibold text-navy dark:text-wheat">Scraped hackathons JSON</h2>
        </div>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-cabernet hover:bg-[#5c151c] px-4 text-sm font-semibold text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white disabled:opacity-50"
          disabled={status === "submitting" || !jsonText.trim()}
          type="submit"
        >
          <Upload aria-hidden="true" className="size-4" />
          {status === "submitting" ? "Importing" : "Import JSON"}
        </button>
      </div>

      <textarea
        aria-label="Hackathon import JSON"
        className="min-h-72 w-full rounded-xl border border-navy/15 dark:border-white/15 bg-ivory dark:bg-white/5 p-4 font-mono text-xs leading-5 text-navy dark:text-wheat outline-none focus:border-cabernet focus:ring-2 focus:ring-cabernet/15"
        onChange={(event) => setJsonText(event.target.value)}
        placeholder={sampleJson}
        spellCheck={false}
        value={jsonText}
      />

      {message ? (
        <div
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${
            status === "error"
              ? "border-[#B42318]/30 bg-[#FEF3F2] text-[#B42318]"
              : "border-[#027A48]/25 bg-[#ECFDF3] text-[#027A48]"
          }`}
        >
          {status === "error" ? (
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          ) : (
            <CheckCircle2 aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
          )}
          <pre className="whitespace-pre-wrap font-sans">{message}</pre>
        </div>
      ) : null}

      {results.length ? (
        <div className="overflow-hidden rounded-xl border border-navy/10 dark:border-white/10">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-navy/55 dark:text-wheat/55">
            <span>Name</span>
            <span>Status</span>
            <span>Duplicate</span>
          </div>
          <div className="divide-y divide-navy/10 dark:divide-white/10 bg-white dark:bg-white/[0.06]">
            {results.map((result) => (
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 text-sm" key={`${result.status}-${result.submissionId}`}>
                <span className="font-semibold text-navy dark:text-wheat">{result.name}</span>
                <span className={result.status === "imported" ? "text-[#027A48]" : "text-[#B54708]"}>
                  {result.status === "imported" ? "Imported" : "Flagged"}
                </span>
                <span className="text-navy/55 dark:text-wheat/55">{result.duplicateScore.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </form>
  );
}
