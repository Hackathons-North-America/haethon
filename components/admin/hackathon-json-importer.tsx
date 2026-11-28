"use client";

import { FormEvent, useRef, useState } from "react";
import { AlertTriangle, Check, CheckCircle2, Clock, GitMerge, Pencil, Plus, Upload, X } from "lucide-react";
import { useRouter } from "next/navigation";

import { DiscordChannelJobLine, describeDiscordChannelJob, useDiscordChannelJobs } from "@/components/admin/discord-channel-jobs";
import { HackathonCardPreview, HackathonPayloadDetails, type PreviewPayload } from "@/components/admin/hackathon-card-preview";
import { HackathonImportEditDialog } from "@/components/admin/hackathon-import-edit-dialog";
import type { ChannelDecisionCard } from "@/lib/discord/channel-decisions";
import type { ImportCardView } from "@/lib/hackathons/import-cards";

/* The import page. Its review queue is not kept here: every card that needs a
   yes or no is a row in the database (lib/hackathons/import-queue.ts), handed
   in as initialCards and changed only through the import-queue API. Closing
   the tab, or opening the page on another device, loses nothing. This
   component only remembers what is cosmetic: which card is in front, and what
   this visit has done so far.

   Once the event cards are done, the hackathons waiting on a Discord channel
   come up (initialChannelCards, lib/discord/channel-decisions.ts). Each yes
   or no is stored by the server, so those survive a closed tab too. */

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

// What approving a channel answers with: the channel itself is made after the
// response, as a queued job this page then follows.
type DiscordDecisionResult = { jobId: string; status: "queued" } | { reason?: string; status: "skipped" };

// The Discord step the server queues on its own for an auto-approved row.
type AutoDiscordSync = { jobId: string; status: "queued" };

// A channel this page asked for, by approving it or through an auto-approved row.
type ChannelRequest = { error?: string; hackathonId: string; jobId?: string; name: string; note?: string };

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
  status: "imported" | "duplicate_flagged" | "auto_merged" | "updated" | "queued" | "dismissed";
  submissionId?: string;
  updatedFields?: string[];
};

type DiscordDecisionResponse = {
  data?: DiscordDecisionResult;
  error?: unknown;
};

type ImportResponse = {
  data?: { results: ImportResult[] };
  error?: unknown;
};

type CardDecision = "approve" | "approve_new" | "merge" | "reject";

type DecisionResponse = {
  data?: { status: "rejected" } | { result: ImportResult; status: "decided" };
  details?: unknown;
  error?: unknown;
};

/* One upload, as it goes. `results` are the rows that needed nobody: they
   were published, merged or updated on the spot. */
type UploadRun = {
  dismissed: number;
  done: number;
  failed: number;
  flagged: number;
  lost: string[];
  queued: number;
  results: ImportResult[];
  total: number;
};

type Tally = { approved: number; channels: number; declined: number; merged: number; noChannel: number; updated: number };

// Rows go to the server this many at a time: the whole chunk is read and
// written in a couple of database round trips, and Discord is queued.
const IMPORT_CHUNK = 25;

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

const addedOn = new Intl.DateTimeFormat("en", { day: "numeric", month: "short", timeZone: "UTC" });

function feedFieldLabel(field: string) {
  return field.replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase();
}

function stringifyError(error: unknown) {
  return typeof error === "string" ? error : JSON.stringify(error, null, 2);
}

/* "country: Required; startDate: Invalid date" from a validation error. */
function fieldErrorSummary(details: unknown) {
  const fieldErrors =
    details && typeof details === "object" ? (details as { fieldErrors?: Record<string, string[]> }).fieldErrors : undefined;
  const parts = Object.entries(fieldErrors ?? {}).map(([field, messages]) => `${feedFieldLabel(field)}: ${messages.join(", ")}`);

  return parts.join("; ");
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
      return "Waiting";
  }
}

function payloadsFromJson(value: unknown) {
  if (Array.isArray(value)) {
    return value as PreviewPayload[];
  }

  if (value && typeof value === "object" && Array.isArray((value as Record<string, unknown>).hackathons)) {
    return (value as { hackathons: PreviewPayload[] }).hackathons;
  }

  return [];
}

function payloadName(payload: PreviewPayload) {
  return typeof payload.name === "string" && payload.name.trim() ? payload.name.trim() : "Untitled card";
}

