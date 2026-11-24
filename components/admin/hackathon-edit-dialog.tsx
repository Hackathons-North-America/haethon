"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";

import type { AdminHackathonListItem } from "@/components/admin/hackathon-admin-item";
import { previewPayloadToCard } from "@/components/admin/hackathon-card-preview";
import { HackathonCard } from "@/components/hackathon-card";
import { HACKATHON_SOURCES, sourceBadge } from "@/lib/hackathons/source-provenance";
import { dateToInputValue } from "@/lib/hackathons/utils";

const inputClassName =
  "w-full rounded-xl border border-ink/15 bg-surface px-3 py-2 text-sm text-ink outline-none focus:border-pine focus:ring-2 focus:ring-pine/15";
const checkboxClassName =
  "size-4 rounded border-ink/20 text-pine focus:ring-pine/20";
const labelClassName = "mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-ink/55";

function itemToPreviewPayload(item: AdminHackathonListItem): Record<string, unknown> {
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
    source: item.source ?? "",
  };
}

/* "2026-11-01" from a date input -> the ISO string the server would store
   (dateToInputValue reads dates back in UTC, so this round-trips). */
function dateInputToIso(value: string) {
  return value ? `${value}T00:00:00.000Z` : null;
}

/* The listing as it will look once the PATCH lands, so the grid card can
   update the moment the dialog closes. The server's response replaces it. */
function optimisticItem(item: AdminHackathonListItem, body: Record<string, string | boolean>): AdminHackathonListItem {
  const text = (key: string) => (typeof body[key] === "string" && (body[key] as string).trim()) || null;
  const prize = Number(body.prizeAmountUsd);

  return {
    ...item,
    name: text("name") ?? item.name,
    shortDescription: text("shortDescription"),
    websiteUrl: text("websiteUrl"),
    imageUrl: text("imageUrl"),
    applicationUrl: text("applicationUrl"),
    venue: text("venue"),
    city: text("city"),
    region: text("region"),
    country: text("country"),
    startsAt: dateInputToIso(String(body.startDate ?? "")),
    endsAt: dateInputToIso(String(body.endDate ?? "")),
    applicationOpensAt: dateInputToIso(String(body.applicationOpensAt ?? "")),
    applicationClosesAt: dateInputToIso(String(body.applicationClosesAt ?? "")),
    acceptanceAt: dateInputToIso(String(body.acceptanceAt ?? "")),
    format: body.format === "online" ? "online" : "in_person",
    beginnerFriendly: body.beginnerFriendly === true,
    travelReimbursement: body.travelReimbursement === true,
    highSchoolersOnly: body.highSchoolersOnly === true,
    prizeAmountUsd: body.prizeAmountUsd !== "" && Number.isFinite(prize) ? prize : null,
    discordChannelId: text("discordChannelId"),
    source: text("source") as AdminHackathonListItem["source"],
  };
}

/* Modal editor for a single published hackathon. Opens with every known field
   pre-populated; a live preview card at the top mirrors edits as they are typed.
   Saving hands the request body and an optimistic copy of the listing to the
   caller, which closes (hides) the dialog and PATCHes in the background. The
   dialog stays mounted while hidden, so a rejected save can reopen it with
   every edit intact and the server's error shown. */
