"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarDays, ExternalLink, MapPin, Pin, Trophy } from "lucide-react";

import { HackathonResultActions, type ResultSave } from "@/components/hackathon-result-actions";
import { useHackathonPanelOpen } from "@/components/hackathon-side-panel";
import { MarkAttendedButton } from "@/components/mark-attended-button";
import { RemoveHackathonControl } from "@/components/remove-hackathon-control";
import { reportBackgroundFailure } from "@/lib/client/background-actions";
import { sendRequest } from "@/lib/client/request";
import { useKeyedLatestSave } from "@/lib/client/use-latest-save";

export type PastResultFields = {
  status: "attended" | "won" | "ended";
  awardName: string | null;
  devpostUrl: string | null;
  isPinned: boolean;
};

function patchToRequestBody(patch: Partial<PastResultFields>) {
  return {
    ...(patch.status !== undefined ? { applicationStatus: patch.status } : {}),
    ...(patch.awardName !== undefined ? { awardName: patch.awardName } : {}),
    ...(patch.devpostUrl !== undefined ? { devpostUrl: patch.devpostUrl } : {}),
    ...(patch.isPinned !== undefined ? { isPinned: patch.isPinned } : {}),
  };
}

/* A finished hackathon in the My Hackathons "Past" list. Client-side so every
   action on it (mark attended, pin, log/undo a win, project link, remove)
   shows immediately: the card owns an optimistic copy of its fields and saves
   in the background, one request per kind of change with the last click
   winning. A failed save restores the confirmed values with a toast. */
export function PastHackathonCard({
  awardName,
  dateRange,
  devpostUrl,
  hackathonId,
  hackathonName,
  isPinned,
  location,
  slug,
  status,
  userHackathonId,
}: {
  awardName: string | null;
  dateRange: string;
  devpostUrl: string | null;
  hackathonId: string;
  hackathonName: string;
  isPinned: boolean;
  location: string;
  slug: string;
  status: "attended" | "won" | "ended";
  userHackathonId: string;
}) {
  const router = useRouter();
  const [removed, setRemoved] = useState(false);
  const panelOpen = useHackathonPanelOpen();

  const serverFields: PastResultFields = { status, awardName, devpostUrl, isPinned };
  const serverKey = `${status}|${awardName}|${devpostUrl}|${isPinned}`;
  const [fields, setFields] = useState(serverFields);
  /* What the server has confirmed; failed saves roll back to it. */
  const [confirmed, setConfirmed] = useState(serverFields);
  const [syncedKey, setSyncedKey] = useState(serverKey);
  const [saving, setSaving] = useState(false);

  // Adopt fresh server props after a refresh, unless this card has saves
  // still in flight (their refresh will follow once they land).
  if (syncedKey !== serverKey && !saving) {
    setSyncedKey(serverKey);
    setFields(serverFields);
    setConfirmed(serverFields);
  }

  const { save, isSaving } = useKeyedLatestSave<string, ResultSave, unknown>(
    (_key, { patch }) =>
      sendRequest(`/api/user-hackathons/${encodeURIComponent(userHackathonId)}`, {
        method: "PATCH",
        json: patchToRequestBody(patch),
      }),
    {
      onSuccess: (_result, { patch }) => {
        setConfirmed((current) => ({ ...current, ...patch }));

        if (!isSaving()) {
          setSaving(false);
          router.refresh();
        }
      },
      onError: (error, value) => {
        const rollback = Object.fromEntries(
          Object.keys(value.patch).map((key) => [key, confirmed[key as keyof PastResultFields]])
        ) as Partial<PastResultFields>;

        setFields((current) => ({ ...current, ...rollback }));
        if (!isSaving()) {
          setSaving(false);
        }

        value.onFailed?.();
        reportBackgroundFailure(error, { message: value.failureMessage, retry: () => apply(value) });
      },
    }
  );

  function apply(value: ResultSave) {
    setFields((current) => ({ ...current, ...value.patch }));
    setSaving(true);
    save(value.key, value);
  }

  if (removed) {
    return null;
  }

  const won = fields.status === "won";
  const attended = fields.status === "attended";

  return (
    <article className="group rounded-xl border border-ink/10 bg-paper p-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <Link
            className="text-lg font-semibold text-ink underline-offset-4 hover:text-pine hover:underline"
            href={`/hackathons/${slug}`}
            replace={panelOpen}
            scroll={false}
          >
            {hackathonName}
          </Link>
          <p className="mt-1.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-ink/55">
            <span className="inline-flex items-center gap-1">
              <CalendarDays aria-hidden="true" className="size-3.5 shrink-0" />
              {dateRange}
            </span>
            <span className="inline-flex items-center gap-1">
              <MapPin aria-hidden="true" className="size-3.5 shrink-0" />
              {location}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
          {won ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-pine px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-paper">
              <Trophy aria-hidden="true" className="size-3.5" />
              Winner
            </span>
          ) : (
            <span className="inline-flex items-center rounded-full border border-ink/10 bg-surface px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-ink/55">
              {attended ? "Attended" : "Ended"}
            </span>
          )}
          {fields.isPinned ? (
            <span className="inline-flex items-center gap-1.5 rounded-full border border-pine/25 bg-surface px-3 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-pine">
              <Pin aria-hidden="true" className="size-3.5 fill-current" />
              Pinned
            </span>
          ) : null}
          <RemoveHackathonControl
            hackathonId={hackathonId}
            hackathonName={hackathonName}
            listLabel="Past"
            onRemove={() => setRemoved(true)}
            onRestore={() => setRemoved(false)}
          />
        </div>
      </div>

      {(won && fields.awardName) || fields.devpostUrl ? (
        <div className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5">
          {won && fields.awardName ? (
            <p className="inline-flex items-center gap-1.5 text-sm font-semibold text-pine">
              <Trophy aria-hidden="true" className="size-3.5 shrink-0" />
              {fields.awardName}
            </p>
          ) : null}
          {fields.devpostUrl ? (
            <a
              className="inline-flex items-center gap-1.5 text-sm font-medium text-ink underline-offset-4 hover:text-pine hover:underline"
              href={fields.devpostUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
              View project
            </a>
          ) : null}
        </div>
      ) : null}

      <div className="mt-4 border-t border-ink/10 pt-4">
        {won || attended ? (
          <HackathonResultActions
            awardName={fields.awardName}
            devpostUrl={fields.devpostUrl}
            hackathonName={hackathonName}
            isPinned={fields.isPinned}
            onSave={apply}
            status={won ? "won" : "attended"}
          />
        ) : (
          <MarkAttendedButton
            onMark={() =>
              apply({
                key: "result",
                patch: { status: "attended" },
                failureMessage: `Couldn't mark ${hackathonName} as attended.`,
              })
            }
          />
        )}
      </div>
    </article>
  );
}