async function postImport(payloads: PreviewPayload[]) {
  try {
    const response = await fetch("/api/admin/hackathon-imports", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payloads),
    });
    const body = (await response.json().catch(() => ({}))) as ImportResponse;

    return response.ok && body.data
      ? { data: body.data, ok: true as const }
      : { error: body.error ? stringifyError(body.error) : "Import failed.", ok: false as const };
  } catch {
    return { error: "Import failed. Check your connection and try again.", ok: false as const };
  }
}

/* A row the import refused on its own is kept as a card with the reason, so
   it can be fixed and approved later instead of being lost. */
async function saveFailedCard(payload: PreviewPayload, error: string) {
  try {
    const response = await fetch("/api/admin/import-queue", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error, payload }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

async function fetchQueue() {
  try {
    const response = await fetch("/api/admin/import-queue", { cache: "no-store" });
    const body = (await response.json().catch(() => ({}))) as {
      data?: { cards: ImportCardView[]; channelCards: ChannelDecisionCard[] };
    };

    return response.ok && body.data ? body.data : null;
  } catch {
    return null;
  }
}

/* Stores an admin's "no channel" (POST .../discord-channel, action deny). */
async function denyChannel(hackathonId: string) {
  try {
    const response = await fetch(`/api/admin/hackathons/${hackathonId}/discord-channel`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "deny" }),
    });

    return response.ok;
  } catch {
    return false;
  }
}

