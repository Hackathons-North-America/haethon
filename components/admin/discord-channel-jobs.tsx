"use client";

import { useEffect, useState } from "react";

import type { DiscordChannelJobView } from "@/lib/discord/channel-jobs";

/* Discord channels are made after the admin's click has been answered (see
   lib/discord/channel-jobs.ts). These helpers follow a queued job until it
   has a channel link or an error to show. */

const POLL_INTERVAL_MS = 1500;
/* A channel normally takes a few seconds. Past this the page stops asking;
   Admin → Discord lists whatever is still open. */
const POLL_LIMIT_MS = 3 * 60 * 1000;
const IDS_PER_REQUEST = 100;

function isOpen(job: DiscordChannelJobView | undefined) {
  return !job || job.status === "pending" || job.status === "running";
}

/**
 * The latest known state of each job id, refreshed every 1.5 seconds while any
 * of them is still waiting or running.
 */
export function useDiscordChannelJobs(jobIds: string[], initialJobs: DiscordChannelJobView[] = []) {
  const [jobs, setJobs] = useState<Record<string, DiscordChannelJobView>>(() =>
    Object.fromEntries(initialJobs.map((job) => [job.id, job]))
  );
  const idsKey = jobIds.join(",");

  useEffect(() => {
    const ids = idsKey ? idsKey.split(",") : [];
    const settled = new Set<string>();
    const startedAt = Date.now();
    let cancelled = false;
    let timer: ReturnType<typeof setTimeout> | undefined;

    async function poll() {
      const open = ids.filter((id) => !settled.has(id));

      if (!open.length || cancelled) {
        return;
      }

      try {
        const fetched: DiscordChannelJobView[] = [];

        for (let offset = 0; offset < open.length; offset += IDS_PER_REQUEST) {
          const response = await fetch(
            `/api/admin/discord/channel-jobs?ids=${open.slice(offset, offset + IDS_PER_REQUEST).join(",")}`,
            { cache: "no-store" }
          );

          if (response.ok) {
            fetched.push(...((await response.json()) as { data: DiscordChannelJobView[] }).data);
          }
        }

        if (cancelled) {
          return;
        }

        for (const job of fetched) {
          if (!isOpen(job)) {
            settled.add(job.id);
          }
        }

        if (fetched.length) {
          setJobs((current) => ({ ...current, ...Object.fromEntries(fetched.map((job) => [job.id, job])) }));
        }
      } catch {
        // A dropped request is retried on the next tick.
      }

      if (!cancelled && Date.now() - startedAt < POLL_LIMIT_MS) {
        timer = setTimeout(poll, POLL_INTERVAL_MS);
      }
    }

    void poll();

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [idsKey]);

  return jobs;
}

export type DiscordChannelJobTone = "working" | "done" | "failed";

/** What to tell the admin about one job. `job` is undefined until its first poll answers. */
export function describeDiscordChannelJob(job: DiscordChannelJobView | undefined): {
  text: string;
  tone: DiscordChannelJobTone;
} {
  if (isOpen(job)) {
    return {
      text: job?.nextAttemptAt ? "Waiting to retry automatically." : "Setting up the Discord channel…",
      tone: "working",
    };
  }

  if (job!.status === "failed") {
    return {
      text: `The Discord channel could not be set up${job!.error ? `: ${job!.error}` : "."} The daily Discord sync will try again.`,
      tone: "failed",
    };
  }

  const result = job!.result;

  switch (result?.status) {
    case "synced":
      return {
        text:
          result.action === "created"
            ? `Created Discord channel #${result.name} in ${result.categoryName}.`
            : `Reused the existing Discord channel as #${result.name} in ${result.categoryName}.`,
        tone: "done",
      };
    case "unchanged":
      return { text: "Kept its existing Discord channel.", tone: "done" };
    default:
      return { text: result?.reason ?? "No Discord channel.", tone: "done" };
  }
}

/** One line per job: what happened, a link to the channel once there is one, and Retry after a failure. */
export function DiscordChannelJobLine({
  job,
  label,
  onRetry,
}: {
  job: DiscordChannelJobView | undefined;
  label: string;
  onRetry?: () => void;
}) {
  const { text, tone } = describeDiscordChannelJob(job);

  return (
    <li className="grid gap-1 px-3 py-2 text-sm sm:grid-cols-[minmax(0,14rem)_1fr_auto] sm:items-baseline sm:gap-3">
      <span className="truncate font-semibold text-ink">{label}</span>
      <span className={tone === "failed" ? "text-danger" : tone === "working" ? "text-ink/55" : "text-pine"}>{text}</span>
      <span className="flex gap-3">
        {job?.channelUrl ? (
          <a className="font-semibold text-pine underline" href={job.channelUrl} rel="noreferrer" target="_blank">
            Open channel
          </a>
        ) : null}
        {tone === "failed" && onRetry ? (
          <button className="font-semibold text-pine underline" onClick={onRetry} type="button">
            Retry
          </button>
        ) : null}
      </span>
    </li>
  );
}

/**
 * Admin → Discord: channel requests that have not gone through. Requests still
 * running are followed live; a failed one keeps its error until a retry (here
 * or from the importer) succeeds, so a failure is never only visible on the
 * page that happened to be open when it occurred.
 */
export function DiscordChannelRequests({ initialJobs }: { initialJobs: DiscordChannelJobView[] }) {
  const [entries, setEntries] = useState(() =>
    initialJobs.map((job) => ({ hackathonId: job.hackathonId, jobId: job.id, label: job.hackathonName ?? "Deleted hackathon" }))
  );
  const [retryError, setRetryError] = useState<string | null>(null);
  const jobs = useDiscordChannelJobs(
    entries.map((entry) => entry.jobId),
    initialJobs
  );

  async function retry(hackathonId: string) {
    setRetryError(null);

    try {
      const response = await fetch(`/api/admin/hackathons/${hackathonId}/discord-channel`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "approve" }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        data?: { jobId?: string; reason?: string; status: string };
        error?: unknown;
      };
      const jobId = body.data?.jobId;

      if (!response.ok || !jobId) {
        setRetryError(
          body.data?.reason ?? (typeof body.error === "string" ? body.error : "Could not queue the Discord channel again.")
        );
        return;
      }

      setEntries((current) => current.map((entry) => (entry.hackathonId === hackathonId ? { ...entry, jobId } : entry)));
    } catch {
      setRetryError("The request did not reach the server. Check your connection and retry.");
    }
  }

  if (!entries.length) {
    return null;
  }

  return (
    <section className="border border-ink/15 bg-paper p-6">
      <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pine">Channel requests</p>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/55">
        Channels asked for from the importer that are still being set up, or that failed. A failed request stays here
        until a retry goes through; the daily sync also creates any channel that is still missing.
      </p>
      <ul className="mt-4 divide-y divide-ink/10 border border-ink/10 bg-surface">
        {entries.map((entry) => (
          <DiscordChannelJobLine
            job={jobs[entry.jobId]}
            key={entry.hackathonId}
            label={entry.label}
            onRetry={() => void retry(entry.hackathonId)}
          />
        ))}
      </ul>
      {retryError ? <p className="mt-3 text-sm font-semibold text-danger">{retryError}</p> : null}
    </section>
  );
}
