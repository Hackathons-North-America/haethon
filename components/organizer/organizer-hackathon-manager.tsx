"use client";

import { FormEvent, useEffect, useState } from "react";
import { ChevronDown, ChevronUp, KeyRound, RefreshCw, Users } from "lucide-react";

import { previewPayloadToCard } from "@/components/admin/hackathon-card-preview";
import type { AdminHackathonListItem } from "@/components/admin/published-hackathon-manager";
import { HackathonCard } from "@/components/hackathon-card";
import { trackEvent } from "@/lib/analytics/events";
import { dateToInputValue } from "@/lib/hackathons/utils";

export type OrganizerHackathonItem = AdminHackathonListItem;

type CheckinCode = {
  code: string;
  createdAt: string;
  expiresAt: string | null;
};

type Attendee = {
  userId: string;
  name: string;
  email: string;
  applicationStatus: string | null;
  bestSource: string | null;
  tier: "verified" | "self_reported" | null;
};

const inputClassName =
  "w-full rounded-xl border border-navy/15 dark:border-white/15 bg-white dark:bg-white/[0.06] px-3 py-2 text-sm text-navy dark:text-wheat outline-none focus:border-cabernet focus:ring-2 focus:ring-cabernet/15";
const checkboxClassName = "size-4 rounded border-navy/20 dark:border-white/20 text-cabernet dark:text-[#e4a3ab] focus:ring-cabernet/20";
const labelClassName = "mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-navy/55 dark:text-wheat/55";
const panelTitleClassName = "flex items-center gap-2 text-sm font-semibold uppercase tracking-[0.14em] text-rust";

function itemToPreviewPayload(item: OrganizerHackathonItem): Record<string, unknown> {
  return {
    name: item.name,
    shortDescription: item.shortDescription ?? "",
    websiteUrl: item.websiteUrl ?? "",
    imageUrl: item.imageUrl ?? "",
    city: item.city ?? "",
    region: item.region ?? "",
    country: item.country ?? "",
    startDate: item.startsAt ?? "",
    endDate: item.endsAt ?? "",
    format: item.format,
    beginnerFriendly: item.beginnerFriendly,
    travelReimbursement: item.travelReimbursement,
    highSchoolersOnly: item.highSchoolersOnly,
    prizeAmountUsd: item.prizeAmountUsd ?? "",
  };
}

function formatDateRange(startsAt: string | null, endsAt: string | null) {
  if (!startsAt) {
    return "Dates TBD";
  }

  const options: Intl.DateTimeFormatOptions = { month: "short", day: "numeric", year: "numeric" };
  const start = new Date(startsAt).toLocaleDateString("en-US", options);

  return endsAt ? `${start} - ${new Date(endsAt).toLocaleDateString("en-US", options)}` : start;
}

