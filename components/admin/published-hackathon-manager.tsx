"use client";

import { FormEvent, useState } from "react";
import { Pencil, Trash2, X } from "lucide-react";

import { previewPayloadToCard } from "@/components/admin/hackathon-card-preview";
import { HackathonCard } from "@/components/hackathon-card";
import { dateToInputValue } from "@/lib/hackathons/utils";

export type AdminHackathonListItem = {
  id: string;
  name: string;
  shortDescription: string | null;
  websiteUrl: string | null;
  imageUrl: string | null;
  applicationUrl: string | null;
  venue: string | null;
  format: "online" | "in_person";
  status: string;
  beginnerFriendly: boolean;
  travelReimbursement: boolean;
  prizeAmountUsd: number | null;
  voteScore: number;
  city: string | null;
  region: string | null;
  country: string | null;
  startsAt: string | null;
  endsAt: string | null;
  applicationOpensAt: string | null;
  applicationClosesAt: string | null;
  acceptanceAt: string | null;
};

const inputClassName =
  "w-full rounded-lg border border-black/15 bg-white px-3 py-2 text-sm text-black outline-none focus:border-[#660000] focus:ring-2 focus:ring-[#660000]/15";
const checkboxClassName = "size-4 rounded border-black/20 text-[#660000] focus:ring-[#660000]/20";
const labelClassName = "mb-1 block text-xs font-semibold uppercase tracking-[0.14em] text-[#706F6B]";

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
    prizeAmountUsd: item.prizeAmountUsd ?? "",
  };
}