export function HackathonEditDialog({
  error,
  hidden = false,
  item,
  onClose,
  onSubmit,
}: {
  error: string | null;
  hidden?: boolean;
  item: AdminHackathonListItem;
  onClose: () => void;
  onSubmit: (body: Record<string, string | boolean>, optimistic: AdminHackathonListItem) => void;
}) {
  const [previewPayload, setPreviewPayload] = useState<Record<string, unknown>>(() => itemToPreviewPayload(item));

  // Close on Escape, and lock body scroll while the modal is visible.
  useEffect(() => {
    if (hidden) {
      return;
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        onClose();
      }
    }

    document.addEventListener("keydown", handleKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [hidden, onClose]);

  function updatePreview(key: string, nextValue: unknown) {
    if (!key) {
      return;
    }

    setPreviewPayload((current) => ({ ...current, [key]: nextValue }));
  }

  function saveChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);

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
      discordChannelId: formData.get("discordChannelId")?.toString() ?? "",
      source: formData.get("source")?.toString() ?? "",
    };

    onSubmit(body, optimisticItem(item, body));
  }

  return (
    <div
      aria-modal="true"
      className={`fixed inset-0 z-50 ${hidden ? "hidden" : "flex"} items-start justify-center overflow-y-auto bg-ink/50 p-4 backdrop-blur-sm sm:p-6`}
      onMouseDown={(event) => {
        // Only dismiss when the backdrop itself is pressed, not on a drag that
        // started inside the panel and released on the overlay.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <div className="my-8 w-full max-w-3xl rounded-2xl border border-ink/10 bg-surface p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">Edit listing</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-ink">{item.name}</h2>
          </div>
          <button
            aria-label="Close editor"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-ink/15 text-ink hover:border-ink"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-6 lg:self-start">
            <HackathonCard
              hackathon={{
                ...previewPayloadToCard(previewPayload, item.id),
              }}
              preview
            />
          </div>

          <form onSubmit={saveChanges}>
            <div
              className="grid gap-4 sm:grid-cols-2"
              onChange={(event) => {
                const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
                updatePreview(
                  target.name,
                  target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value
                );
              }}
            >
              <div className="sm:col-span-2">
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
                <label className={labelClassName} htmlFor={`${item.id}-source`}>
                  Source
                </label>
                <select
                  id={`${item.id}-source`}
                  name="source"
                  defaultValue={item.source ?? ""}
                  className={inputClassName}
                >
                  <option value="">None (cards show &quot;Other&quot;)</option>
                  {HACKATHON_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {sourceBadge(source).label}
                    </option>
                  ))}
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
              <div className="sm:col-span-2">
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
              <div className="sm:col-span-2">
                <label className={labelClassName} htmlFor={`${item.id}-discordChannelId`}>
                  Discord channel ID
                </label>
                <input
                  aria-describedby={`${item.id}-discordChannelId-note`}
                  autoComplete="off"
                  className={inputClassName}
                  defaultValue={item.discordChannelId ?? ""}
                  id={`${item.id}-discordChannelId`}
                  inputMode="numeric"
                  maxLength={20}
                  name="discordChannelId"
                  pattern="[0-9]{17,20}"
                  placeholder="123456789012345678"
                  required={item.discordChannelId !== null}
                />
                <p
                  id={`${item.id}-discordChannelId-note`}
                  className="mt-1 text-xs leading-5 text-ink/55"
                >
                  {item.discordChannelId
                    ? "Paste a different channel ID to reassign this hackathon. The old Discord channel is left untouched."
                    : "Paste the ID of an existing text channel in the configured Discord server."}
                </p>
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-ink/10 bg-paper px-3 py-2 text-sm font-semibold text-ink">
                <input className={checkboxClassName} defaultChecked={item.beginnerFriendly} name="beginnerFriendly" type="checkbox" />
                Beginner friendly
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-ink/10 bg-paper px-3 py-2 text-sm font-semibold text-ink">
                <input
                  className={checkboxClassName}
                  defaultChecked={item.travelReimbursement}
                  name="travelReimbursement"
                  type="checkbox"
                />
                Travel support
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-ink/10 bg-paper px-3 py-2 text-sm font-semibold text-ink">
                <input
                  className={checkboxClassName}
                  defaultChecked={item.highSchoolersOnly}
                  name="highSchoolersOnly"
                  type="checkbox"
                />
                High school only
              </label>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-pine px-5 text-sm font-semibold text-paper hover:bg-pine/90 disabled:opacity-50"
                type="submit"
              >
                Save changes
              </button>
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink/15 px-4 text-sm font-semibold text-ink disabled:opacity-50"
                onClick={onClose}
                type="button"
              >
                Cancel
              </button>
              {error ? <p className="text-sm font-semibold text-danger">{error}</p> : null}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
