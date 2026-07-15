"use client";

import { FormEvent, useState } from "react";

import type { AdminHackathonListItem } from "@/components/admin/hackathon-admin-item";
import { previewPayloadToCard } from "@/components/admin/hackathon-card-preview";
import { HackathonCard } from "@/components/hackathon-card";

const inputClassName =
  "w-full rounded-xl border border-navy/15 dark:border-white/15 bg-white dark:bg-white/[0.06] px-3 py-2 text-sm text-navy dark:text-wheat outline-none focus:border-cabernet focus:ring-2 focus:ring-cabernet/15";
const checkboxClassName =
  "size-4 rounded border-navy/20 dark:border-white/20 text-cabernet dark:text-[#e4a3ab] focus:ring-cabernet/20";
const labelClassName = "mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-navy/55 dark:text-wheat/55";

function emptyPreviewPayload(): Record<string, unknown> {
  return {
    name: "",
    shortDescription: "",
    websiteUrl: "",
    imageUrl: "",
    city: "",
    region: "",
    country: "",
    startDate: "",
    endDate: "",
    format: "in_person",
    beginnerFriendly: false,
    travelReimbursement: false,
    highSchoolersOnly: false,
    prizeAmountUsd: "",
  };
}

type Published = Pick<AdminHackathonListItem, "id" | "name" | "status" | "isRecurring">;

function publishedNote(published: Published) {
  if (published.status !== "completed") {
    return `Published "${published.name}" — it is live on the public hackathons page.`;
  }

  if (published.isRecurring) {
    return `Published "${published.name}" as a past event. Its series repeats yearly, so it stays on the public page as the last edition until a newer one is published.`;
  }

  return `Published "${published.name}" as a past event. Heads up: it will NOT appear on the public page unless its series is marked as repeating yearly.`;
}

/* Instant-add form for admins: publishes straight to the public catalog with
   no review step. Mirrors the edit dialog's fields, with a live preview card,
   and clears itself after each publish so past events can be backfilled in
   quick succession. */