function AdminHackathonRow({
  item,
  onDeleted,
  onUpdated,
}: {
  item: AdminHackathonListItem;
  onDeleted: (hackathonId: string) => void;
  onUpdated: (item: AdminHackathonListItem) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [status, setStatus] = useState<"idle" | "saving" | "deleting" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [previewPayload, setPreviewPayload] = useState<Record<string, unknown>>(() => itemToPreviewPayload(item));
  const busy = status === "saving" || status === "deleting";

  function updatePreview(key: string, nextValue: unknown) {
    if (!key) {
      return;
    }

    setPreviewPayload((current) => ({ ...current, [key]: nextValue }));
  }

  function closeEditor() {
    setEditing(false);
    setPreviewPayload(itemToPreviewPayload(item));
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
      prizeAmountUsd: formData.get("prizeAmountUsd")?.toString() ?? "",
    };

    const response = await fetch(`/api/admin/hackathons/${item.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const result = (await response.json()) as { data?: AdminHackathonListItem; error?: unknown };

    if (!response.ok || !result.data) {
      setStatus("error");
      setMessage(typeof result.error === "string" ? result.error : "Could not save changes. Check the required fields.");
      return;
    }

    setStatus("idle");
    setMessage("Changes saved.");
    setEditing(false);
    setPreviewPayload(itemToPreviewPayload(result.data));
    onUpdated(result.data);
  }

  async function deleteHackathon() {
    setStatus("deleting");
    setMessage(null);

    const response = await fetch(`/api/admin/hackathons/${item.id}`, { method: "DELETE" });

    if (!response.ok) {
      const result = (await response.json()) as { error?: unknown };

      setStatus("error");
      setMessage(typeof result.error === "string" ? result.error : "Could not delete hackathon.");
      return;
    }

    onDeleted(item.id);
  }

  return (
    <article className="rounded-lg border border-black/10 bg-white p-5">
      <div className="grid gap-5 xl:grid-cols-[minmax(18rem,0.9fr)_minmax(0,1.1fr)]">
        <div className="xl:sticky xl:top-6 xl:self-start">
          <HackathonCard
            hackathon={{ ...previewPayloadToCard(previewPayload, item.id), isSaved: false, voteScore: item.voteScore }}
            index={0}
            preview
          />
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-black px-4 text-sm font-semibold text-white disabled:opacity-50"
              disabled={busy}
              onClick={() => (editing ? closeEditor() : setEditing(true))}
              type="button"
            >
              {editing ? <X aria-hidden="true" className="size-4" /> : <Pencil aria-hidden="true" className="size-4" />}
              {editing ? "Cancel" : "Edit"}
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-[#B42318] px-4 text-sm font-semibold text-[#B42318] disabled:opacity-50"
              disabled={busy}
              onClick={deleteHackathon}
              type="button"
            >
              <Trash2 aria-hidden="true" className="size-4" />
              {status === "deleting" ? "Deleting..." : "Delete"}
            </button>
            {message ? (
              <p className={`text-sm font-semibold ${status === "error" ? "text-[#B42318]" : "text-[#027A48]"}`}>{message}</p>
            ) : null}
          </div>
        </div>

        {editing ? (
          <form onSubmit={saveChanges}>
            <div
              className="grid gap-4 md:grid-cols-3"
              onChange={(event) => {
                const target = event.target as HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
                updatePreview(target.name, target instanceof HTMLInputElement && target.type === "checkbox" ? target.checked : target.value);
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
                <input id={`${item.id}-websiteUrl`} name="websiteUrl" type="url" required defaultValue={item.websiteUrl ?? ""} className={inputClassName} />
              </div>
              <div>
                <label className={labelClassName} htmlFor={`${item.id}-imageUrl`}>
                  Image URL
                </label>
                <input id={`${item.id}-imageUrl`} name="imageUrl" type="url" defaultValue={item.imageUrl ?? ""} className={inputClassName} />
              </div>
              <div>
                <label className={labelClassName} htmlFor={`${item.id}-applicationUrl`}>
                  Application
                </label>
                <input id={`${item.id}-applicationUrl`} name="applicationUrl" type="url" defaultValue={item.applicationUrl ?? ""} className={inputClassName} />
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
                <input id={`${item.id}-country`} name="country" required defaultValue={item.country ?? ""} className={inputClassName} />
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
                <input id={`${item.id}-startDate`} name="startDate" type="date" required defaultValue={dateToInputValue(item.startsAt)} className={inputClassName} />
              </div>
              <div>
                <label className={labelClassName} htmlFor={`${item.id}-endDate`}>
                  End
                </label>
                <input id={`${item.id}-endDate`} name="endDate" type="date" required defaultValue={dateToInputValue(item.endsAt)} className={inputClassName} />
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
              <label className="flex items-center gap-2 rounded-lg border border-black/10 bg-[#F7F7F4] px-3 py-2 text-sm font-semibold text-black">
                <input className={checkboxClassName} defaultChecked={item.beginnerFriendly} name="beginnerFriendly" type="checkbox" />
                Beginner friendly
              </label>
              <label className="flex items-center gap-2 rounded-lg border border-black/10 bg-[#F7F7F4] px-3 py-2 text-sm font-semibold text-black">
                <input className={checkboxClassName} defaultChecked={item.travelReimbursement} name="travelReimbursement" type="checkbox" />
                Travel support
              </label>
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-3">
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-[#027A48] px-4 text-sm font-semibold text-white disabled:opacity-50"
                disabled={busy}
                type="submit"
              >
                {status === "saving" ? "Saving..." : "Save changes"}
              </button>
              <button
                className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-black/15 px-4 text-sm font-semibold text-black disabled:opacity-50"
                disabled={busy}
                onClick={closeEditor}
                type="button"
              >
                Cancel
              </button>
            </div>
          </form>
        ) : (
          <div className="rounded-lg border border-black/10 bg-[#F7F7F4] p-4 text-sm leading-6 text-[#3F3E3B]">
            <p>
              <span className="font-semibold text-black">Status:</span> <span className="capitalize">{item.status}</span>
            </p>
            <p className="mt-1">
              <span className="font-semibold text-black">Website:</span> {item.websiteUrl ?? "None"}
            </p>
            <p className="mt-1">
              <span className="font-semibold text-black">Venue:</span> {item.venue ?? "None"}
            </p>
            <p className="mt-1">
              <span className="font-semibold text-black">Prize pool:</span>{" "}
              {item.prizeAmountUsd ? `$${item.prizeAmountUsd.toLocaleString()}` : "None"}
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

export function PublishedHackathonManager({ hackathons }: { hackathons: AdminHackathonListItem[] }) {
  const [items, setItems] = useState(hackathons);

  if (!items.length) {
    return (
      <p className="rounded-lg border border-black/10 bg-white p-6 text-sm text-[#706F6B]">
        No hackathons are currently displayed on the hackathons page.
      </p>
    );
  }

  return (
    <div className="space-y-5">
      {items.map((item) => (
        <AdminHackathonRow
          item={item}
          key={item.id}
          onDeleted={(hackathonId) => setItems((current) => current.filter((entry) => entry.id !== hackathonId))}
          onUpdated={(updated) => setItems((current) => current.map((entry) => (entry.id === updated.id ? updated : entry)))}
        />
      ))}
    </div>
  );
}
