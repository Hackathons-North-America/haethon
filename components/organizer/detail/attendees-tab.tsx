"use client";

import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { AlertTriangle, BadgeCheck, CircleDashed, RotateCcw, Search, ShieldCheck, UserRound, Users, X } from "lucide-react";

import {
  apiErrorMessage,
  cardClassName,
  checkboxClassName,
  compactPrimaryButtonClassName,
  compactSecondaryButtonClassName,
  focusRingClassName,
  inputClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
  statusTextClassName,
} from "@/components/organizer/detail/shared";
import { trackEvent } from "@/lib/analytics/events";

/* Mirrors HackathonAttendee from lib/hackathons/checkin-service.ts (GET .../attendees). */
type Attendee = {
  userId: string;
  name: string;
  email: string;
  applicationStatus: string | null;
  bestSource: string | null;
  tier: "verified" | "self_reported" | null;
};

type TierFilter = "all" | "verified" | "self_reported" | "none";

const TIER_FILTERS: { value: TierFilter; label: string }[] = [
  { value: "all", label: "All" },
  { value: "verified", label: "Verified" },
  { value: "self_reported", label: "Self-reported" },
  { value: "none", label: "No check-in" },
];

const SOURCE_LABELS: Record<string, string> = {
  inferred: "Inferred",
  manual: "Self-reported",
  system_verified: "Check-in code",
  organizer_verified: "Organizer verified",
  admin_verified: "Admin verified",
};

const APPLICATION_STATUS_LABELS: Record<string, string> = {
  interested: "Interested",
  applied: "Applied",
  attending: "Attending",
  attended: "Attended",
  won: "Won",
};

/* Only self-reported check-ins can be upgraded; the old console showed no
   checkbox for verified rows or rows with no check-in at all. */
function isVerifiable(attendee: Attendee) {
  return attendee.tier === "self_reported";
}

function matchesTier(attendee: Attendee, filter: TierFilter) {
  if (filter === "all") return true;
  if (filter === "none") return attendee.tier === null;
  return attendee.tier === filter;
}

function filterAttendees(list: Attendee[], query: string, filter: TierFilter) {
  const needle = query.trim().toLowerCase();

  return list.filter(
    (attendee) =>
      matchesTier(attendee, filter) &&
      (!needle || attendee.name.toLowerCase().includes(needle) || attendee.email.toLowerCase().includes(needle))
  );
}

function sourceLabel(source: string | null) {
  return source ? (SOURCE_LABELS[source] ?? source.replace(/_/g, " ")) : "—";
}

function applicationStatusLabel(status: string | null) {
  return status ? (APPLICATION_STATUS_LABELS[status] ?? status) : "—";
}

function AttendeeTierBadge({ tier }: { tier: Attendee["tier"] }) {
  const base = "inline-flex items-center gap-1 whitespace-nowrap rounded-full px-2.5 py-0.5 text-xs font-semibold";

  if (tier === "verified") {
    return (
      <span className={`${base} bg-pine-soft text-pine`}>
        <BadgeCheck aria-hidden="true" className="size-3.5" />
        Verified
      </span>
    );
  }

  if (tier === "self_reported") {
    return (
      <span className={`${base} bg-warning-soft text-warning-ink`}>
        <UserRound aria-hidden="true" className="size-3.5" />
        Self-reported
      </span>
    );
  }

  return (
    <span className={`${base} bg-ink/5 text-ink/55`}>
      <CircleDashed aria-hidden="true" className="size-3.5" />
      No check-in
    </span>
  );
}

/* A 44px hit area around a 16px native checkbox. */
function CheckboxCell({
  label,
  checked,
  indeterminate = false,
  disabled = false,
  onChange,
}: {
  label: string;
  checked: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  onChange: () => void;
}) {
  const ref = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (ref.current) {
      ref.current.indeterminate = indeterminate;
    }
  }, [indeterminate]);

  return (
    <label
      className={`flex size-11 shrink-0 items-center justify-center rounded-lg ${disabled ? "cursor-not-allowed" : "cursor-pointer hover:bg-ink/5"}`}
    >
      <input
        aria-label={label}
        checked={checked}
        className={`${checkboxClassName} ${focusRingClassName}`}
        disabled={disabled}
        onChange={onChange}
        ref={ref}
        type="checkbox"
      />
    </label>
  );
}

function AttendeesSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading attendees" className="space-y-4" role="status">
      <div className="h-11 animate-pulse rounded-xl bg-ink/5" />
      <div className="h-11 animate-pulse rounded-xl bg-ink/5 md:w-96" />
      <div className={`${cardClassName} divide-y divide-ink/10`}>
        {Array.from({ length: 4 }, (_, index) => (
          <div className="flex items-center gap-3 px-4 py-4" key={index}>
            <div className="size-4 animate-pulse rounded bg-ink/10" />
            <div className="flex-1 space-y-2">
              <div className="h-3.5 w-2/5 animate-pulse rounded bg-ink/10" />
              <div className="h-3 w-3/5 animate-pulse rounded bg-ink/5" />
            </div>
            <div className="h-5 w-20 animate-pulse rounded-full bg-ink/5" />
          </div>
        ))}
      </div>
      <span className="sr-only">Loading attendees...</span>
    </div>
  );
}

/* Quiet until something is checked, then the primary action. */
function VerifyButton({
  count,
  verifying,
  compact = false,
  onClick,
}: {
  count: number;
  verifying: boolean;
  compact?: boolean;
  onClick: () => void;
}) {
  const active = count > 0;
  const className = compact
    ? active
      ? compactPrimaryButtonClassName
      : compactSecondaryButtonClassName
    : active
      ? primaryButtonClassName
      : secondaryButtonClassName;

  return (
    <button className={className} disabled={verifying || !active} onClick={onClick} type="button">
      <ShieldCheck aria-hidden="true" className="size-4" />
      {verifying ? "Verifying..." : active ? `Verify selected (${count})` : "Verify selected"}
    </button>
  );
}