function CheckinCodePanel({ hackathonId }: { hackathonId: string }) {
  const [code, setCode] = useState<CheckinCode | null>(null);
  const [status, setStatus] = useState<"loading" | "idle" | "generating" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/organizer/hackathons/${hackathonId}/checkin-code`)
      .then(async (response) => {
        const result = (await response.json().catch(() => null)) as { data?: CheckinCode | null; error?: unknown } | null;

        if (cancelled) {
          return;
        }

        if (!response.ok) {
          setStatus("error");
          setMessage(typeof result?.error === "string" ? result.error : "Could not load the check-in code.");
          return;
        }

        setCode(result?.data ?? null);
        setStatus("idle");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          setMessage("Could not load the check-in code.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hackathonId]);

  async function generateCode() {
    setStatus("generating");
    setMessage(null);

    try {
      const response = await fetch(`/api/organizer/hackathons/${hackathonId}/checkin-code`, { method: "POST" });
      const result = (await response.json().catch(() => null)) as { data?: CheckinCode; error?: unknown } | null;

      if (!response.ok || !result?.data) {
        setStatus("error");
        setMessage(typeof result?.error === "string" ? result.error : "Could not generate a code. Please try again.");
        return;
      }

      setCode(result.data);
      setStatus("idle");
      setMessage("New code generated. Previous codes are now revoked.");
      trackEvent("organizer_checkin_code_generated", { hackathon_id: hackathonId });
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Please try again.");
    }
  }

  return (
    <section className="rounded-xl p-5">
      <h3 className={panelTitleClassName}>
        <KeyRound aria-hidden="true" className="size-4" />
        Attendance check-in code
      </h3>
      <p className="mt-2 text-sm leading-6 text-navy/55 dark:text-wheat/55">
        Share this code with hackers at the venue. They enter it in the app to verify their attendance. Generating a new
        code revokes the current one.
      </p>

      {status === "loading" ? (
        <p className="mt-4 text-sm text-navy/55 dark:text-wheat/55">Loading code...</p>
      ) : (
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {code ? (
            <span className="rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-4 py-2 font-mono text-2xl font-semibold tracking-[0.2em] text-navy dark:text-wheat">
              {code.code}
            </span>
          ) : (
            <span className="text-sm font-semibold text-navy/55 dark:text-wheat/55">No active code yet.</span>
          )}
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-cabernet px-4 text-sm font-semibold text-wheat dark:bg-wheat dark:text-[#141414] dark:hover:bg-white disabled:opacity-50"
            disabled={status === "generating"}
            onClick={generateCode}
            type="button"
          >
            <RefreshCw aria-hidden="true" className="size-4" />
            {status === "generating" ? "Generating..." : code ? "Generate new code" : "Generate code"}
          </button>
        </div>
      )}

      {code ? (
        <p className="mt-3 text-xs text-navy/55 dark:text-wheat/55">
          Created {new Date(code.createdAt).toLocaleString()}
          {code.expiresAt ? ` · Expires ${new Date(code.expiresAt).toLocaleString()}` : ""}
        </p>
      ) : null}
      {message ? (
        <p className={`mt-3 text-sm font-semibold ${status === "error" ? "text-[#B42318]" : "text-[#027A48]"}`}>{message}</p>
      ) : null}
    </section>
  );
}

function AttendeeTierBadge({ tier }: { tier: Attendee["tier"] }) {
  if (tier === "verified") {
    return <span className="rounded-full bg-[#027A48]/10 px-2.5 py-0.5 text-xs font-semibold text-[#027A48]">Verified</span>;
  }

  if (tier === "self_reported") {
    return <span className="rounded-full bg-[#B54708]/10 px-2.5 py-0.5 text-xs font-semibold text-[#B54708]">Self-reported</span>;
  }

  return <span className="rounded-full bg-navy/5 dark:bg-white/5 px-2.5 py-0.5 text-xs font-semibold text-navy/55 dark:text-wheat/55">No check-in</span>;
}

function AttendeesPanel({ hackathonId }: { hackathonId: string }) {
  const [attendees, setAttendees] = useState<Attendee[] | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<"loading" | "idle" | "verifying" | "error">("loading");
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    fetch(`/api/organizer/hackathons/${hackathonId}/attendees`)
      .then(async (response) => {
        const result = (await response.json().catch(() => null)) as { data?: Attendee[]; error?: unknown } | null;

        if (cancelled) {
          return;
        }

        if (!response.ok || !result?.data) {
          setStatus("error");
          setMessage(typeof result?.error === "string" ? result.error : "Could not load attendees.");
          return;
        }

        setAttendees(result.data);
        setStatus("idle");
      })
      .catch(() => {
        if (!cancelled) {
          setStatus("error");
          setMessage("Could not load attendees.");
        }
      });

    return () => {
      cancelled = true;
    };
  }, [hackathonId]);

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

  async function verifySelected() {
    if (!selected.size) {
      return;
    }

    setStatus("verifying");
    setMessage(null);

    try {
      const response = await fetch(`/api/organizer/hackathons/${hackathonId}/attendees/verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userIds: [...selected] }),
      });
      const result = (await response.json().catch(() => null)) as
        | { data?: { verifiedUserIds: string[] }; error?: unknown }
        | null;

      if (!response.ok || !result?.data) {
        setStatus("error");
        setMessage(typeof result?.error === "string" ? result.error : "Could not verify attendees.");
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
      setStatus("idle");
      setMessage(
        verifiedIds.size
          ? `Verified attendance for ${verifiedIds.size} ${verifiedIds.size === 1 ? "hacker" : "hackers"}.`
          : "No check-ins were eligible for an upgrade. Hackers must check in before you can verify them."
      );
      trackEvent("organizer_attendees_verified", {
        hackathon_id: hackathonId,
        verified_count: verifiedIds.size,
      });
    } catch {
      setStatus("error");
      setMessage("Could not reach the server. Please try again.");
    }
  }

  const selectable = attendees?.filter((attendee) => attendee.tier === "self_reported") ?? [];

  return (
    <section className="rounded-xl p-5">
      <h3 className={panelTitleClassName}>
        <Users aria-hidden="true" className="size-4" />
        Attendees
      </h3>
      <p className="mt-2 text-sm leading-6 text-navy/55 dark:text-wheat/55">
        Hackers who checked in or marked this hackathon as attended. Select self reported attendees you can vouch for and
        mark them as organizer verified.
      </p>

      {status === "loading" ? (
        <p className="mt-4 text-sm text-navy/55 dark:text-wheat/55">Loading attendees...</p>
      ) : attendees && attendees.length ? (
        <>
          <div className="mt-4 overflow-x-auto">
            <table className="w-full min-w-[32rem] text-left text-sm">
              <thead>
                <tr className="border-b border-navy/10 dark:border-white/10 text-xs font-semibold uppercase tracking-[0.14em] text-navy/55 dark:text-wheat/55">
                  <th className="w-10 py-2" />
                  <th className="py-2 pr-4">Hacker</th>
                  <th className="py-2 pr-4">Email</th>
                  <th className="py-2 pr-4">Status</th>
                  <th className="py-2">Attendance</th>
                </tr>
              </thead>
              <tbody>
                {attendees.map((attendee) => (
                  <tr className="border-b border-navy/5 dark:border-white/5" key={attendee.userId}>
                    <td className="py-2.5">
                      {attendee.tier === "self_reported" ? (
                        <input
                          aria-label={`Select ${attendee.name}`}
                          checked={selected.has(attendee.userId)}
                          className={checkboxClassName}
                          onChange={() => toggleSelected(attendee.userId)}
                          type="checkbox"
                        />
                      ) : null}
                    </td>
                    <td className="py-2.5 pr-4 font-semibold text-navy dark:text-wheat">{attendee.name}</td>
                    <td className="py-2.5 pr-4 text-navy/70 dark:text-wheat/70">{attendee.email}</td>
                    <td className="py-2.5 pr-4 capitalize text-navy/70 dark:text-wheat/70">{attendee.applicationStatus ?? "-"}</td>
                    <td className="py-2.5">
                      <AttendeeTierBadge tier={attendee.tier} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#027A48] px-4 text-sm font-semibold text-white disabled:opacity-50"
              disabled={status === "verifying" || !selected.size}
              onClick={verifySelected}
              type="button"
            >
              {status === "verifying" ? "Verifying..." : `Verify selected (${selected.size})`}
            </button>
            {selectable.length ? (
              <button
                className="text-sm font-semibold text-cabernet dark:text-[#e4a3ab] underline-offset-4 hover:underline"
                onClick={() => setSelected(new Set(selectable.map((attendee) => attendee.userId)))}
                type="button"
              >
                Select all self reported
              </button>
            ) : null}
          </div>
        </>
      ) : status !== "error" ? (
        <p className="mt-4 text-sm text-navy/55 dark:text-wheat/55">No attendees yet.</p>
      ) : null}

      {message ? (
        <p className={`mt-3 text-sm font-semibold ${status === "error" ? "text-[#B42318]" : "text-[#027A48]"}`}>{message}</p>
      ) : null}
    </section>
  );
}

function OrganizerHackathonPanel({ item: initialItem, defaultOpen }: { item: OrganizerHackathonItem; defaultOpen: boolean }) {
  const [item, setItem] = useState(initialItem);
  const [open, setOpen] = useState(defaultOpen);
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [previewPayload, setPreviewPayload] = useState<Record<string, unknown>>(() => itemToPreviewPayload(initialItem));

  function updatePreview(key: string, nextValue: unknown) {
    if (!key) {
      return;
    }

    setPreviewPayload((current) => ({ ...current, [key]: nextValue }));
  }

  async function saveChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

    setStatus("saving");
    setMessage(null);

    const body = {
      name: formData.get("name")?.toString() ?? item.name,
      shortDescription: formData.get("shortDescription")?.toString() ?? "",
      websiteUrl: formData.get("websiteUrl")?.toString() ?? "",
      imageUrl: formData.get("imageUrl")?.toString() ?? "",
      applicationUrl: formData.get("applicationUrl")?.toString() ?? "",
      venue: formData.get("venue")?.toString() ?? "",
      city: formData.get("city")?.toString() ?? "",
      region: formData.get("region")?.toString() ?? "",
      country: formData.get("country")?.toString() ?? "",
      startDate: formData.get("startDate")?.toString() ?? "",
      endDate: formData.get("endDate")?.toString() ?? "",
      applicationOpensAt: formData.get("applicationOpensAt")?.toString() ?? "",
      applicationClosesAt: formData.get("applicationClosesAt")?.toString() ?? "",
      acceptanceAt: formData.get("acceptanceAt")?.toString() ?? "",
      format: formData.get("format")?.toString() ?? item.format,
      beginnerFriendly: formData.get("beginnerFriendly") === "on",
      travelReimbursement: formData.get("travelReimbursement") === "on",
      highSchoolersOnly: formData.get("highSchoolersOnly") === "on",
      prizeAmountUsd: formData.get("prizeAmountUsd")?.toString() ?? "",
    };

    const response = await fetch(`/api/organizer/hackathons/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as { data?: OrganizerHackathonItem; error?: unknown };

    if (!response.ok || !result.data) {
      setStatus("error");
      setMessage(typeof result.error === "string" ? result.error : "Could not save changes. Check the required fields.");
      return;
    }

    setStatus("idle");
    setMessage("Changes saved.");
    setItem(result.data);
    setPreviewPayload(itemToPreviewPayload(result.data));
    trackEvent("organizer_hackathon_updated", {
      hackathon_id: result.data.id,
      hackathon_name: result.data.name,
      format: result.data.format,
      status: result.data.status,
    });
  }

  return (
    <article className="rounded-xl">
      <button
        aria-expanded={open}
        className="flex w-full flex-wrap items-center justify-between gap-3 px-5 py-4 text-left"
        onClick={() => setOpen((current) => !current)}
        type="button"
      >
        <span>
          <span className="block text-lg font-semibold text-navy dark:text-wheat">{item.name}</span>
          <span className="mt-0.5 block text-sm text-navy/55 dark:text-wheat/55">
            {formatDateRange(item.startsAt, item.endsAt)} · <span className="capitalize">{item.status}</span>
          </span>
        </span>
        {open ? (
          <ChevronUp aria-hidden="true" className="size-5 text-navy/55 dark:text-wheat/55" />
        ) : (
          <ChevronDown aria-hidden="true" className="size-5 text-navy/55 dark:text-wheat/55" />
        )}
      </button>

      {open ? (
        <div className="space-y-5 border-t border-navy/10 dark:border-white/10 p-5">
          <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.1fr)]">
            <div className="xl:sticky xl:top-6 xl:self-start">
              <HackathonCard
                hackathon={{ ...previewPayloadToCard(previewPayload, item.id), isSaved: false, voteScore: item.voteScore }}
                preview
              />
            </div>

            <form onSubmit={saveChanges}>
              <div
                className="grid gap-4 md:grid-cols-3"
                onChange={(event) => {
                  const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
                  updatePreview(
                    target.name,
                    target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value
                  );
                }}
              >
                <div className="md:col-span-2">
                  <label className={labelClassName} htmlFor={`${item.id}-name`}>
                    Event name
                  </label>
                  <input id={`${item.id}-name`} name="name" required defaultValue={item.name} className={inputClassName} />
                </div>
                <div>
                  <label className={labelClassName} htmlFor={`${item.id}-format`}>
                    Format
                  </label>
                  <select id={`${item.id}-format`} name="format" defaultValue={item.format} className={inputClassName}>
                    <option value="in_person">In person</option>
                    <option value="online">Online</option>
                  </select>
                </div>
                <div>
                  <label className={labelClassName} htmlFor={`${item.id}-websiteUrl`}>
                    Website
                  </label>
                  <input
                    id={`${item.id}-websiteUrl`}
                    name="websiteUrl"
                    type="url"
                    required
                    defaultValue={item.websiteUrl ?? ""}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor={`${item.id}-imageUrl`}>
                    Image URL
                  </label>
                  <input
                    id={`${item.id}-imageUrl`}
                    name="imageUrl"
                    type="url"
                    defaultValue={item.imageUrl ?? ""}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor={`${item.id}-applicationUrl`}>
                    Application
                  </label>
                  <input
                    id={`${item.id}-applicationUrl`}
                    name="applicationUrl"
                    type="url"
                    defaultValue={item.applicationUrl ?? ""}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor={`${item.id}-city`}>
                    City
                  </label>
                  <input id={`${item.id}-city`} name="city" defaultValue={item.city ?? ""} className={inputClassName} />
                </div>
                <div>
                  <label className={labelClassName} htmlFor={`${item.id}-region`}>
                    Region
                  </label>
                  <input id={`${item.id}-region`} name="region" defaultValue={item.region ?? ""} className={inputClassName} />
                </div>
                <div>
                  <label className={labelClassName} htmlFor={`${item.id}-country`}>
                    Country
                  </label>
                  <input
                    id={`${item.id}-country`}
                    name="country"
                    required
                    defaultValue={item.country ?? ""}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor={`${item.id}-venue`}>
                    Venue
                  </label>
                  <input id={`${item.id}-venue`} name="venue" defaultValue={item.venue ?? ""} className={inputClassName} />
                </div>
                <div>
                  <label className={labelClassName} htmlFor={`${item.id}-startDate`}>
                    Start
                  </label>
                  <input
                    id={`${item.id}-startDate`}
                    name="startDate"
                    type="date"
                    required
                    defaultValue={dateToInputValue(item.startsAt)}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor={`${item.id}-endDate`}>
                    End
                  </label>
                  <input
                    id={`${item.id}-endDate`}
                    name="endDate"
                    type="date"
                    required
                    defaultValue={dateToInputValue(item.endsAt)}
                    className={inputClassName}
                  />
                </div>
                <div className="md:col-span-2">
                  <label className={labelClassName} htmlFor={`${item.id}-shortDescription`}>
                    Description
                  </label>
                  <textarea
                    id={`${item.id}-shortDescription`}
                    name="shortDescription"
                    rows={3}
                    defaultValue={item.shortDescription ?? ""}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor={`${item.id}-applicationOpensAt`}>
                    Applications open
                  </label>
                  <input
                    id={`${item.id}-applicationOpensAt`}
                    name="applicationOpensAt"
                    type="date"
                    defaultValue={dateToInputValue(item.applicationOpensAt)}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor={`${item.id}-applicationClosesAt`}>
                    Applications close
                  </label>
                  <input
                    id={`${item.id}-applicationClosesAt`}
                    name="applicationClosesAt"
                    type="date"
                    defaultValue={dateToInputValue(item.applicationClosesAt)}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor={`${item.id}-acceptanceAt`}>
                    Acceptance
                  </label>
                  <input
                    id={`${item.id}-acceptanceAt`}
                    name="acceptanceAt"
                    type="date"
                    defaultValue={dateToInputValue(item.acceptanceAt)}
                    className={inputClassName}
                  />
                </div>
                <div>
                  <label className={labelClassName} htmlFor={`${item.id}-prizeAmountUsd`}>
                    Prize USD
                  </label>
                  <input
                    id={`${item.id}-prizeAmountUsd`}
                    name="prizeAmountUsd"
                    type="number"
                    min="0"
                    defaultValue={item.prizeAmountUsd ?? ""}
                    className={inputClassName}
                  />
                </div>
                <label className="flex items-center gap-2 rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-3 py-2 text-sm font-semibold text-navy dark:text-wheat">
                  <input
                    className={checkboxClassName}
                    defaultChecked={item.beginnerFriendly}
                    name="beginnerFriendly"
                    type="checkbox"
                  />
                  Beginner friendly
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-3 py-2 text-sm font-semibold text-navy dark:text-wheat">
                  <input
                    className={checkboxClassName}
                    defaultChecked={item.travelReimbursement}
                    name="travelReimbursement"
                    type="checkbox"
                  />
                  Travel support
                </label>
                <label className="flex items-center gap-2 rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-3 py-2 text-sm font-semibold text-navy dark:text-wheat">
                  <input
                    className={checkboxClassName}
                    defaultChecked={item.highSchoolersOnly}
                    name="highSchoolersOnly"
                    type="checkbox"
                  />
                  High school only
                </label>
              </div>

              <div className="mt-5 flex flex-wrap items-center gap-3">
                <button
                  className="inline-flex min-h-10 items-center gap-2 rounded-full bg-[#027A48] px-4 text-sm font-semibold text-white disabled:opacity-50"
                  disabled={status === "saving"}
                  type="submit"
                >
                  {status === "saving" ? "Saving..." : "Save changes"}
                </button>
                {message ? (
                  <p className={`text-sm font-semibold ${status === "error" ? "text-[#B42318]" : "text-[#027A48]"}`}>
                    {message}
                  </p>
                ) : null}
              </div>
            </form>
          </div>

          <div className="grid gap-5 xl:grid-cols-2">
            <CheckinCodePanel hackathonId={item.id} />
            <AttendeesPanel hackathonId={item.id} />
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function OrganizerHackathonManager({
  current,
  past,
}: {
  current: OrganizerHackathonItem[];
  past: OrganizerHackathonItem[];
}) {
  const [query, setQuery] = useState("");
  const normalizedQuery = query.trim().toLowerCase();
  const matches = (item: OrganizerHackathonItem) => item.name.toLowerCase().includes(normalizedQuery);
  const filteredCurrent = normalizedQuery ? current.filter(matches) : current;
  const filteredPast = normalizedQuery ? past.filter(matches) : past;

  if (!current.length && !past.length) {
    return (
      <p className="rounded-xl p-6 text-sm leading-6 text-navy/55 dark:text-wheat/55">
        No hackathons are linked to your organizer account yet. Submit your hackathon from the{" "}
        <a className="font-semibold text-cabernet dark:text-[#e4a3ab] underline-offset-4 hover:underline" href="/submit">
          submit page
        </a>{" "}
        and it will show up here once approved.
      </p>
    );
  }

  return (
    <div className="space-y-8">
      {current.length + past.length > 6 ? (
        <input
          aria-label="Filter hackathons by name"
          className={`${inputClassName} max-w-sm`}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Filter by name..."
          value={query}
        />
      ) : null}

      {filteredCurrent.length ? (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-rust">Current & upcoming</h2>
          {filteredCurrent.map((item, index) => (
            <OrganizerHackathonPanel defaultOpen={index === 0 && !normalizedQuery} item={item} key={item.id} />
          ))}
        </section>
      ) : null}

      {filteredPast.length ? (
        <section className="space-y-4">
          <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-rust">Past hackathons</h2>
          {filteredPast.map((item) => (
            <OrganizerHackathonPanel defaultOpen={false} item={item} key={item.id} />
          ))}
        </section>
      ) : null}

      {normalizedQuery && !filteredCurrent.length && !filteredPast.length ? (
        <p className="rounded-xl p-6 text-sm text-navy/55 dark:text-wheat/55">
          No hackathons match &ldquo;{query}&rdquo;.
        </p>
      ) : null}
    </div>
  );
}