export function HackathonCreateForm() {
  const [status, setStatus] = useState<"idle" | "saving" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [published, setPublished] = useState<Published | null>(null);
  const [previewPayload, setPreviewPayload] = useState<Record<string, unknown>>(emptyPreviewPayload);
  const [discordChannelId, setDiscordChannelId] = useState("");
  const [createDiscordChannel, setCreateDiscordChannel] = useState(false);
  const saving = status === "saving";

  function updatePreview(key: string, nextValue: unknown) {
    if (!key) {
      return;
    }

    setPreviewPayload((current) => ({ ...current, [key]: nextValue }));
  }

  async function publish(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = event.currentTarget;
    const formData = new FormData(form);

    setStatus("saving");
    setMessage(null);
    setPublished(null);

    const body = {
      name: formData.get("name")?.toString() ?? "",
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
      format: formData.get("format")?.toString() ?? "in_person",
      beginnerFriendly: formData.get("beginnerFriendly") === "on",
      travelReimbursement: formData.get("travelReimbursement") === "on",
      highSchoolersOnly: formData.get("highSchoolersOnly") === "on",
      prizeAmountUsd: formData.get("prizeAmountUsd")?.toString() ?? "",
      recurring: formData.get("recurring") === "on",
      createDiscordChannel: formData.get("createDiscordChannel") === "on",
      discordChannelId: formData.get("discordChannelId")?.toString() ?? "",
    };

    const response = await fetch("/api/admin/hackathons", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json().catch(() => ({}))) as { data?: AdminHackathonListItem; error?: unknown };

    if (!response.ok || !result.data) {
      setStatus("error");
      setMessage(typeof result.error === "string" ? result.error : "Could not publish. Check the required fields.");
      return;
    }

    setStatus("idle");
    setPublished(result.data);
    form.reset();
    setPreviewPayload(emptyPreviewPayload());
    setDiscordChannelId("");
    setCreateDiscordChannel(false);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,18rem)_minmax(0,1fr)]">
      <div className="lg:sticky lg:top-6 lg:self-start">
        <HackathonCard
          hackathon={{
            ...previewPayloadToCard(previewPayload),
            isSaved: false,
            voteDisplayOffset: 0,
            voteScore: 0,
          }}
          preview
        />
      </div>

      <form
        className="rounded-xl border border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] p-6"
        onSubmit={publish}
      >
        {published ? (
          <p
            className={`mb-4 rounded-xl border px-4 py-3 text-sm font-semibold ${
              published.status === "completed" && !published.isRecurring
                ? "border-rust/30 bg-rust/10 text-rust"
                : "border-[#137a4c]/30 bg-[#137a4c]/10 text-[#137a4c]"
            }`}
          >
            {publishedNote(published)}
          </p>
        ) : null}

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
            <label className={labelClassName} htmlFor="new-name">
              Event name
            </label>
            <input id="new-name" name="name" required className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor="new-format">
              Format
            </label>
            <select id="new-format" name="format" defaultValue="in_person" className={inputClassName}>
              <option value="in_person">In person</option>
              <option value="online">Online</option>
            </select>
          </div>
          <div>
            <label className={labelClassName} htmlFor="new-websiteUrl">
              Website
            </label>
            <input id="new-websiteUrl" name="websiteUrl" type="url" required className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor="new-imageUrl">
              Image URL
            </label>
            <input id="new-imageUrl" name="imageUrl" type="url" className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor="new-applicationUrl">
              Application
            </label>
            <input id="new-applicationUrl" name="applicationUrl" type="url" className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor="new-city">
              City
            </label>
            <input id="new-city" name="city" className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor="new-region">
              Region
            </label>
            <input id="new-region" name="region" className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor="new-country">
              Country
            </label>
            <input id="new-country" name="country" required className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor="new-venue">
              Venue
            </label>
            <input id="new-venue" name="venue" className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor="new-startDate">
              Start
            </label>
            <input id="new-startDate" name="startDate" type="date" required className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor="new-endDate">
              End
            </label>
            <input id="new-endDate" name="endDate" type="date" required className={inputClassName} />
          </div>
          <div className="sm:col-span-2">
            <label className={labelClassName} htmlFor="new-shortDescription">
              Description
            </label>
            <textarea id="new-shortDescription" name="shortDescription" rows={3} className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor="new-applicationOpensAt">
              Applications open
            </label>
            <input id="new-applicationOpensAt" name="applicationOpensAt" type="date" className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor="new-applicationClosesAt">
              Applications close
            </label>
            <input id="new-applicationClosesAt" name="applicationClosesAt" type="date" className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor="new-acceptanceAt">
              Acceptance
            </label>
            <input id="new-acceptanceAt" name="acceptanceAt" type="date" className={inputClassName} />
          </div>
          <div>
            <label className={labelClassName} htmlFor="new-prizeAmountUsd">
              Prize USD
            </label>
            <input id="new-prizeAmountUsd" name="prizeAmountUsd" type="number" min="0" className={inputClassName} />
          </div>
          <label className="flex items-center gap-2 rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-3 py-2 text-sm font-semibold text-navy dark:text-wheat">
            <input className={checkboxClassName} name="beginnerFriendly" type="checkbox" />
            Beginner friendly
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-3 py-2 text-sm font-semibold text-navy dark:text-wheat">
            <input className={checkboxClassName} name="travelReimbursement" type="checkbox" />
            Travel support
          </label>
          <label className="flex items-center gap-2 rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-3 py-2 text-sm font-semibold text-navy dark:text-wheat">
            <input className={checkboxClassName} name="highSchoolersOnly" type="checkbox" />
            High school only
          </label>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-3 py-2 text-sm font-semibold text-navy dark:text-wheat">
              <input className={checkboxClassName} name="recurring" type="checkbox" />
              Repeats yearly (recurring series)
            </label>
            <p className="mt-1 text-xs leading-5 text-navy/55 dark:text-wheat/55">
              Required for backfilled past events to stay on the public page — a past edition of a repeating series is
              shown until the next edition is published. Turning this on marks the whole series; it cannot be undone from
              this form.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className={labelClassName} htmlFor="new-discordChannelId">
              Existing Discord channel ID
            </label>
            <input
              aria-describedby="new-discordChannelId-note"
              autoComplete="off"
              className={inputClassName}
              disabled={createDiscordChannel}
              id="new-discordChannelId"
              inputMode="numeric"
              maxLength={20}
              name="discordChannelId"
              onChange={(event) => setDiscordChannelId(event.target.value)}
              pattern="[0-9]{17,20}"
              placeholder="123456789012345678"
              value={discordChannelId}
            />
            <p id="new-discordChannelId-note" className="mt-1 text-xs leading-5 text-navy/55 dark:text-wheat/55">
              Paste a channel ID to adopt a text channel that already exists in the configured Discord server.
            </p>
          </div>
          <div className="sm:col-span-2">
            <label className="flex items-center gap-2 rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-3 py-2 text-sm font-semibold text-navy dark:text-wheat">
              <input
                checked={createDiscordChannel}
                className={checkboxClassName}
                disabled={discordChannelId.trim().length > 0}
                name="createDiscordChannel"
                onChange={(event) => setCreateDiscordChannel(event.target.checked)}
                type="checkbox"
              />
              Create Discord channel
            </label>
            <p className="mt-1 text-xs leading-5 text-navy/55 dark:text-wheat/55">
              Use this only when the server does not already have a channel for the hackathon. Existing channel IDs and
              new channel creation are mutually exclusive.
            </p>
          </div>
        </div>

        <div className="mt-6 flex flex-wrap items-center gap-3">
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full bg-cabernet px-5 text-sm font-semibold text-wheat hover:bg-[#5c151c] dark:bg-wheat dark:text-[#141414] dark:hover:bg-white disabled:opacity-50"
            disabled={saving}
            type="submit"
          >
            {saving ? "Publishing..." : "Publish now"}
          </button>
          {message ? <p className="text-sm font-semibold text-[#B42318]">{message}</p> : null}
        </div>
      </form>
    </div>
  );
}
