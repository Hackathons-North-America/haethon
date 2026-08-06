"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";

import { HackathonCardPreview, type PreviewPayload } from "@/components/admin/hackathon-card-preview";
import { HACKATHON_SOURCES, sourceBadge } from "@/lib/hackathons/source-provenance";
import { dateToInputValue } from "@/lib/hackathons/utils";

const inputClassName =
  "w-full rounded-xl border border-ink/15 dark:border-white/15 bg-white dark:bg-white/[0.06] px-3 py-2 text-sm text-ink dark:text-paper outline-none focus:border-pine focus:ring-2 focus:ring-pine/15";
const checkboxClassName =
  "size-4 rounded border-ink/20 dark:border-white/20 text-pine dark:text-moss focus:ring-pine/20";
const labelClassName = "mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-ink/55 dark:text-paper/55";

function text(payload: PreviewPayload, key: string) {
  const value = payload[key];

  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

/* Optional import-schema fields the form can leave blank. Blank values are
   removed from the payload entirely so the collected-data panel and the import
   endpoint see the same shape a scraper export would produce. */
const optionalTextFields = [
  "organizationName",
  "imageUrl",
  "sourceUrl",
  "applicationUrl",
  "externalId",
  "venue",
  "city",
  "region",
  "shortDescription",
  "prizeAmountUsd",
  "timeNote",
  "applicationOpensAt",
  "applicationClosesAt",
  "acceptanceAt",
] as const;

/* Modal editor for one queued import card. Mirrors the published-hackathon
   edit dialog, but nothing is persisted here: saving hands the corrected
   payload back to the review queue, and the import only happens when the
   admin approves the card. */
export function HackathonImportEditDialog({
  payload,
  onClose,
  onSave,
}: {
  payload: PreviewPayload;
  onClose: () => void;
  onSave: (updated: PreviewPayload) => void;
}) {
  const [previewPayload, setPreviewPayload] = useState<PreviewPayload>(payload);

  // Close on Escape, and lock body scroll while the modal is open.
  useEffect(() => {
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
  }, [onClose]);

  function updatePreview(key: string, nextValue: unknown) {
    if (!key) {
      return;
    }

    setPreviewPayload((current) => ({ ...current, [key]: nextValue }));
  }

  function saveChanges(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formData = new FormData(event.currentTarget);
    const field = (key: string) => formData.get(key)?.toString().trim() ?? "";

    // Spread first so scraper-only keys (seriesName, countryCode, coordinates,
    // anything else in the export) survive an edit untouched.
    const next: PreviewPayload = {
      ...payload,
      name: field("name"),
      websiteUrl: field("websiteUrl"),
      country: field("country"),
      startDate: field("startDate"),
      endDate: field("endDate"),
      format: field("format"),
      beginnerFriendly: formData.get("beginnerFriendly") === "on",
      travelReimbursement: formData.get("travelReimbursement") === "on",
      highSchoolersOnly: formData.get("highSchoolersOnly") === "on",
    };

    for (const key of optionalTextFields) {
      const value = field(key);

      if (value) {
        next[key] = value;
      } else {
        delete next[key];
      }
    }

    // The import schema's source is an optional enum with no empty-string
    // preprocessing, so the None option must drop the key rather than send "".
    const source = field("source");

    if (source) {
      next.source = source;
    } else {
      delete next.source;
    }

    onSave(next);
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-ink/50 p-4 backdrop-blur-sm dark:bg-black/60 sm:p-6"
      onMouseDown={(event) => {
        // Only dismiss when the backdrop itself is pressed, not on a drag that
        // started inside the panel and released on the overlay.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <div className="my-8 w-full max-w-3xl rounded-2xl border border-ink/10 dark:border-white/10 bg-white dark:bg-[#1b1b1b] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-pine">Edit import card</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-ink dark:text-paper">
              {text(payload, "name") || "Untitled hackathon"}
            </h2>
            <p className="mt-1 text-sm text-ink/55 dark:text-paper/55">
              Changes apply to this card only. Nothing imports until you approve it.
            </p>
          </div>
          <button
            aria-label="Close editor"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-ink/15 dark:border-white/15 text-ink dark:text-paper hover:border-ink dark:hover:border-white/60"
            onClick={onClose}
            type="button"
          >
            <X aria-hidden="true" className="size-4" />
          </button>
        </div>

        <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
          <div className="lg:sticky lg:top-6 lg:self-start">
            <HackathonCardPreview payload={previewPayload} previewId="import-edit-preview" />
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
                <label className={labelClassName} htmlFor="import-edit-name">
                  Event name
                </label>
                <input id="import-edit-name" name="name" required defaultValue={text(payload, "name")} className={inputClassName} />
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-format">
                  Format
                </label>
                <select id="import-edit-format" name="format" defaultValue={text(payload, "format") || "in_person"} className={inputClassName}>
                  <option value="in_person">In person</option>
                  <option value="online">Online</option>
                </select>
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-source">
                  Source
                </label>
                <select id="import-edit-source" name="source" defaultValue={text(payload, "source")} className={inputClassName}>
                  <option value="">None (no badge)</option>
                  {HACKATHON_SOURCES.map((source) => (
                    <option key={source} value={source}>
                      {sourceBadge(source).label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-organizationName">
                  Organization
                </label>
                <input
                  id="import-edit-organizationName"
                  name="organizationName"
                  defaultValue={text(payload, "organizationName")}
                  className={inputClassName}
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-externalId">
                  External ID
                </label>
                <input
                  id="import-edit-externalId"
                  name="externalId"
                  defaultValue={text(payload, "externalId")}
                  className={inputClassName}
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-websiteUrl">
                  Website
                </label>
                <input
                  id="import-edit-websiteUrl"
                  name="websiteUrl"
                  type="url"
                  required
                  defaultValue={text(payload, "websiteUrl")}
                  className={inputClassName}
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-sourceUrl">
                  Source URL
                </label>
                <input
                  id="import-edit-sourceUrl"
                  name="sourceUrl"
                  type="url"
                  defaultValue={text(payload, "sourceUrl")}
                  className={inputClassName}
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-imageUrl">
                  Image URL
                </label>
                <input
                  id="import-edit-imageUrl"
                  name="imageUrl"
                  type="url"
                  defaultValue={text(payload, "imageUrl")}
                  className={inputClassName}
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-applicationUrl">
                  Application
                </label>
                <input
                  id="import-edit-applicationUrl"
                  name="applicationUrl"
                  type="url"
                  defaultValue={text(payload, "applicationUrl")}
                  className={inputClassName}
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-venue">
                  Venue
                </label>
                <input id="import-edit-venue" name="venue" defaultValue={text(payload, "venue")} className={inputClassName} />
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-city">
                  City
                </label>
                <input id="import-edit-city" name="city" defaultValue={text(payload, "city")} className={inputClassName} />
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-region">
                  Region
                </label>
                <input id="import-edit-region" name="region" defaultValue={text(payload, "region")} className={inputClassName} />
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-country">
                  Country
                </label>
                <input
                  id="import-edit-country"
                  name="country"
                  required
                  defaultValue={text(payload, "country")}
                  className={inputClassName}
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-startDate">
                  Start
                </label>
                <input
                  id="import-edit-startDate"
                  name="startDate"
                  type="date"
                  required
                  defaultValue={dateToInputValue(text(payload, "startDate"))}
                  className={inputClassName}
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-endDate">
                  End
                </label>
                <input
                  id="import-edit-endDate"
                  name="endDate"
                  type="date"
                  required
                  defaultValue={dateToInputValue(text(payload, "endDate"))}
                  className={inputClassName}
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-applicationOpensAt">
                  Applications open
                </label>
                <input
                  id="import-edit-applicationOpensAt"
                  name="applicationOpensAt"
                  type="date"
                  defaultValue={dateToInputValue(text(payload, "applicationOpensAt"))}
                  className={inputClassName}
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-applicationClosesAt">
                  Applications close
                </label>
                <input
                  id="import-edit-applicationClosesAt"
                  name="applicationClosesAt"
                  type="date"
                  defaultValue={dateToInputValue(text(payload, "applicationClosesAt"))}
                  className={inputClassName}
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-acceptanceAt">
                  Acceptance
                </label>
                <input
                  id="import-edit-acceptanceAt"
                  name="acceptanceAt"
                  type="date"
                  defaultValue={dateToInputValue(text(payload, "acceptanceAt"))}
                  className={inputClassName}
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-prizeAmountUsd">
                  Prize USD
                </label>
                <input
                  id="import-edit-prizeAmountUsd"
                  name="prizeAmountUsd"
                  type="number"
                  min="0"
                  defaultValue={text(payload, "prizeAmountUsd")}
                  className={inputClassName}
                />
              </div>
              <div>
                <label className={labelClassName} htmlFor="import-edit-timeNote">
                  Time note
                </label>
                <input id="import-edit-timeNote" name="timeNote" defaultValue={text(payload, "timeNote")} className={inputClassName} />
              </div>
              <div className="sm:col-span-2">
                <label className={labelClassName} htmlFor="import-edit-shortDescription">
                  Description
                </label>
                <textarea
                  id="import-edit-shortDescription"
                  name="shortDescription"
                  rows={3}
                  defaultValue={text(payload, "shortDescription")}
                  className={inputClassName}
                />
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-ink/10 dark:border-white/10 bg-paper dark:bg-white/5 px-3 py-2 text-sm font-semibold text-ink dark:text-paper">
                <input
                  className={checkboxClassName}
                  defaultChecked={payload.beginnerFriendly === true}
                  name="beginnerFriendly"
                  type="checkbox"
                />
                Beginner friendly
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-ink/10 dark:border-white/10 bg-paper dark:bg-white/5 px-3 py-2 text-sm font-semibold text-ink dark:text-paper">
                <input
                  className={checkboxClassName}
                  defaultChecked={payload.travelReimbursement === true}
                  name="travelReimbursement"
                  type="checkbox"
                />
                Travel support
              </label>
              <label className="flex items-center gap-2 rounded-xl border border-ink/10 dark:border-white/10 bg-paper dark:bg-white/5 px-3 py-2 text-sm font-semibold text-ink dark:text-paper">
                <input
                  className={checkboxClassName}
                  defaultChecked={payload.highSchoolersOnly === true}
                  name="highSchoolersOnly"
                  type="checkbox"
                />
                High school only
              </label>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-pine px-5 text-sm font-semibold text-paper hover:bg-pine/90 dark:bg-paper dark:text-[#141414] dark:hover:bg-white"
                type="submit"
              >
                Apply to card
              </button>
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink/15 dark:border-white/15 px-4 text-sm font-semibold text-ink dark:text-paper"
                onClick={onClose}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