export function HackathonJsonImporter({
  initialCards,
  initialChannelCards,
}: {
  initialCards: ImportCardView[];
  initialChannelCards: ChannelDecisionCard[];
}) {
  const router = useRouter();
  const [cards, setCards] = useState(initialCards);
  const [channelCards, setChannelCards] = useState(initialChannelCards);
  const [jsonText, setJsonText] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [status, setStatus] = useState<"idle" | "submitting" | "success" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [run, setRun] = useState<UploadRun | null>(null);
  const [tally, setTally] = useState<Tally>({ approved: 0, channels: 0, declined: 0, merged: 0, noChannel: 0, updated: 0 });
  const [pendingDiscord, setPendingDiscord] = useState<{ discord: EligibleDiscordPreview; hackathonId: string; name: string } | null>(
    null
  );
  const [editing, setEditing] = useState(false);
  const [channels, setChannels] = useState<ChannelRequest[]>([]);
  const jobs = useDiscordChannelJobs(channels.flatMap((channel) => (channel.jobId ? [channel.jobId] : [])));
  // Hackathons whose channel prompt was already answered. The prompt closes
  // without waiting for the server, so a second click on it can arrive before
  // it is gone and must not skip the next card.
  const decidedDiscord = useRef(new Set<string>());

  const card = cards[0];
  // Channel decisions come up once the event cards are done.
  const channelCard = card ? undefined : channelCards[0];
  const uploading = run !== null && run.done < run.total;
  const busy = status === "submitting";

  function say(kind: "error" | "success", text: string) {
    setStatus(kind);
    setMessage(text);
  }

  function count(key: keyof Tally) {
    setTally((current) => ({ ...current, [key]: current[key] + 1 }));
  }

  // The card in front is done: show the next one.
  function advance(cardId: string) {
    setCards((current) => current.filter((entry) => entry.id !== cardId));
  }

  function addChannel(channel: ChannelRequest) {
    setChannels((current) => [...current.filter((entry) => entry.hackathonId !== channel.hackathonId), channel]);
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setMessage(null);

    let parsed: unknown;

    try {
      parsed = JSON.parse(jsonText);
    } catch {
      say("error", "Invalid JSON.");
      return;
    }

    const payloads = payloadsFromJson(parsed);

    if (!payloads.length) {
      say("error", "JSON must be an array of hackathons or an object with a hackathons array.");
      return;
    }

    /* Every row goes to the server, a chunk per request. Auto-approved rows
       are published there and then; the rest are saved as cards. Nothing of
       the upload lives only in this tab once its request has answered. */
    setStatus("submitting");
    const progress: UploadRun = { dismissed: 0, done: 0, failed: 0, flagged: 0, lost: [], queued: 0, results: [], total: payloads.length };
    setRun({ ...progress });

    const record = async (sent: PreviewPayload[], outcome: Awaited<ReturnType<typeof postImport>>) => {
      if (!outcome.ok) {
        for (const payload of sent) {
          if (await saveFailedCard(payload, outcome.error)) {
            progress.failed += 1;
          } else {
            progress.lost.push(payloadName(payload));
          }
        }
      } else {
        for (const result of outcome.data.results) {
          if (result.status === "queued") {
            progress.queued += 1;
          } else if (result.status === "duplicate_flagged") {
            // Auto-approval answers "is this real?", not "is this already here?".
            progress.flagged += 1;
          } else if (result.status === "dismissed") {
            progress.dismissed += 1;
          } else {
            progress.results.push(result);
          }
        }
      }

      progress.done += sent.length;
      setRun({ ...progress, lost: [...progress.lost], results: [...progress.results] });
    };

    for (let offset = 0; offset < payloads.length; offset += IMPORT_CHUNK) {
      const chunk = payloads.slice(offset, offset + IMPORT_CHUNK);
      const outcome = await postImport(chunk);

      if (outcome.ok || chunk.length === 1) {
        await record(chunk, outcome);
        continue;
      }

      // One bad row fails its whole chunk. Send that chunk a row at a time so
      // only the bad row is set aside.
      for (const payload of chunk) {
        await record([payload], await postImport([payload]));
      }
    }

    for (const result of progress.results) {
      if (result.discordSync && result.hackathonId) {
        addChannel({ hackathonId: result.hackathonId, jobId: result.discordSync.jobId, name: result.name });
      }
    }

    // Rows published right away may now be waiting on a channel decision.
    const latest = await fetchQueue();

    if (latest) {
      setCards(latest.cards);
      setChannelCards(latest.channelCards);
    }

    const waitingCards = latest?.cards.length ?? progress.queued + progress.flagged + progress.failed;
    const waitingChannels = latest?.channelCards.length ?? 0;
    setJsonText("");
    setShowUpload(false);
    say(
      progress.lost.length ? "error" : "success",
      [
        `Imported ${progress.results.length} of ${progress.total} rows right away.`,
        waitingCards
          ? `${waitingCards} ${waitingCards === 1 ? "card is" : "cards are"} waiting for review.`
          : "Nothing is waiting for review.",
        waitingChannels
          ? `${waitingChannels} ${waitingChannels === 1 ? "hackathon is" : "hackathons are"} waiting for HNA approval.`
          : "",
        progress.lost.length
          ? `${progress.lost.length} could not be imported or saved, so upload them again: ${progress.lost.slice(0, 5).join(", ")}${progress.lost.length > 5 ? "…" : ""}.`
          : "",
      ]
        .filter(Boolean)
        .join(" ")
    );
    router.refresh();
  }

  async function decide(action: CardDecision) {
    if (!card) {
      return;
    }

    setStatus("submitting");
    setMessage(null);

    let response: Response;
    let body: DecisionResponse;

    try {
      response = await fetch(`/api/admin/import-queue/${card.id}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      body = (await response.json().catch(() => ({}))) as DecisionResponse;
    } catch {
      say("error", "The request did not reach the server. Check your connection and try again.");
      return;
    }

    if (response.status === 404 || response.status === 409) {
      // Decided somewhere else meanwhile: another tab, or another admin.
      advance(card.id);
      say("success", `${payloadName(card.payload)} was already reviewed somewhere else. Showing the next card.`);
      return;
    }

    if (!response.ok || !body.data) {
      const fields = fieldErrorSummary(body.details);
      say("error", [body.error ? stringifyError(body.error) : "The decision could not be saved.", fields].filter(Boolean).join(" "));
      return;
    }

    if (body.data.status === "rejected") {
      count("declined");
      advance(card.id);
      say("success", "Declined. It stays out of the catalog, also when the scraper sends it again.");
      return;
    }

    const result = body.data.result;

    // A likely duplicate found on approval: the card stays and now names it.
    if (result.status === "duplicate_flagged") {
      setCards((current) =>
        current.map((entry) =>
          entry.id === card.id && result.matchedHackathonId
            ? { ...entry, duplicate: { hackathonId: result.matchedHackathonId, name: result.matchedName ?? null, score: result.duplicateScore } }
            : entry
        )
      );
      setStatus("idle");
      return;
    }

    router.refresh();

    // Set when the card was auto-approved: the server queued its channel, and
    // the channel list below shows how that goes.
    const queuedChannel = result.discordSync;
    const withDiscordNote = (text: string) => (queuedChannel ? `${text} Its Discord channel is listed below.` : text);

    if (queuedChannel && result.hackathonId) {
      addChannel({ hackathonId: result.hackathonId, jobId: queuedChannel.jobId, name: result.name });
    }

    if (result.status === "auto_merged") {
      count("merged");
      advance(card.id);
      say(
        "success",
        withDiscordNote(
          `Merged into the existing hackathon ${result.matchedName ? `"${result.matchedName}"` : ""}. Missing details were filled in from this card.`
        )
      );
      return;
    }

    // The scraper sent this event before (same feed id): it was updated in place.
    if (result.status === "updated") {
      const target = result.matchedName ? `"${result.matchedName}"` : "the existing hackathon";
      count("updated");
      advance(card.id);
      say(
        "success",
        withDiscordNote(
          result.updatedFields?.length
            ? `Already imported as ${target}. Updated what the feed changed since: ${result.updatedFields.map(feedFieldLabel).join(", ")}.`
            : `Already imported as ${target}. Nothing changed in the feed since the last import.`
        )
      );
      return;
    }

    count("approved");

    // Canadian/US events pause here for a separate Discord channel decision.
    // The hackathon is already published and its card resolved; only the
    // channel waits, and it is not created until the admin approves it.
    if (!queuedChannel && result.hackathonId && result.discord?.eligible) {
      setStatus("idle");
      setPendingDiscord({ discord: result.discord, hackathonId: result.hackathonId, name: result.name });
      return;
    }

    advance(card.id);
    say("success", queuedChannel ? withDiscordNote("Imported.") : "Imported. Not a Canada/US event, so no Discord channel is offered.");
  }

  /* Asks for a hackathon's channel. The answer is a queued job, so this never
     waits for Discord; whatever comes back lands in the channel list. */
  async function requestChannel(hackathonId: string, name: string) {
    addChannel({ hackathonId, name });

    try {
      const response = await fetch(`/api/admin/hackathons/${hackathonId}/discord-channel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const body = (await response.json().catch(() => ({}))) as DiscordDecisionResponse;

      if (!response.ok || !body.data) {
        addChannel({ error: body.error ? stringifyError(body.error) : "Discord channel action failed.", hackathonId, name });
      } else if (body.data.status === "queued") {
        addChannel({ hackathonId, jobId: body.data.jobId, name });
      } else {
        addChannel({ hackathonId, name, note: body.data.reason ?? "No Discord channel was created." });
      }
    } catch {
      addChannel({ error: "The request did not reach the server. Check your connection and retry.", hackathonId, name });
    }
  }

  function decideDiscord(action: "approve" | "deny") {
    if (!pendingDiscord || decidedDiscord.current.has(pendingDiscord.hackathonId)) {
      return;
    }

    decidedDiscord.current.add(pendingDiscord.hackathonId);

    // Nothing here waits: either answer is sent in the background (approving
    // only queues the channel), so the next card is shown straight away.
    if (action === "approve") {
      void requestChannel(pendingDiscord.hackathonId, pendingDiscord.name);
      say("success", `Imported and HNA approved. Discord channel #${pendingDiscord.discord.name} is being set up; it is listed below.`);
    } else {
      const { hackathonId, name } = pendingDiscord;
      say("success", "Imported, not HNA approved. The hackathon stays published without a Discord channel.");
      void denyChannel(hackathonId).then((ok) => {
        if (!ok) {
          // Not stored: it comes back in the HNA approval queue on the next visit.
          say("error", `The "not HNA approved" for ${name} did not reach the server; it will be asked again.`);
        }
      });
    }

    setPendingDiscord(null);

    if (card) {
      advance(card.id);
    }
  }

  // Not a decision: the card stays in the queue and comes round again.
  function decideLater() {
    setCards((current) => (current.length > 1 ? [...current.slice(1), current[0]] : current));
    setStatus("idle");
    setMessage(null);
  }

  /* A yes or no on whether a hackathon is HNA approved. Approving queues its
     Discord channel (listed below as it is made); either answer is stored
     and the next one comes up straight away. */
  async function decideChannel(action: "approve" | "deny" | "later") {
    if (!channelCard) {
      return;
    }

    const { hackathonId } = channelCard;
    const name = payloadName(channelCard.payload);

    if (action === "later") {
      setChannelCards((current) => (current.length > 1 ? [...current.slice(1), current[0]] : current));
      setStatus("idle");
      setMessage(null);
      return;
    }

    setChannelCards((current) => current.filter((entry) => entry.hackathonId !== hackathonId));

    if (action === "approve") {
      count("channels");
      void requestChannel(hackathonId, name);
      say("success", `${name} is HNA approved. Discord channel #${channelCard.discord.name} is being set up; it is listed below.`);
      return;
    }

    count("noChannel");
    say("success", `${name} is not HNA approved. It stays published without a Discord channel.`);

    if (!(await denyChannel(hackathonId))) {
      // Not stored: put it back so the decision is not lost.
      setChannelCards((current) => [channelCard, ...current]);
      setTally((current) => ({ ...current, noChannel: current.noChannel - 1 }));
      say("error", `The "not HNA approved" for ${name} did not reach the server. Try again.`);
    }
  }

  async function applyEdits(updated: PreviewPayload) {
    if (!card) {
      return;
    }

    setEditing(false);
    setStatus("submitting");
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/import-queue/${card.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ payload: updated }),
      });
      const body = (await response.json().catch(() => ({}))) as { data?: { card: ImportCardView }; error?: unknown };

      if (!response.ok || !body.data) {
        say("error", body.error ? stringifyError(body.error) : "The edit could not be saved.");
        return;
      }

      const saved = body.data.card;
      // Edits can change the name or date, so an earlier duplicate match or
      // error no longer applies; the card goes back to a plain yes or no.
      setCards((current) => current.map((entry) => (entry.id === saved.id ? saved : entry)));
      say("success", "Card saved. Review it again, then choose yes or no.");
    } catch {
      say("error", "The edit did not reach the server. Check your connection and try again.");
    }
  }

  const uploadForm = (
    <form onSubmit={onSubmit} className="space-y-4">
      <textarea
        aria-label="Hackathon import JSON"
        className="min-h-72 w-full rounded-xl border border-ink/15 bg-paper p-4 font-mono text-xs leading-5 text-ink outline-none focus:border-pine focus:ring-2 focus:ring-pine/15"
        onChange={(event) => setJsonText(event.target.value)}
        placeholder={sampleJson}
        spellCheck={false}
        value={jsonText}
      />
      <button
        className="inline-flex min-h-10 items-center gap-2 rounded-full bg-pine hover:bg-pine/90 px-4 text-sm font-semibold text-paper disabled:opacity-50"
        disabled={busy || uploading || !jsonText.trim()}
        type="submit"
      >
        <Upload aria-hidden="true" className="size-4" />
        {uploading ? "Importing" : "Import JSON"}
      </button>
    </form>
  );

  const reviewed = tally.approved + tally.merged + tally.updated + tally.declined + tally.channels + tally.noChannel;
  const visitSummary = [
    `${tally.approved} approved`,
    `${tally.merged} merged`,
    `${tally.updated} updated`,
    `${tally.declined} declined`,
    ...(tally.channels + tally.noChannel ? [`${tally.channels} HNA approved`, `${tally.noChannel} not HNA approved`] : []),
  ].join(" · ");

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pine">Bulk import</p>
          <h2 className="mt-1 text-2xl font-semibold text-ink">
            {uploading
              ? "Importing"
              : card
                ? "Approve imported card"
                : channelCard
                  ? "HNA approval"
                  : "Scraped hackathons JSON"}
          </h2>
          <p aria-live="polite" className="mt-1 text-sm text-ink/55">
            {uploading && run
              ? `${run.done} of ${run.total} rows done`
              : `${cards.length} waiting for review · ${channelCards.length} waiting for HNA approval${
                  reviewed ? ` · this visit: ${visitSummary}` : ""
                }`}
          </p>
        </div>
        {card || channelCard ? (
          <button
            aria-expanded={showUpload}
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink/15 px-4 text-sm font-semibold text-ink hover:bg-paper disabled:opacity-50"
            disabled={uploading}
            onClick={() => setShowUpload((current) => !current)}
            type="button"
          >
            {showUpload ? <X aria-hidden="true" className="size-4" /> : <Plus aria-hidden="true" className="size-4" />}
            {showUpload ? "Close" : "Add JSON"}
          </button>
        ) : null}
      </div>

      {(!card && !channelCard) || showUpload ? uploadForm : null}

      {run ? <UploadRunSummary run={run} running={uploading} /> : null}

      {channels.length ? (
        <DiscordChannelList
          channels={channels}
          jobs={jobs}
          onRetry={(channel) => void requestChannel(channel.hackathonId, channel.name)}
        />
      ) : null}

      {card && !uploading ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,42rem)_18rem] xl:items-start xl:justify-between">
          <div className="space-y-4">
            <p className="text-sm text-ink/55">
              Added {addedOn.format(new Date(card.createdAt))}
              {card.via === "scraper" ? " by the scraper" : card.via === "upload" ? " from an upload" : ""}
            </p>
            <HackathonCardPreview compact payload={card.payload} previewId={`import-preview-${card.id}`} />
            <HackathonPayloadDetails payload={card.payload} />
          </div>
          {pendingDiscord && pendingDiscord.discord.action !== "create" ? (
            <div className="order-first flex flex-col rounded-xl border border-pine/20 bg-pine/5 p-4 xl:order-none xl:sticky xl:top-4">
              <div>
                <p className="text-sm font-semibold text-ink">Is it HNA approved?</p>
                <p className="mt-2 text-sm leading-6 text-ink/55">
                  Imported. HNA approved hackathons get a Discord channel in the{" "}
                  <span className="font-semibold text-ink">{pendingDiscord.discord.categoryName}</span> category:
                  this one would recycle the existing{" "}
                  <span className="font-semibold text-ink">#{pendingDiscord.discord.existingChannelName}</span>{" "}
                  channel as <span className="font-semibold text-ink">#{pendingDiscord.discord.name}</span>. Not
                  approved keeps the hackathon published without a channel.
                </p>
              </div>
              <div className="mt-5 grid gap-3">
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-pine px-4 text-sm font-semibold text-paper disabled:opacity-50"
                  onClick={() => decideDiscord("approve")}
                  type="button"
                >
                  <Check aria-hidden="true" className="size-4" />
                  HNA approved
                </button>
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-danger px-4 text-sm font-semibold text-danger disabled:opacity-50"
                  onClick={() => decideDiscord("deny")}
                  type="button"
                >
                  <X aria-hidden="true" className="size-4" />
                  Not HNA approved
                </button>
              </div>
            </div>
          ) : pendingDiscord ? null : card.duplicate ? (
            <div className="order-first flex flex-col rounded-xl border border-warning/30 bg-warning-soft p-4 xl:order-none xl:sticky xl:top-4">
              <div>
                <p className="text-sm font-semibold text-ink">Possible duplicate</p>
                <p className="mt-2 text-sm leading-6 text-ink/55">
                  This matches{" "}
                  <span className="font-semibold text-ink">{card.duplicate.name ?? "an existing hackathon"}</span> on
                  both name and start date (match {card.duplicate.score.toFixed(2)}). Merge fills in what the existing
                  hackathon is missing and keeps the two linked for later updates.
                </p>
              </div>
              <div className="mt-5 grid gap-3">
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-pine px-4 text-sm font-semibold text-paper disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void decide("merge")}
                  type="button"
                >
                  <GitMerge aria-hidden="true" className="size-4" />
                  Merge into existing
                </button>
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-ink/15 px-4 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void decide("approve_new")}
                  type="button"
                >
                  <Check aria-hidden="true" className="size-4" />
                  Import as new anyway
                </button>
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-ink/15 px-4 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-50"
                  disabled={busy}
                  onClick={() => setEditing(true)}
                  type="button"
                >
                  <Pencil aria-hidden="true" className="size-4" />
                  Edit card
                </button>
                <LaterButton disabled={busy || cards.length < 2} onClick={decideLater} />
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-danger px-4 text-sm font-semibold text-danger disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void decide("reject")}
                  type="button"
                >
                  <X aria-hidden="true" className="size-4" />
                  No, leave it out
                </button>
              </div>
            </div>
          ) : (
            <div className="order-first flex flex-col rounded-xl border border-ink/10 bg-paper p-4 xl:order-none xl:sticky xl:top-4">
              <div>
                <p className="text-sm font-semibold text-ink">Does this card look right?</p>
                {card.error ? (
                  <p className="mt-2 text-sm leading-6 text-danger">Importing this card failed: {card.error}</p>
                ) : null}
                <p className="mt-2 text-sm leading-6 text-ink/55">
                  Yes imports this record. No leaves it out for good. Later keeps it in the queue. Edit card fixes
                  details, tags, or location before importing.
                </p>
              </div>
              <div className="mt-5 grid gap-3">
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-pine px-4 text-sm font-semibold text-paper disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void decide("approve")}
                  type="button"
                >
                  <Check aria-hidden="true" className="size-4" />
                  Yes
                </button>
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-ink/15 px-4 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-50"
                  disabled={busy}
                  onClick={() => setEditing(true)}
                  type="button"
                >
                  <Pencil aria-hidden="true" className="size-4" />
                  Edit card
                </button>
                <LaterButton disabled={busy || cards.length < 2} onClick={decideLater} />
                <button
                  className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-danger px-4 text-sm font-semibold text-danger disabled:opacity-50"
                  disabled={busy}
                  onClick={() => void decide("reject")}
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

      {channelCard && !uploading ? (
        <div className="grid gap-4 xl:grid-cols-[minmax(0,42rem)_18rem] xl:items-start xl:justify-between">
          <div className="space-y-4">
            <p className="text-sm text-ink/55">Published, waiting for HNA approval</p>
            <HackathonCardPreview compact payload={channelCard.payload} previewId={`channel-preview-${channelCard.hackathonId}`} />
          </div>
          <div className="order-first flex flex-col rounded-xl border border-pine/20 bg-pine/5 p-4 xl:order-none xl:sticky xl:top-4">
            <div>
              <p className="text-sm font-semibold text-ink">Is it HNA approved?</p>
              <p className="mt-2 text-sm leading-6 text-ink/55">
                {channelCard.discord.action === "recycle" ? (
                  <>
                    Approving recycles the existing{" "}
                    <span className="font-semibold text-ink">#{channelCard.discord.existingChannelName}</span> channel as{" "}
                    <span className="font-semibold text-ink">#{channelCard.discord.name}</span>
                  </>
                ) : (
                  <>
                    Approving creates <span className="font-semibold text-ink">#{channelCard.discord.name}</span>
                  </>
                )}{" "}
                in <span className="font-semibold text-ink">{channelCard.discord.categoryName}</span>. Not approved
                keeps the hackathon published without a channel, and it is not asked again.
              </p>
            </div>
            <div className="mt-5 grid gap-3">
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full bg-pine px-4 text-sm font-semibold text-paper disabled:opacity-50"
                disabled={busy}
                onClick={() => void decideChannel("approve")}
                type="button"
              >
                <Check aria-hidden="true" className="size-4" />
                HNA approved
              </button>
              <LaterButton disabled={busy || channelCards.length < 2} onClick={() => void decideChannel("later")} />
              <button
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-danger px-4 text-sm font-semibold text-danger disabled:opacity-50"
                disabled={busy}
                onClick={() => void decideChannel("deny")}
                type="button"
              >
                <X aria-hidden="true" className="size-4" />
                Not HNA approved
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {editing && card ? (
        <HackathonImportEditDialog onClose={() => setEditing(false)} onSave={(updated) => void applyEdits(updated)} payload={card.payload} />
      ) : null}

      {pendingDiscord && pendingDiscord.discord.action === "create" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6">
          <div className="w-full max-w-2xl rounded-2xl border border-pine/20 bg-surface p-8 shadow-2xl sm:p-12">
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pine">HNA approval</p>
            <h2 className="mt-3 text-3xl font-semibold text-ink">Is it HNA approved?</h2>
            <p className="mt-4 text-base leading-7 text-ink/55">
              Imported. HNA approved hackathons get a Discord channel: this one would get a new channel named{" "}
              <span className="font-semibold text-ink">#{pendingDiscord.discord.name}</span> in the{" "}
              <span className="font-semibold text-ink">{pendingDiscord.discord.categoryName}</span> category. Not
              approved keeps the hackathon published without a channel.
            </p>
            <div className="mt-8 flex flex-col gap-3 sm:flex-row">
              <button
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full bg-pine px-4 text-base font-semibold text-paper disabled:opacity-50"
                onClick={() => decideDiscord("approve")}
                type="button"
              >
                <Check aria-hidden="true" className="size-5" />
                HNA approved
              </button>
              <button
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-full border border-danger px-4 text-base font-semibold text-danger disabled:opacity-50"
                onClick={() => decideDiscord("deny")}
                type="button"
              >
                <X aria-hidden="true" className="size-5" />
                Not HNA approved
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {message ? (
        <div
          className={`flex items-start gap-2 rounded-xl border px-4 py-3 text-sm font-semibold ${
            status === "error" ? "border-danger/30 bg-danger-soft text-danger" : "border-pine/25 bg-pine-soft text-pine"
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

function LaterButton({ disabled, onClick }: { disabled: boolean; onClick: () => void }) {
  return (
    <button
      className="inline-flex min-h-11 items-center justify-center gap-2 rounded-full border border-ink/15 px-4 text-sm font-semibold text-ink hover:bg-surface disabled:opacity-50"
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Clock aria-hidden="true" className="size-4" />
      Later
    </button>
  );
}

function UploadRunSummary({ run, running }: { run: UploadRun; running: boolean }) {
  const count = (status: ImportResult["status"]) => run.results.filter((result) => result.status === status).length;
  const progress = run.total ? Math.round((run.done / run.total) * 100) : 100;

  return (
    <div className="rounded-xl border border-pine/20 bg-pine/5 p-4">
      <p className="text-sm font-semibold text-ink">
        {running ? `Importing ${run.done} of ${run.total} rows` : `Last upload: ${run.total} rows`}
      </p>
      {running ? (
        <div
          aria-label="Import progress"
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
        {count("imported")} published · {count("auto_merged")} merged · {count("updated")} updated · {run.queued} saved for
        review · {run.flagged} possible duplicates · {run.failed} failed
        {run.dismissed ? ` · ${run.dismissed} declined before` : ""}
      </p>
      {!running && run.queued + run.flagged + run.failed > 0 ? (
        <p className="mt-1 text-sm leading-6 text-ink/55">
          Rows saved for review, possible duplicates and failed rows are in the queue. They stay there until you
          decide, also if you close this page.
        </p>
      ) : null}
      {run.results.length ? (
        <details className="mt-3">
          <summary className="cursor-pointer text-sm font-semibold text-pine">Show each imported row</summary>
          <ul className="mt-2 max-h-72 divide-y divide-ink/10 overflow-y-auto rounded-lg border border-ink/10 bg-surface">
            {run.results.map((result, position) => (
              // Rows are listed in the order they were sent, so the position is stable.
              <li className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[1fr_auto]" key={`${position}-${result.name}`}>
                <span className="font-semibold text-ink">{result.name}</span>
                <span className="text-pine">{importStatusLabel(result.status)}</span>
              </li>
            ))}
          </ul>
        </details>
      ) : null}
    </div>
  );
}

/* Every channel this import asked for. Channels are made after the click that
   asked for them, so this is where the link, or the reason it failed, shows up. */
function DiscordChannelList({
  channels,
  jobs,
  onRetry,
}: {
  channels: ChannelRequest[];
  jobs: ReturnType<typeof useDiscordChannelJobs>;
  onRetry: (channel: ChannelRequest) => void;
}) {
  const tones = channels.map((channel) =>
    channel.error ? "failed" : channel.note ? "done" : describeDiscordChannelJob(channel.jobId ? jobs[channel.jobId] : undefined).tone
  );
  const working = tones.filter((tone) => tone === "working").length;
  const failed = tones.filter((tone) => tone === "failed").length;

  return (
    <div className="rounded-xl border border-ink/10 bg-paper p-4">
      <p className="text-sm font-semibold text-ink">Discord channels</p>
      <p aria-live="polite" className="mt-1 text-sm leading-6 text-ink/55">
        {working ? `${working} being set up · ` : ""}
        {channels.length - working - failed} done · {failed} failed
      </p>
      <ul className="mt-2 max-h-72 divide-y divide-ink/10 overflow-y-auto rounded-lg border border-ink/10 bg-surface">
        {channels.map((channel) =>
          channel.error || channel.note ? (
            <li
              className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-baseline sm:gap-3"
              key={channel.hackathonId}
            >
              <span className="truncate font-semibold text-ink">{channel.name}</span>
              <span className={channel.error ? "text-danger" : "text-ink/55"}>{channel.error ?? channel.note}</span>
              {channel.error ? (
                <button className="font-semibold text-pine underline" onClick={() => onRetry(channel)} type="button">
                  Retry
                </button>
              ) : null}
            </li>
          ) : (
            <DiscordChannelJobLine
              job={channel.jobId ? jobs[channel.jobId] : undefined}
              key={channel.hackathonId}
              label={channel.name}
              onRetry={() => onRetry(channel)}
            />
          )
        )}
      </ul>
    </div>
  );
}
