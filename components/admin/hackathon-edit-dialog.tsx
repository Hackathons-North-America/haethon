"use client";

import { FormEvent, useEffect, useState } from "react";
import { X } from "lucide-react";

import type { AdminHackathonListItem } from "@/components/admin/hackathon-admin-item";
import { previewPayloadToCard } from "@/components/admin/hackathon-card-preview";
import { HackathonCard } from "@/components/hackathon-card";
import { dateToInputValue } from "@/lib/hackathons/utils";

const inputClassName =
  "w-full rounded-xl border border-navy/15 dark:border-white/15 bg-white dark:bg-white/[0.06] px-3 py-2 text-sm text-navy dark:text-wheat outline-none focus:border-cabernet focus:ring-2 focus:ring-cabernet/15";
const checkboxClassName =
  "size-4 rounded border-navy/20 dark:border-white/20 text-cabernet dark:text-[#e4a3ab] focus:ring-cabernet/20";
const labelClassName = "mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-navy/55 dark:text-wheat/55";

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
  };
}

/* Modal editor for a single published hackathon. Opens with every known field
   pre-populated; a live preview card at the top mirrors edits as they are typed.
   Saving PATCHes the admin endpoint and hands the fresh record back to the
   caller so the grid card can update in place. */
export function HackathonEditDialog({
  item,
  onClose,
  onSaved,
}: {
  item: AdminHackathonListItem;
  onClose: () => void;
  onSaved: (updated: AdminHackathonListItem) => void;
}) {
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [previewPayload, setPreviewPayload] = useState<Record<string, unknown>>(() => itemToPreviewPayload(item));
  const saving = status === "saving";

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
      voteDisplayOffset: formData.get("voteDisplayOffset")?.toString() ?? "0",
      discordChannelId: formData.get("discordChannelId")?.toString() ?? "",
    };

    const response = await fetch(`/api/admin/hackathons/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => ({}))) as { data?: AdminHackathonListItem; error?: unknown };

    if (!response.ok || !result.data) {
      setStatus("error");
      setMessage(typeof result.error === "string" ? result.error : "Could not save changes. Check the required fields.");
      return;
    }

    onSaved(result.data);
  }

  return (
    <div
      aria-modal="true"
      className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-navy/50 p-4 backdrop-blur-sm dark:bg-black/60 sm:p-6"
      onMouseDown={(event) => {
        // Only dismiss when the backdrop itself is pressed, not on a drag that
        // started inside the panel and released on the overlay.
        if (event.target === event.currentTarget) {
          onClose();
        }
      }}
      role="dialog"
    >
      <div className="my-8 w-full max-w-3xl rounded-2xl border border-navy/10 dark:border-white/10 bg-white dark:bg-[#1b1b1b] p-6 shadow-[0_30px_80px_rgba(0,0,0,0.35)]">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rust">Edit listing</p>
            <h2 className="mt-1 font-serif text-2xl font-semibold tracking-[-0.02em] text-navy dark:text-wheat">{item.name}</h2>
          </div>
          <button
            aria-label="Close editor"
            className="grid size-9 shrink-0 place-items-center rounded-full border border-navy/15 dark:border-white/15 text-navy dark:text-wheat hover:border-navy dark:hover:border-white/60"
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
                isSaved: false,
                voteDisplayOffset: Number(previewPayload.voteDisplayOffset ?? item.voteDisplayOffset),
                voteScore: item.voteScore,
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
              <div>
                <label className={labelClassName} htmlFor={`${item.id}-voteDisplayOffset`}>
                  Vote display offset (beta)
                </label>
                <input
                  aria-describedby={`${item.id}-voteDisplayOffset-note`}
                  id={`${item.id}-voteDisplayOffset`}
                  name="voteDisplayOffset"
                  type="number"
                  step="1"
                  defaultValue={item.voteDisplayOffset}
                  className={inputClassName}
                />
                <p id={`${item.id}-voteDisplayOffset-note`} className="mt-1 text-xs leading-5 text-rust dark:text-[#e4a3ab]">
                  Beta testing only: this changes the displayed upvote/downvote total, not real votes. Remove this before production.
                </p>
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
                  className="mt-1 text-xs leading-5 text-navy/55 dark:text-wheat/55"
                >
                  {item.discordChannelId
                    ? "Paste a different channel ID to reassign this hackathon. The old Discord channel is left untouched."
                    : "Paste the ID of an existing text channel in the configured Discord server."}
                </p>
              </div>
              <label className="flex items-center gap-2 rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-3 py-2 text-sm font-semibold text-navy dark:text-wheat">
                <input className={checkboxClassName} defaultChecked={item.beginnerFriendly} name="beginnerFriendly" type="checkbox" />
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

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-full bg-cabernet px-5 text-sm font-semibold text-wheat hover:bg-[#5c151c] dark:bg-wheat dark:text-[#141414] dark:hover:bg-white disabled:opacity-50"
                disabled={saving}
                type="submit"
              >
                {saving ? "Saving..." : "Save changes"}
              </button>
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-full border border-navy/15 dark:border-white/15 px-4 text-sm font-semibold text-navy dark:text-wheat disabled:opacity-50"
                disabled={saving}
                onClick={onClose}
                type="button"
              >
                Cancel
              </button>
              {message ? <p className="text-sm font-semibold text-[#B42318]">{message}</p> : null}
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
