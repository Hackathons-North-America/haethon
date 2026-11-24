"use client";

import { FormEvent, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Pencil, RotateCcw, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { HackathonCardPreview, HackathonPayloadDetails, type PreviewPayload } from "@/components/admin/hackathon-card-preview";
import { HackathonImportEditDialog } from "@/components/admin/hackathon-import-edit-dialog";

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

type DiscordSyncResult =
  | { action: "created" | "recycled"; categoryName: string; channelSnowflake: string; name: string; status: "synced" }
  | { reason?: string; status: "denied" | "skipped" };

// The Discord step the server runs on its own for an auto-approved row.
type AutoDiscordSync = DiscordSyncResult | { channelSnowflake: string; status: "unchanged" } | { status: "failed" };

type ImportResult = {
  autoApprove?: boolean;
  discord?: DiscordPreview;
  discordSync?: AutoDiscordSync;
  duplicateScore: number;
  externalId?: string;
  hackathonId?: string;
  index: number;
  matchedHackathonId?: string;
  matchedName?: string | null;
  name: string;
  status: "imported" | "duplicate_flagged" | "auto_merged" | "updated";
  submissionId?: string;
  updatedFields?: string[];
};

type DiscordDecisionResponse = {
  data?: DiscordSyncResult;
  error?: unknown;
};

type ImportResponse = {
  data?: {
    duplicateCount: number;
    importedCount: number;
    mergedCount: number;
    updatedCount: number;
    results: ImportResult[];
    total: number;
  };
  error?: unknown;
};

type DuplicateMatch = { duplicateScore: number; matchedName: string | null };

// One card waiting for the admin. Auto-approved rows only land here when the
// automatic pass could not finish them: a likely duplicate (decided by the
// admin, as for any row) or a request that failed.
type QueueItem = { duplicate?: DuplicateMatch; error?: string; payload: PreviewPayload };

type AutoRun = { done: number; failed: number; flagged: number; results: ImportResult[]; total: number };

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
    "autoApprove": false,
    "shortDescription": "A weekend hackathon for students building useful software."
  }
]`;

function feedFieldLabel(field: string) {
  return field.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function stringifyError(error: unknown) {
  return typeof error === "string" ? error : JSON.stringify(error, null, 2);
}

function isAutoApproved(payload: PreviewPayload) {
  // Older scraper output has no flag, which means the admin reviews the card.
  return payload.autoApprove === true;
}

function discordSyncNote(sync: AutoDiscordSync | undefined) {
  if (!sync) {
    return null;
  }

  switch (sync.status) {
    case "synced":
      return sync.action === "created"
        ? `Created Discord channel #${sync.name} in ${sync.categoryName}.`
        : `Reused the existing Discord channel as #${sync.name} in ${sync.categoryName}.`;
    case "unchanged":
      return "Kept its existing Discord channel.";
    case "failed":
      return "The Discord channel could not be set up. The daily Discord sync will try again.";
    case "skipped":
      return sync.reason ?? "No Discord channel.";
    default:
      return null;
  }
}

function importStatusLabel(status: ImportResult["status"]) {
  switch (status) {
    case "imported":
      return "Imported";
    case "auto_merged":
      return "Merged";
    case "updated":
      return "Updated";
    default:
      return "Flagged";
  }
}

async function postImport(payload: PreviewPayload, options?: { ignoreDuplicates?: boolean }) {
  try {
    const response = await fetch("/api/admin/hackathon-imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      // The bare array is the normal import; the wrapped form carries the override that
      // republishes a flagged card as a brand-new hackathon.
      body: JSON.stringify(options?.ignoreDuplicates ? { hackathons: [payload], ignoreDuplicates: true } : [payload]),
    });
    const body = (await response.json().catch(() => ({}))) as ImportResponse;

    return response.ok && body.data
      ? { data: body.data, ok: true as const }
      : { error: body.error ? stringifyError(body.error) : "Import failed.", ok: false as const };
  } catch {
    return { error: "Import failed. Check your connection and try again.", ok: false as const };
  }
}

