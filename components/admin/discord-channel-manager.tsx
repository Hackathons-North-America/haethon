"use client";

import { useState } from "react";
import { Check, Copy, Pencil, Pin, PinOff, Trash2, X } from "lucide-react";

import type {
  AdminDiscordChannel,
  AdminDiscordGuildChannel,
  AdminDiscordOverview,
} from "@/lib/discord/channel-admin";
import type { DiscordChannelDuplicate } from "@/lib/discord/duplicates";

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

function DiscordChannelCard({
  entry,
  onDelete,
  onUpdate,
}: {
  entry: AdminDiscordGuildChannel;
  onDelete: (channelId: string) => void;
  onUpdate: (channel: AdminDiscordChannel) => void;
}) {
  const tracked = entry.tracked;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.name);
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const busy = saving || deleting;

  async function submit(name: string | null) {
    if (!tracked) {
      return;
    }

    setSaving(true);
    setMessage(null);

    try {
      const updated = await patchChannel(tracked.id, name);
      setEditing(false);
      onUpdate(updated);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not update the Discord channel.");
    } finally {
      setSaving(false);
    }
  }

  async function deleteChannel() {
    if (!tracked) {
      return;
    }

    setDeleting(true);
    setMessage(null);

    try {
      const response = await fetch(`/api/admin/discord/channels/${tracked.id}`, { method: "DELETE" });

      if (!response.ok) {
        const result = (await response.json().catch(() => ({}))) as { error?: unknown };
        throw new Error(typeof result.error === "string" ? result.error : "Could not delete the Discord channel.");
      }

      onDelete(tracked.id);
    } catch (error) {
      setDeleting(false);
      setMessage(error instanceof Error ? error.message : "Could not delete the Discord channel.");
    }
  }

  return (
    <li className="rounded-xl border border-ink/10 bg-surface p-5">
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
              className="min-h-10 rounded-full border border-ink/20 bg-surface px-4 font-mono text-sm text-ink focus:outline-none focus:ring-2 focus:ring-pine"
              maxLength={100}
              onChange={(event) => setDraft(event.target.value)}
              value={draft}
            />
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full bg-pine px-4 text-sm font-semibold text-paper hover:bg-pine/90 disabled:opacity-50"
              disabled={saving || !draft.trim()}
              type="submit"
            >
              <Check aria-hidden="true" className="size-4" />
              {saving ? "Saving..." : "Save"}
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink/20 px-4 text-sm font-semibold text-ink/70 disabled:opacity-50"
              disabled={saving}
              onClick={() => {
                setEditing(false);
                setDraft(entry.name);
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
            <span className="font-mono text-sm font-semibold text-ink">#{entry.name}</span>
            {tracked?.nameOverride ? (
              <span className="inline-flex items-center gap-1 rounded-full border border-pine/30 bg-pine/10 px-3 py-1 text-xs font-semibold text-pine">
                <Pin aria-hidden="true" className="size-3" />
                Pinned name
              </span>
            ) : null}
            {tracked ? null : (
              <span className="inline-flex items-center rounded-full border border-ink/15 bg-paper px-3 py-1 text-xs font-semibold text-ink/60">
                Untracked
              </span>
            )}
          </>
        )}
      </div>

      {tracked ? (
        <p className="mt-2 text-sm text-ink/55">
          {tracked.seriesName ? <>Series: {tracked.seriesName}</> : <>Not linked to a series</>}
          {" · "}
          {tracked.hackathonName ? <>Hackathon: {tracked.hackathonName}</> : <>No hackathon attached</>}
          {" · "}
          {tracked.guildName}
        </p>
      ) : (
        <p className="mt-2 text-sm text-ink/55">
          {entry.topic ? entry.topic : "Not managed by the sync — created outside Haethon."}
        </p>
      )}

      {editing || !tracked ? null : (
        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink/20 px-4 text-sm font-semibold text-ink/70 hover:bg-paper hover:text-ink disabled:opacity-50"
            disabled={saving}
            onClick={() => {
              setDraft(entry.name);
              setEditing(true);
              setMessage(null);
            }}
            type="button"
          >
            <Pencil aria-hidden="true" className="size-4" />
            Rename
          </button>
          {tracked.nameOverride ? (
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink/20 px-4 text-sm font-semibold text-ink/70 hover:bg-paper hover:text-ink disabled:opacity-50"
              disabled={busy}
              onClick={() => void submit(null)}
              type="button"
            >
              <PinOff aria-hidden="true" className="size-4" />
              {saving ? "Saving..." : "Use automatic name"}
            </button>
          ) : null}
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-danger px-4 text-sm font-semibold text-danger disabled:opacity-50"
            disabled={busy}
            onClick={() => void deleteChannel()}
            title={
              tracked.hackathonId
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

      {message ? <p className="mt-3 text-sm font-semibold text-danger">{message}</p> : null}
    </li>
  );
}

/* Report-only: the sync never deletes either channel. The admin decides which to keep. */
function DuplicateChannelsNotice({ duplicates }: { duplicates: DiscordChannelDuplicate[] }) {
  return (
    <section className="rounded-xl border border-warning/30 bg-warning-soft p-5">
      <div className="flex items-center gap-2">
        <Copy aria-hidden="true" className="size-4 text-warning" />
        <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-warning">
          Possible duplicates · {duplicates.length}
        </h2>
      </div>
      <p className="mt-2 max-w-3xl text-sm leading-6 text-ink/65">
        These hackathons have a channel the sync manages and an untracked channel with a matching name, usually one
        made by hand. Nothing is deleted automatically. To keep the hand-made one, attach its channel ID in the
        hackathon&apos;s edit form, then delete the other on Discord. To keep the tracked one, delete the hand-made
        channel on Discord.
      </p>
      <ul className="mt-4 space-y-2">
        {duplicates.map((duplicate) => (
          <li
            className="rounded-lg border border-ink/10 bg-surface px-4 py-3 text-sm"
            key={duplicate.tracked.channelSnowflake}
          >
            <span className="font-semibold text-ink">{duplicate.hackathonName}</span>
            <span className="text-ink/55">
              {" · tracked "}
              <span className="font-mono">#{duplicate.tracked.name}</span>
              {" · also "}
              {duplicate.duplicates.map((channel, index) => (
                <span key={channel.channelSnowflake}>
                  {index > 0 ? ", " : null}
                  <span className="font-mono">#{channel.name}</span>
                  {channel.categoryName ? ` in ${channel.categoryName}` : null}
                </span>
              ))}
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}

export function DiscordChannelManager({ overview }: { overview: AdminDiscordOverview }) {
  const [groups, setGroups] = useState(overview.groups);

  function handleUpdate(updated: AdminDiscordChannel) {
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        channels: group.channels.map((entry) =>
          entry.tracked?.id === updated.id ? { ...entry, name: updated.name, tracked: updated } : entry
        ),
      }))
    );
  }

  function handleDelete(recordId: string) {
    setGroups((current) =>
      current.map((group) => ({
        ...group,
        channels: group.channels.filter((entry) => entry.tracked?.id !== recordId),
      }))
    );
  }

  if (!groups.length) {
    return (
      <p className="rounded-xl border border-ink/10 bg-surface p-6 text-sm text-ink/55">
        No Discord channels have been created yet. Channels appear here once a hackathon is approved for Discord.
      </p>
    );
  }

  return (
    <div className="space-y-6">
      {!overview.live ? (
        <p className="rounded-xl border border-ink/10 bg-surface p-4 text-sm text-ink/55">
          Discord could not be reached, so only tracked channels are shown, grouped by the category the sync last
          filed them into.
        </p>
      ) : null}

      {overview.duplicates.length ? <DuplicateChannelsNotice duplicates={overview.duplicates} /> : null}

      {groups.map((group) => (
        <section
          className="rounded-xl border border-ink/10 bg-paper/60 p-5"
          key={group.categorySnowflake ?? group.name}
        >
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-sm font-semibold uppercase tracking-[0.15em] text-ink/70">
              {group.name}
            </h2>
            <span className="text-xs font-semibold text-ink/45">
              {group.channels.length} {group.channels.length === 1 ? "channel" : "channels"}
            </span>
          </div>

          {group.channels.length ? (
            <ul className="mt-4 grid gap-4 lg:grid-cols-2">
              {group.channels.map((entry) => (
                <DiscordChannelCard
                  entry={entry}
                  key={entry.channelSnowflake}
                  onDelete={handleDelete}
                  onUpdate={handleUpdate}
                />
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-ink/45">No text channels in this category.</p>
          )}
        </section>
      ))}
    </div>
  );
}
