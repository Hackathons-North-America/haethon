"use client";

import { useState } from "react";
import { Check, Pencil, Pin, PinOff, Trash2, X } from "lucide-react";

import type { AdminDiscordChannel } from "@/lib/discord/channel-admin";

const categoryLabels: Record<string, string> = {
  canada: "Canadian Hackathons",
  us: "US Hackathons",
  past: "Past Hackathons",
  deleted: "Deleted (parked)",
};

function categoryBadgeClasses(category: string | null) {
  if (category === "deleted") {
    return "border-[#B42318]/30 bg-[#B42318]/10 text-[#B42318]";
  }

  if (category === "past") {
    return "border-navy/15 bg-ivory text-navy/60 dark:border-white/15 dark:bg-white/5 dark:text-wheat/60";
  }

  return "border-navy/15 bg-ivory text-navy dark:border-white/15 dark:bg-white/5 dark:text-wheat";
}

async function patchChannel(channelId: string, name: string | null) {
  const response = await fetch(`/api/admin/discord/channels/${channelId}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });
  const result = (await response.json().catch(() => ({}))) as { data?: AdminDiscordChannel; error?: unknown };

  if (!response.ok || !result.data) {
    throw new Error(typeof result.error === "string" ? result.error : "Could not update the Discord channel.");
  }

  return result.data;
}

function DiscordChannelRow({
  channel,
  onDelete,
  onUpdate,
}: {
  channel: AdminDiscordChannel;
  onDelete: (channelId: string) => void;
  onUpdate: (channel: AdminDiscordChannel) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(channel.name);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busy = saving || deleting;

  async function submit(name: string | null) {
    setSaving(true);
    setMessage(null);

    try {
      const updated = await patchChannel(channel.id, name);
      setEditing(false);
      onUpdate(updated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the Discord channel.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteChannel() {
    setDeleting(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/discord/channels/${channel.id}`, { method: "DELETE" });

      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof result.error === "string" ? result.error : "Could not delete the Discord channel.");
      }

      onDelete(channel.id);
    } catch (error) {
      setDeleting(false);
      setMessage(error instanceof Error ? error.message : "Could not delete the Discord channel.");
    }
  }

  return (
    <li className="rounded-xl border border-navy/10 bg-white p-5 dark:border-white/10 dark:bg-white/[0.06]">
      <div className="flex flex-wrap items-center gap-3">
        {editing ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              void submit(draft);
            }}
          >
            <input
              aria-label="Channel name"
              autoFocus
              className="min-h-10 rounded-full border border-navy/20 bg-white px-4 font-mono text-sm text-navy focus:outline-none focus:ring-2 focus:ring-cabernet dark:border-white/20 dark:bg-white/10 dark:text-wheat"
              maxLength={100}
              onChange={(event) => setDraft(event.target.value)}
              value={draft}
            />
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-cabernet px-4 text-sm font-semibold text-wheat hover:bg-[#5c151c] dark:bg-wheat dark:text-[#141414] dark:hover:bg-white disabled:opacity-50"
              disabled={saving || !draft.trim()}
              type="submit"
            >
              <Check aria-hidden="true" className="size-4" />
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-navy/20 px-4 text-sm font-semibold text-navy/70 dark:border-white/20 dark:text-wheat/70 disabled:opacity-50"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setDraft(channel.name);
                setMessage(null);
              }}
              type="button"
            >
              <X aria-hidden="true" className="size-4" />
              Cancel
            </button>
          </form>
        ) : (
          <>
            <span className="font-mono text-sm font-semibold text-navy dark:text-wheat">#{channel.name}</span>
            {channel.nameOverride ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-cabernet/30 bg-cabernet/10 px-3 py-1 text-xs font-semibold text-cabernet dark:border-wheat/30 dark:bg-wheat/10 dark:text-wheat">
                <Pin aria-hidden="true" className="size-3" />
                Pinned name
              </span>
            ) : null}
            <span
              className={`inline-flex items-center rounded-full border px-3 py-1 text-xs font-semibold ${categoryBadgeClasses(channel.category)}`}
            >
              {channel.category ? categoryLabels[channel.category] ?? channel.category : "No category"}
            </span>
          </>
        )}
      </div>

      <p className="mt-2 text-sm text-navy/55 dark:text-wheat/55">
        {channel.seriesName ? <>Series: {channel.seriesName}</> : <>Not linked to a series</>}
        {" · "}
        {channel.hackathonName ? <>Hackathon: {channel.hackathonName}</> : <>No hackathon attached</>}
        {" · "}
        {channel.guildName}
      </p>

      {editing ? null : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-navy/20 px-4 text-sm font-semibold text-navy/70 hover:bg-ivory hover:text-navy dark:border-white/20 dark:text-wheat/70 dark:hover:bg-white/10 dark:hover:text-wheat disabled:opacity-50"
            disabled={saving}
            onClick={() => {
              setDraft(channel.name);
              setEditing(true);
              setMessage(null);
            }}
            type="button"
          >
            <Pencil aria-hidden="true" className="size-4" />
            Rename
          </button>
          {channel.nameOverride ? (
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-navy/20 px-4 text-sm font-semibold text-navy/70 hover:bg-ivory hover:text-navy dark:border-white/20 dark:text-wheat/70 dark:hover:bg-white/10 dark:hover:text-wheat disabled:opacity-50"
              disabled={busy}
              onClick={() => void submit(null)}
              type="button"
            >
              <PinOff aria-hidden="true" className="size-4" />
              {saving ? "Saving..." : "Use automatic name"}
            </button>
          ) : null}
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-[#B42318] px-4 text-sm font-semibold text-[#B42318] disabled:opacity-50"
            disabled={busy}
            onClick={() => void deleteChannel()}
            title={
              channel.hackathonId
                ? "This hackathon is still listed, so the next sync will create a fresh channel for it."
                : undefined
            }
            type="button"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            {deleting ? "Deleting..." : "Delete"}
          </button>
        </div>
      )}

      {message ? <p className="mt-3 text-sm font-semibold text-[#B42318]">{message}</p> : null}
    </li>
  );
}

export function DiscordChannelManager({ channels }: { channels: AdminDiscordChannel[] }) {
  const [items, setItems] = useState(channels);

  if (!items.length) {
    return (
      <p className="rounded-xl border border-navy/10 bg-white p-6 text-sm text-navy/55 dark:border-white/10 dark:bg-white/[0.06] dark:text-wheat/55">
        No Discord channels have been created yet. Channels appear here once a hackathon is approved for Discord.
      </p>
    );
  }

  return (
    <ul className="space-y-4">
      {items.map((channel) => (
        <DiscordChannelRow
          channel={channel}
          key={channel.id}
          onDelete={(channelId) => setItems((current) => current.filter((item) => item.id !== channelId))}
          onUpdate={(updated) => setItems((current) => current.map((item) => (item.id === updated.id ? updated : item)))}
        />
      ))}
    </ul>
  );
}