export function AttendeesTab({ hackathonId }: { hackathonId: string }) {
  const searchId = useId();
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [verifying, setVerifying] = useState(false);
  const [notice, setNotice] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [query, setQuery] = useState("");
  const [tierFilter, setTierFilter] = useState<TierFilter>("all");

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/organizer/hackathons/${hackathonId}/attendees`)
      .then(async (response) => {
        const result = (await response.json().catch(() => null)) as { data?: Attendee[]; error?: unknown } | null;

        if (cancelled) {
          return;
        }

        if (!response.ok || !result?.data) {
          setLoadState("error");
          setLoadError(apiErrorMessage(result, "Could not load attendees."));
          return;
        }

        setAttendees(result.data);
        setLoadState("ready");
      })
      .catch(() => {
        if (!cancelled) {
          setLoadState("error");
          setLoadError("Could not load attendees.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hackathonId, reloadKey]);

  const retry = useCallback(() => {
    setLoadState("loading");
    setLoadError(null);
    setReloadKey((key) => key + 1);
  }, []);

  const counts = useMemo(() => {
    const list = attendees ?? [];

    return {
      all: list.length,
      verified: list.filter((attendee) => attendee.tier === "verified").length,
      self_reported: list.filter((attendee) => attendee.tier === "self_reported").length,
      none: list.filter((attendee) => attendee.tier === null).length,
    } satisfies Record<TierFilter, number>;
  }, [attendees]);

  const filtered = useMemo(() => filterAttendees(attendees ?? [], query, tierFilter), [attendees, query, tierFilter]);
  const visibleVerifiable = useMemo(() => filtered.filter(isVerifiable), [filtered]);

  /* The bulk action only ever covers rows that are on screen and still
     verifiable, so the count on the button is exactly what's visibly checked
     (a row that became verified, or one a filter hid, can't ride along). */
  const selectedIds = useMemo(
    () => visibleVerifiable.filter((attendee) => selected.has(attendee.userId)).map((attendee) => attendee.userId),
    [visibleVerifiable, selected]
  );
  const allVisibleSelected = visibleVerifiable.length > 0 && selectedIds.length === visibleVerifiable.length;
  const someVisibleSelected = selectedIds.length > 0 && !allVisibleSelected;

  function toggleSelected(userId: string) {
    setSelected((current) => {
      const next = new Set(current);

      if (next.has(userId)) {
        next.delete(userId);
      } else {
        next.add(userId);
      }

      return next;
    });
  }

  function toggleAllVisible() {
    setSelected((current) => {
      const next = new Set(current);

      for (const attendee of visibleVerifiable) {
        if (allVisibleSelected) {
          next.delete(attendee.userId);
        } else {
          next.add(attendee.userId);
        }
      }

      return next;
    });
  }

  /* Changing the search or tier drops selections the new view hides, so they
     don't silently come back checked when the filter is cleared. */
  function applyFilters(nextQuery: string, nextTier: TierFilter) {
    setQuery(nextQuery);
    setTierFilter(nextTier);

    const stillVisible = new Set(filterAttendees(attendees ?? [], nextQuery, nextTier).map((attendee) => attendee.userId));

    setSelected((current) => {
      const next = new Set([...current].filter((userId) => stillVisible.has(userId)));
      return next.size === current.size ? current : next;
    });
  }

  function clearFilters() {
    applyFilters("", "all");
  }

  async function verifySelected() {
    if (!selectedIds.length) {
      return;
    }

    setVerifying(true);
    setNotice(null);

    try {
      const response = await fetch(`/api/organizer/hackathons/${hackathonId}/attendees/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: selectedIds }),
      });
      const result = (await response.json().catch(() => null)) as
        | { data?: { verifiedUserIds: string[] }; error?: unknown }
        | null;

      if (!response.ok || !result?.data) {
        setNotice({ tone: "error", text: apiErrorMessage(result, "Could not verify attendees.") });
        return;
      }

      const verifiedIds = new Set(result.data.verifiedUserIds);

      setAttendees((current) =>
        current
          ? current.map((attendee) =>
              verifiedIds.has(attendee.userId)
                ? { ...attendee, tier: "verified" as const, bestSource: "organizer_verified" }
                : attendee
            )
          : current
      );
      setSelected(new Set());
      setNotice({
        tone: "success",
        text: verifiedIds.size
          ? `Verified attendance for ${verifiedIds.size} ${verifiedIds.size === 1 ? "hacker" : "hackers"}.`
          : "No check-ins were eligible for an upgrade. Hackers must check in before you can verify them.",
      });
      trackEvent("organizer_attendees_verified", {
        hackathon_id: hackathonId,
        verified_count: verifiedIds.size,
      });
    } catch {
      setNotice({ tone: "error", text: "Could not reach the server. Please try again." });
    } finally {
      setVerifying(false);
    }
  }

  return (
    <section aria-labelledby={`${searchId}-heading`} className="space-y-4">
      <div>
        <h2 className="flex items-center gap-2 text-base font-semibold text-ink" id={`${searchId}-heading`}>
          <Users aria-hidden="true" className="size-4 text-pine" />
          Attendees
        </h2>
        <p className="mt-1 text-sm leading-6 text-ink/55">
          Hackers who checked in or marked this hackathon as attended. Select self-reported attendees you can vouch for
          and mark them as organizer verified.
        </p>
      </div>

      {loadState === "loading" ? (
        <AttendeesSkeleton />
      ) : loadState === "error" ? (
        <div className="rounded-2xl border border-danger/20 bg-danger-soft p-4" role="alert">
          <p className="flex items-start gap-2 text-sm font-semibold text-danger">
            <AlertTriangle aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
            {loadError ?? "Could not load attendees."}
          </p>
          <button className={`${secondaryButtonClassName} mt-3`} onClick={retry} type="button">
            <RotateCcw aria-hidden="true" className="size-4" />
            Try again
          </button>
        </div>
      ) : !attendees || attendees.length === 0 ? (
        <div className={`${cardClassName} flex flex-col items-center gap-2 px-5 py-10 text-center`}>
          <Users aria-hidden="true" className="size-6 text-ink/35" />
          <p className="text-sm font-semibold text-ink">No one has marked this hackathon as attending yet</p>
          <p className="max-w-sm text-sm text-ink/55">
            Hackers show up here once they check in with your code or mark the hackathon as attended.
          </p>
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-2 md:flex-row md:flex-wrap md:items-center md:gap-3">
            <div className="relative min-w-0 md:flex-1 md:basis-56">
              <label className="sr-only" htmlFor={searchId}>
                Search attendees by name or email
              </label>
              <Search
                aria-hidden="true"
                className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-ink/35"
              />
              <input
                className={`${inputClassName} min-h-11 pl-9`}
                id={searchId}
                onChange={(event) => applyFilters(event.target.value, tierFilter)}
                placeholder="Search name or email"
                type="search"
                value={query}
              />
            </div>

            {/* One segmented row; on phones it scrolls sideways instead of wrapping. */}
            <div className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
              <div
                aria-label="Filter by attendance tier"
                className="flex w-max gap-1 rounded-xl border border-ink/10 bg-paper p-1"
                role="group"
              >
                {TIER_FILTERS.map((option) => {
                  const active = tierFilter === option.value;

                  return (
                    <button
                      aria-pressed={active}
                      className={`inline-flex min-h-10 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm font-semibold transition-colors sm:min-h-9 ${focusRingClassName} ${
                        active ? "bg-surface text-ink shadow-sm ring-1 ring-ink/10" : "text-ink/55 hover:text-ink"
                      }`}
                      key={option.value}
                      onClick={() => applyFilters(query, option.value)}
                      type="button"
                    >
                      {option.label}
                      <span className="tabular-nums text-xs font-medium text-ink/55">{counts[option.value]}</span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Phones get this button in the list header instead, beside "Select all". */}
            <div className="hidden shrink-0 md:block">
              <VerifyButton count={selectedIds.length} onClick={verifySelected} verifying={verifying} />
            </div>
          </div>

          <p aria-live="polite" className="sr-only" role="status">
            {notice?.text ?? ""}
          </p>
          {notice ? (
            <p className={`text-sm font-semibold ${statusTextClassName(notice.tone)}`}>{notice.text}</p>
          ) : null}

          {filtered.length === 0 ? (
            <div className={`${cardClassName} flex flex-col items-center gap-3 px-5 py-10 text-center`}>
              <p className="text-sm font-semibold text-ink">No attendees match these filters</p>
              <button className={secondaryButtonClassName} onClick={clearFilters} type="button">
                <X aria-hidden="true" className="size-4" />
                Clear filters
              </button>
            </div>
          ) : (
            <div className={`${cardClassName} overflow-hidden`}>
              <div className="flex items-center gap-1 border-b border-ink/10 bg-paper/60 pr-4 text-xs font-semibold uppercase tracking-[0.14em] text-ink/55 md:grid md:grid-cols-[2.75rem_minmax(0,1fr)_7rem_9.5rem_8.5rem] md:gap-3">
                <CheckboxCell
                  checked={allVisibleSelected}
                  disabled={!visibleVerifiable.length}
                  indeterminate={someVisibleSelected}
                  label={
                    allVisibleSelected
                      ? "Deselect all self-reported attendees shown"
                      : "Select all self-reported attendees shown"
                  }
                  onChange={toggleAllVisible}
                />
                <span className="min-w-0 flex-1 truncate text-sm font-medium normal-case tracking-normal md:hidden">
                  Select all ({visibleVerifiable.length})
                </span>
                <div className="shrink-0 py-1.5 normal-case tracking-normal md:hidden">
                  <VerifyButton compact count={selectedIds.length} onClick={verifySelected} verifying={verifying} />
                </div>
                <span className="hidden md:block">Hacker</span>
                <span className="hidden md:block">Status</span>
                <span className="hidden md:block">Best source</span>
                <span className="hidden md:block">Attendance</span>
              </div>

              <ul className="divide-y divide-ink/10">
                {filtered.map((attendee) => {
                  const verifiable = isVerifiable(attendee);

                  return (
                    <li
                      className="flex items-start gap-1 py-2 pr-4 md:grid md:grid-cols-[2.75rem_minmax(0,1fr)_7rem_9.5rem_8.5rem] md:items-center md:gap-3"
                      key={attendee.userId}
                    >
                      {verifiable ? (
                        <CheckboxCell
                          checked={selected.has(attendee.userId)}
                          label={`Select ${attendee.name}`}
                          onChange={() => toggleSelected(attendee.userId)}
                        />
                      ) : (
                        <span aria-hidden="true" className="size-11 shrink-0" />
                      )}

                      <div className="min-w-0 flex-1 py-1.5 md:py-0">
                        <p className="truncate text-sm font-semibold text-ink">{attendee.name}</p>
                        <p className="truncate text-sm text-ink/55">{attendee.email}</p>
                        {/* Each separator leads the item after it, so a wrap never leaves a dot ending a line. */}
                        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-ink/55 md:hidden">
                          <AttendeeTierBadge tier={attendee.tier} />
                          <span className="flex flex-wrap gap-x-1.5 [&>*+*]:before:mr-1.5 [&>*+*]:before:content-['·']">
                            <span>{applicationStatusLabel(attendee.applicationStatus)}</span>
                            <span>{sourceLabel(attendee.bestSource)}</span>
                          </span>
                        </div>
                      </div>

                      <span className="hidden text-sm text-ink/70 md:block">
                        {applicationStatusLabel(attendee.applicationStatus)}
                      </span>
                      <span className="hidden text-sm text-ink/70 md:block">{sourceLabel(attendee.bestSource)}</span>
                      <span className="hidden md:block">
                        <AttendeeTierBadge tier={attendee.tier} />
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          )}
        </>
      )}
    </section>
  );
}