export function HackathonJsonImporter() {
  const router = useRouter();
  const [jsonText, setJsonText] = useState("");
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [results, setResults] = useState<ImportResult[]>([]);
  const [skippedCount, setSkippedCount] = useState(0);
  const [autoRun, setAutoRun] = useState<AutoRun | null>(null);
  const [pendingDiscord, setPendingDiscord] = useState<{ discord: EligibleDiscordPreview; hackathonId: string } | null>(null);
  const [pendingDuplicate, setPendingDuplicate] = useState<DuplicateMatch | null>(null);
  const [discordBusy, setDiscordBusy] = useState(false);
  const [editing, setEditing] = useState(false);

  const activeItem = queue[currentIndex];
  const activePayload = activeItem?.payload;
  // A duplicate found during the automatic pass is shown as soon as its card comes up.
  const duplicateMatch = pendingDuplicate ?? activeItem?.duplicate ?? null;
  const autoRunning = autoRun !== null && autoRun.done < autoRun.total;
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
    setAutoRun(null);
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

    const autoPayloads = payloads.filter(isAutoApproved);
    const manualItems: QueueItem[] = payloads.filter((payload) => !isAutoApproved(payload)).map((payload) => ({ payload }));

    if (!autoPayloads.length) {
      setQueue(manualItems);
      setMessage(`${payloads.length} cards ready to review.`);
      return;
    }

    // Auto-approved cards need no yes or no, so they are imported first, before
    // any card is shown. The server also makes or reuses each Canadian or US
    // event's Discord channel. One card per request keeps every request well
    // inside the route's time limit, even when a channel has to be created.
    setStatus("submitting");
    const run: AutoRun = { done: 0, failed: 0, flagged: 0, results: [], total: autoPayloads.length };
    const leftovers: QueueItem[] = [];
    setAutoRun({ ...run });

    for (const payload of autoPayloads) {
      const outcome = await postImport(payload);

      if (!outcome.ok) {
        run.failed += 1;
        leftovers.push({ error: outcome.error, payload });
      } else {
        for (const result of outcome.data.results) {
          if (result.status === "duplicate_flagged") {
            // Auto-approval answers "is this real?", not "is this already here?".
            run.flagged += 1;
            leftovers.push({
              duplicate: { duplicateScore: result.duplicateScore, matchedName: result.matchedName ?? null },
              payload,
            });
          } else {
            run.results.push(result);
          }
        }
      }

      run.done += 1;
      setAutoRun({ ...run, results: [...run.results] });
    }

    const toReview = leftovers.length + manualItems.length;
    setResults(run.results);
    setQueue([...leftovers, ...manualItems]);
    setStatus("success");
    setMessage(
      `Auto-approved ${run.results.length} of ${run.total} cards. ${toReview ? `${toReview} left to review.` : "Nothing left to review."}`
    );
    router.refresh();
  }

  async function runImport(options?: { ignoreDuplicates?: boolean }) {
    if (!activePayload) {
      return;
    }

    setStatus("submitting");
    setMessage(null);
    setPendingDuplicate(null);

    const outcome = await postImport(activePayload, options);

    if (!outcome.ok) {
      setStatus("error");
      setMessage(outcome.error);
      return;
    }

    const data = outcome.data;
    // Imported and auto-merged cards land in the results list; a flagged duplicate is
    // resolved inline and never does.
    setResults((current) => [...current, ...data.results.filter((result) => result.status !== "duplicate_flagged")]);
    router.refresh();

    const first = data.results[0];
    // Set when the card was auto-approved: the server already handled its channel.
    const discordNote = discordSyncNote(first?.discordSync);
    const withDiscordNote = (text: string) => (discordNote ? `${text} ${discordNote}` : text);

    // A clear match was merged server-side into the existing hackathon — nothing to decide.
    if (first?.status === "auto_merged") {
      setStatus("success");
      setMessage(
        withDiscordNote(
          `Merged into the existing hackathon ${first.matchedName ? `"${first.matchedName}"` : ""} (match ${first.duplicateScore.toFixed(2)}). Missing details were filled in from this card.`
        )
      );
      setCurrentIndex((current) => current + 1);
      return;
    }

    // The scraper sent this event before (same feed id): it was updated in place.
    if (first?.status === "updated") {
      const target = first.matchedName ? `"${first.matchedName}"` : "the existing hackathon";
      setStatus("success");
      setMessage(
        withDiscordNote(
          first.updatedFields?.length
            ? `Already imported as ${target}. Updated what the feed changed since the last import: ${first.updatedFields.map(feedFieldLabel).join(", ")}.`
            : `Already imported as ${target}. Nothing changed in the feed since the last import.`
        )
      );
      setCurrentIndex((current) => current + 1);
      return;
    }

    // A likely duplicate pauses here so the admin can decide right away instead of hunting
    // for it in the Submissions queue later.
    if (first?.status === "duplicate_flagged") {
      setStatus("idle");
      setMessage(null);
      setPendingDuplicate({ matchedName: first.matchedName ?? null, duplicateScore: first.duplicateScore });
      return;
    }

    // An auto-approved card lands here after a duplicate check or a failed
    // request. It needs no channel decision either.
    if (first?.status === "imported" && first.discordSync) {
      setStatus("success");
      setMessage(withDiscordNote("Imported."));
      setCurrentIndex((current) => current + 1);
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

  function applyEdits(updated: PreviewPayload) {
    // Edits can change the name or date, so an earlier duplicate match or error
    // no longer applies; the card goes back to a plain yes or no.
    setQueue((current) => current.map((item, index) => (index === currentIndex ? { payload: updated } : item)));
    setEditing(false);
    setStatus("success");
    setMessage("Card updated. Review it again, then choose yes or no.");
  }

  function resetImport() {
    setQueue([]);
    setCurrentIndex(0);
    setResults([]);
    setSkippedCount(0);
    setAutoRun(null);
    setStatus("idle");
    setMessage(null);
    setPendingDiscord(null);
    setPendingDuplicate(null);
    setEditing(false);
  }

  if (queue.length || autoRun) {
    const complete = !activePayload && !autoRunning;
    const importedCount = results.filter((result) => result.status === "imported").length;
    const updatedCount = results.filter((result) => result.status === "updated").length;
    const mergedCount = results.length - importedCount - updatedCount;

    return (
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pine">Bulk import</p>
            <h2 className="mt-1 text-2xl font-semibold text-ink">
              {autoRunning ? "Importing auto-approved cards" : complete ? "Import review complete" : "Approve imported card"}
            </h2>
            <p className="mt-1 text-sm text-ink/55">
              {autoRunning && autoRun
                ? `${autoRun.done} of ${autoRun.total} done`
                : complete
                ? `${importedCount} approved, ${mergedCount} merged, ${updatedCount} updated, ${skippedCount} skipped.`
                : `${remainingCount} remaining · ${importedCount} approved · ${mergedCount} merged · ${updatedCount} updated · ${skippedCount} skipped`}
            </p>
          </div>
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink/15 px-4 text-sm font-semibold text-ink hover:bg-paper disabled:opacity-50"
            disabled={autoRunning}
            onClick={resetImport}
            type="button"
          >
            <RotateCcw aria-hidden="true" className="size-4" />
            New import
          </button>
        </div>

        {autoRun ? <AutoRunSummary run={autoRun} running={autoRunning} /> : null}

        {activePayload && !autoRunning ? (
          <div className="grid gap-4 xl:grid-cols-[minmax(0,42rem)_18rem] xl:items-start xl:justify-between">
            <div className="space-y-4">
              <HackathonCardPreview compact payload={activePayload} previewId={`import-preview-${currentIndex}`} />
              <HackathonPayloadDetails payload={activePayload} />
            </div>
            {duplicateMatch ? (
              <div className="order-first flex flex-col rounded-xl border border-warning/30 bg-warning-soft p-4 xl:order-none xl:sticky xl:top-4">
                <div>
                  <p className="text-sm font-semibold text-ink">Possible duplicate</p>
                  <p className="mt-2 text-sm leading-6 text-ink/55">
                    This matches{" "}
                    <span className="font-semibold text-ink">
                      {duplicateMatch.matchedName ?? "an existing hackathon"}
                    </span>{" "}
                    on both name and start date (match {duplicateMatch.duplicateScore.toFixed(2)}). Import it as a
                    separate hackathon anyway, or skip it. Nothing is queued either way.
                  </p>
                </div>
                <div className="mt-5 grid gap-3">
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-pine px-4 text-sm font-semibold text-paper disabled:opacity-50"
                    disabled={status === "submitting"}
                    onClick={() => runImport({ ignoreDuplicates: true })}
                    type="button"
                  >
                    <Check aria-hidden="true" className="size-4" />
                    Import as new anyway
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-danger px-4 text-sm font-semibold text-danger disabled:opacity-50"
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
              <div className="order-first flex flex-col rounded-xl border border-pine/20 bg-pine/5 p-4 xl:order-none xl:sticky xl:top-4">
                <div>
                  <p className="text-sm font-semibold text-ink">Create a Discord channel?</p>
                  <p className="mt-2 text-sm leading-6 text-ink/55">
                    Imported. This qualifies for the{" "}
                    <span className="font-semibold text-ink">{pendingDiscord.discord.categoryName}</span> category.
                    Approving will recycle the existing{" "}
                    <span className="font-semibold text-ink">#{pendingDiscord.discord.existingChannelName}</span>{" "}
                    channel named <span className="font-semibold text-ink">#{pendingDiscord.discord.name}</span> and
                    place it there. Deny keeps the hackathon published without a channel.
                  </p>
                </div>
                <div className="mt-5 grid gap-3">
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-pine px-4 text-sm font-semibold text-paper disabled:opacity-50"
                    disabled={discordBusy}
                    onClick={() => decideDiscord("approve")}
                    type="button"
                  >
                    <Check aria-hidden="true" className="size-4" />
                    Approve channel
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-danger px-4 text-sm font-semibold text-danger disabled:opacity-50"
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
              <div className="order-first flex flex-col rounded-xl border border-ink/10 bg-paper p-4 xl:order-none xl:sticky xl:top-4">
                <div>
                  <p className="text-sm font-semibold text-ink">Does this card look right?</p>
                  {activeItem?.error ? (
                    <p className="mt-2 text-sm leading-6 text-danger">
                      This card was auto-approved, but importing it failed: {activeItem.error}
                    </p>
                  ) : null}
                  <p className="mt-2 text-sm leading-6 text-ink/55">
                    Yes imports this record. No skips it and shows the next card. Edit card fixes details, tags, or location before importing.
                  </p>
                </div>
                <div className="mt-5 grid gap-3">
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-pine px-4 text-sm font-semibold text-paper disabled:opacity-50"
                    disabled={status === "submitting"}
                    onClick={() => runImport()}
                    type="button"
                  >
                    <Check aria-hidden="true" className="size-4" />
                    Yes
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-ink/15 px-4 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-50"
                    disabled={status === "submitting"}
                    onClick={() => setEditing(true)}
                    type="button"
                  >
                    <Pencil aria-hidden="true" className="size-4" />
                    Edit card
                  </button>
                  <button
                    className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-danger px-4 text-sm font-semibold text-danger disabled:opacity-50"
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

        {editing && activePayload ? (
          <HackathonImportEditDialog onClose={() => setEditing(false)} onSave={applyEdits} payload={activePayload} />
        ) : null}

        {pendingDiscord && pendingDiscord.discord.action === "create" ? (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
            <div className="w-full max-w-2xl rounded-2xl border border-pine/20 bg-surface p-8 shadow-2xl sm:p-12">
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pine">New Discord channel</p>
              <h2 className="mt-3 text-3xl font-semibold text-ink">Create a Discord channel?</h2>
              <p className="mt-4 text-base leading-7 text-ink/55">
                Imported. This qualifies for the{" "}
                <span className="font-semibold text-ink">{pendingDiscord.discord.categoryName}</span> category.
                Approving will create a new channel named{" "}
                <span className="font-semibold text-ink">#{pendingDiscord.discord.name}</span> and place it there.
                Deny keeps the hackathon published without a channel.
              </p>
              <div className="mt-8 flex flex-col gap-3 sm:flex-row">
                <button
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-pine px-4 text-base font-semibold text-paper disabled:opacity-50"
                  disabled={discordBusy}
                  onClick={() => decideDiscord("approve")}
                  type="button"
                >
                  <Check aria-hidden="true" className="size-5" />
                  Approve channel
                </button>
                <button
                  className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border border-danger px-4 text-base font-semibold text-danger disabled:opacity-50"
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
                ? "border-danger/30 bg-danger-soft text-danger"
                : "border-pine/25 bg-pine-soft text-pine"
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
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pine">Bulk import</p>
          <h2 className="mt-2 text-2xl font-semibold text-ink">Scraped hackathons JSON</h2>
        </div>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-pine hover:bg-pine/90 px-4 text-sm font-semibold text-paper disabled:opacity-50"
          disabled={status === "submitting" || !jsonText.trim()}
          type="submit"
        >
          <Upload aria-hidden="true" className="size-4" />
          {status === "submitting" ? "Importing" : "Import JSON"}
        </button>
      </div>

      <textarea
        aria-label="Hackathon import JSON"
        className="min-h-72 w-full rounded-xl border border-ink/15 bg-paper p-4 font-mono text-xs leading-5 text-ink outline-none focus:border-pine focus:ring-2 focus:ring-pine/15"
        onChange={(event) => setJsonText(event.target.value)}
        placeholder={sampleJson}
        spellCheck={false}
        value={jsonText}
      />

      {message ? (
        <div
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${
            status === "error"
              ? "border-danger/30 bg-danger-soft text-danger"
              : "border-pine/25 bg-pine-soft text-pine"
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
        <div className="overflow-hidden rounded-xl border border-ink/10">
          <div className="grid grid-cols-[1fr_auto_auto] gap-3 border-b border-ink/10 bg-paper px-4 py-2 text-xs font-semibold uppercase tracking-[0.14em] text-ink/55">
            <span>Name</span>
            <span>Status</span>
            <span>Duplicate</span>
          </div>
          <div className="divide-y divide-ink/10 bg-surface">
            {results.map((result, position) => (
              // Cards are imported one at a time, so the list position is the
              // stable identity; an unchanged feed update has no submission id.
              <div className="grid grid-cols-[1fr_auto_auto] gap-3 px-4 py-3 text-sm" key={`${position}-${result.status}`}>
                <span className="font-semibold text-ink">{result.name}</span>
                <span className={result.status === "duplicate_flagged" ? "text-warning" : "text-pine"}>
                  {importStatusLabel(result.status)}
                </span>
                <span className="text-ink/55">{result.duplicateScore.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : null}
    </form>
  );
}

function AutoRunSummary({ run, running }: { run: AutoRun; running: boolean }) {
  const count = (status: ImportResult["status"]) => run.results.filter((result) => result.status === status).length;
  const syncs = run.results.map((result) => result.discordSync);
  const created = syncs.filter((sync) => sync?.status === "synced" && sync.action === "created").length;
  const reused = syncs.filter((sync) => sync?.status === "synced" && sync.action === "recycled").length;
  const kept = syncs.filter((sync) => sync?.status === "unchanged").length;
  const failed = syncs.filter((sync) => sync?.status === "failed").length;
  const progress = run.total ? Math.round((run.done / run.total) * 100) : 100;

  return (
    <div className="rounded-xl border border-pine/20 bg-pine/5 p-4">
      <p className="text-sm font-semibold text-ink">
        {running ? `Auto-approving ${run.done} of ${run.total} cards` : `Auto-approved cards: ${run.total}`}
      </p>
      {running ? (
        <div
          aria-label="Auto-approve progress"
          aria-valuemax={100}
          aria-valuemin={0}
          aria-valuenow={progress}
          className="mt-3 h-2 overflow-hidden rounded-full bg-ink/10"
          role="progressbar"
        >
          <div className="h-full bg-pine transition-[width]" style={{ width: `${progress}%` }} />
        </div>
      ) : null}
      <p className="mt-2 text-sm leading-6 text-ink/55">
        {count("imported")} published · {count("auto_merged")} merged · {count("updated")} updated ·{" "}
        {run.flagged} possible duplicates · {run.failed} failed
      </p>
      <p className="text-sm leading-6 text-ink/55">
        Discord: {created} created · {reused} reused · {kept} kept · {failed} failed
      </p>
      {!running && run.flagged + run.failed > 0 ? (
        <p className="mt-1 text-sm leading-6 text-ink/55">
          Possible duplicates and failed cards are queued below, before the cards that need a yes or no.
        </p>
      ) : null}
      {run.results.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-pine">Show each card</summary>
          <ul className="mt-2 max-h-72 divide-y divide-ink/10 overflow-y-auto rounded-lg border border-ink/10 bg-surface">
            {run.results.map((result, position) => (
              // Cards are imported one at a time, so the list position is stable.
              <li className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[1fr_auto]" key={`${position}-${result.name}`}>
                <span className="font-semibold text-ink">{result.name}</span>
                <span className="text-pine">{importStatusLabel(result.status)}</span>
                <span className="text-ink/55 sm:col-span-2">{discordSyncNote(result.discordSync)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}
