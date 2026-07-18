"use client";

import { useState } from "react";
import { Pencil, Repeat, Trash2 } from "lucide-react";

import type { AdminHackathonListItem } from "@/components/admin/hackathon-admin-item";
import { HackathonEditDialog } from "@/components/admin/hackathon-edit-dialog";
import { previewPayloadToCard } from "@/components/admin/hackathon-card-preview";
import { HackathonCard } from "@/components/hackathon-card";

// Kept as a re-export for the organizer manager, which shares this serialized
// server-to-client shape with the admin view.
export type { AdminHackathonListItem } from "@/components/admin/hackathon-admin-item";

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

function AdminHackathonCard({
  item,
  onDelete,
  onEdit,
  onUpdate,
}: {
  item: AdminHackathonListItem;
  onDelete: (hackathonId: string) => void;
  onEdit: (item: AdminHackathonListItem) => void;
  onUpdate: (item: AdminHackathonListItem) => void;
}) {
  const [status, setStatus] = useState<"idle" | "deleting" | "toggling" | "error">("idle");
  const [message, setMessage] = useState<string | null>(null);
  const deleting = status === "deleting";
  const busy = deleting || status === "toggling";

  async function deleteHackathon() {
    setStatus("deleting");
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/hackathons/${item.id}`, { method: "DELETE" });

      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof result.error === "string" ? result.error : "Could not delete hackathon.");
      }

      onDelete(item.id);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not delete hackathon.");
    }
  }

  async function toggleRecurring() {
    setStatus("toggling");
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/hackathons/${item.id}/recurring`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isRecurring: !item.isRecurring }),
      });
      const result = (await response.json().catch(() => ({}))) as { data?: AdminHackathonListItem; error?: unknown };

      if (!response.ok || !result.data) {
        throw new Error(typeof result.error === "string" ? result.error : "Could not update the recurring flag.");
      }

      setStatus("idle");
      onUpdate(result.data);
    } catch (error) {
      setStatus("error");
      setMessage(error instanceof Error ? error.message : "Could not update the recurring flag.");
    }
  }

  return (
    <div className="min-w-0">
      <HackathonCard
        hackathon={{
          ...previewPayloadToCard(itemToPreviewPayload(item), item.id),
          isSaved: false,
          voteDisplayOffset: item.voteDisplayOffset,
          voteScore: item.voteScore,
        }}
        preview
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-cabernet px-4 text-sm font-semibold text-wheat hover:bg-[#5c151c] dark:bg-wheat dark:text-[#141414] dark:hover:bg-white disabled:opacity-50"
          disabled={deleting}
          onClick={() => onEdit(item)}
          type="button"
        >
          <Pencil aria-hidden="true" className="size-4" />
          Edit
        </button>
        <button
          aria-pressed={item.isRecurring}
          className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold disabled:opacity-50 ${
            item.isRecurring
              ? "border-cabernet bg-cabernet text-wheat dark:border-wheat dark:bg-wheat dark:text-[#141414]"
              : "border-navy/20 text-navy/70 dark:border-white/20 dark:text-wheat/70"
          }`}
          disabled={busy}
          onClick={() => void toggleRecurring()}
          type="button"
        >
          <Repeat aria-hidden="true" className="size-4" />
          {status === "toggling" ? "Saving..." : item.isRecurring ? "Repeats yearly" : "Not repeating"}
        </button>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#B42318] px-4 text-sm font-semibold text-[#B42318] disabled:opacity-50"
          disabled={busy}
          onClick={() => void deleteHackathon()}
          type="button"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          {deleting ? "Deleting..." : "Delete"}
        </button>
        {message ? <p className="w-full text-sm font-semibold text-[#B42318]">{message}</p> : null}
      </div>
    </div>
  );
}

export function PublishedHackathonManager({ hackathons }: { hackathons: AdminHackathonListItem[] }) {
  const [items, setItems] = useState(hackathons);
  const [editingItem, setEditingItem] = useState<AdminHackathonListItem | null>(null);

  function updateItem(updated: AdminHackathonListItem) {
    setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)));
    setEditingItem(null);
  }

  if (!items.length) {
    return (
      <p className="rounded-xl border border-navy/10 bg-white p-6 text-sm text-navy/55 dark:border-white/10 dark:bg-white/[0.06] dark:text-wheat/55">
        No hackathons are currently displayed on the hackathons page.
      </p>
    );
  }

  return (
    <>
      <div className="grid grid-cols-1 gap-x-6 gap-y-10 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => (
          <AdminHackathonCard
            item={item}
            key={item.id}
            onDelete={(hackathonId) => setItems((current) => current.filter((entry) => entry.id !== hackathonId))}
            onEdit={setEditingItem}
            onUpdate={updateItem}
          />
        ))}
      </div>
      {editingItem ? <HackathonEditDialog item={editingItem} onClose={() => setEditingItem(null)} onSaved={updateItem} /> : null}
    </>
  );
}
