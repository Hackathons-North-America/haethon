"use client";

import { useRef, useState } from "react";
import { Check, Copy, Pencil, Pin, PinOff, Trash2, X } from "lucide-react";

import type {
  AdminDiscordChannel,
  AdminDiscordGuildChannel,
  AdminDiscordOverview,
} from "@/lib/discord/channel-admin";
import type { DiscordChannelDuplicate } from "@/lib/discord/duplicates";
import { reportBackgroundFailure, scheduleUndoableRequest } from "@/lib/client/background-actions";
import { sendRequest } from "@/lib/client/request";
import { useLatestSave } from "@/lib/client/use-latest-save";

function patchChannel(channelId: string, name: string | null) {
  return sendRequest<AdminDiscordChannel>(`/api/admin/discord/channels/${channelId}`, {
    method: "PATCH",
    json: { name },
  });
}

type ChannelNamePatch = { name?: string; nameOverride: string | null };

function DiscordChannelCard({
  entry,
  onDelete,
  onPatch,
  onUpdate,
}: {
  entry: AdminDiscordGuildChannel;
  onDelete: (entry: AdminDiscordGuildChannel) => void;
  onPatch: (channelSnowflake: string, patch: ChannelNamePatch) => void;
  onUpdate: (channel: AdminDiscordChannel) => void;
}) {
  const tracked = entry.tracked;
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(entry.name);
  /* What Discord last confirmed; a failed rename snaps back to it. */
  const confirmedRef = useRef<ChannelNamePatch>({ name: entry.name, nameOverride: tracked?.nameOverride ?? null });

  /* Renames apply instantly and save in the background (last one wins). */
  const { save } = useLatestSave<string | null, AdminDiscordChannel>(
    (name) => patchChannel(tracked?.id ?? "", name),
    {
      onSuccess: (updated, _value, { latest }) => {
        confirmedRef.current = { name: updated.name, nameOverride: updated.nameOverride };

        if (latest) {
          onUpdate(updated);
        }
      },
      onError: (error, value) => {
        onPatch(entry.channelSnowflake, confirmedRef.current);

        if (value !== null) {
          // Reopen the rename field with what was typed.
          setDraft(value);
          setEditing(true);
        }

        reportBackgroundFailure(error, {
          message:
            value === null
              ? `Couldn't switch #${confirmedRef.current.name} back to its automatic name.`
              : `Couldn't rename #${confirmedRef.current.name}.`,
          retry: () => rename(value),
        });
      },
    }
  );

  function rename(name: string | null) {
    if (!tracked) {
      return;
    }

    setEditing(false);
    // The automatic name is only known once the sync answers, so that case
    // just drops the pinned badge until the response lands.
    onPatch(entry.channelSnowflake, name === null ? { nameOverride: null } : { name: name.trim(), nameOverride: name.trim() });
    save(name);
  }

  return (
    <li className="rounded-xl border border-ink/10 bg-surface p-5">
      <div className="flex flex-wrap items-center gap-3">
        {editing ? (
          <form
            className="flex flex-wrap items-center gap-2"
            onSubmit={(event) => {
              event.preventDefault();
              rename(draft);
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
              disabled={!draft.trim()}
              type="submit"
            >
              <Check aria-hidden="true" className="size-4" />
              Save
            </button>
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink/20 px-4 text-sm font-semibold text-ink/70 disabled:opacity-50"
              onClick={() => {
                setEditing(false);
                setDraft(entry.name);
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
            onClick={() => {
              setDraft(entry.name);
              setEditing(true);
            }}
            type="button"
          >
            <Pencil aria-hidden="true" className="size-4" />
            Rename
          </button>
          {tracked.nameOverride ? (
            <button
              className="inline-flex min-h-10 items-center gap-2 rounded-full border border-ink/20 px-4 text-sm font-semibold text-ink/70 hover:bg-paper hover:text-ink disabled:opacity-50"
              onClick={() => rename(null)}
              type="button"
            >
              <PinOff aria-hidden="true" className="size-4" />
              Use automatic name
            </button>
          ) : null}
          <button
            className="inline-flex min-h-10 items-center gap-2 rounded-full border border-danger px-4 text-sm font-semibold text-danger disabled:opacity-50"
            onClick={() => onDelete(entry)}
            title={
              tracked.hackathonId
                ? "This hackathon is still listed, so the next sync will create a fresh channel for it."
                : undefined
            }
            type="button"
          >
            <Trash2 aria-hidden="true" className="size-4" />
            Delete
          </button>
        </div>
      )}

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

/* Renames apply instantly and deletes hide the channel behind an undo toast;
   both save in the background and restore the channel if Discord refuses. */
export function DiscordChannelManager({ overview }: { overview: AdminDiscordOverview }) {
  const [groups, setGroups] = useState(overview.groups);
  /* Server ordering, so an undone delete lands back in its original slot. */
  const [order] = useState(() => overview.groups.flatMap((group) => group.channels.map((entry) => entry.channelSnowflake)));

  function mapEntries(fn: (entry: AdminDiscordGuildChannel) => AdminDiscordGuildChannel) {
    setGroups((current) => current.map((group) => ({ ...group, channels: group.channels.map(fn) })));
  }

  function handleUpdate(updated: AdminDiscordChannel) {
    mapEntries((entry) => (entry.tracked?.id === updated.id ? { ...entry, name: updated.name, tracked: updated } : entry));
  }

  function handlePatch(channelSnowflake: string, patch: ChannelNamePatch) {
    mapEntries((entry) =>
      entry.channelSnowflake === channelSnowflake && entry.tracked
        ? {
            ...entry,
            name: patch.name ?? entry.name,
            tracked: { ...entry.tracked, name: patch.name ?? entry.tracked.name, nameOverride: patch.nameOverride },
          }
        : entry
    );
  }

  function handleDelete(target: AdminDiscordGuildChannel) {
    const tracked = target.tracked;
    const groupKey = groups.find((group) => group.channels.includes(target))?.categorySnowflake ?? null;
    const groupName = groups.find((group) => group.channels.includes(target))?.name;

    if (!tracked) {
      return;
    }

    setGroups((current) =>
      current.map((group) => ({
        ...group,
        channels: group.channels.filter((entry) => entry.channelSnowflake !== target.channelSnowflake),
      }))
    );

    scheduleUndoableRequest({
      message: `Deleted #${target.name}.`,
      failureMessage: `Couldn't delete #${target.name}.`,
      url: `/api/admin/discord/channels/${tracked.id}`,
      init: { method: "DELETE" },
      onUndo: () =>
        setGroups((current) =>
          current.map((group) => {
            if (group.categorySnowflake !== groupKey || group.name !== groupName) {
              return group;
            }

            if (group.channels.some((entry) => entry.channelSnowflake === target.channelSnowflake)) {
              return group;
            }

            const rank = (snowflake: string) => order.indexOf(snowflake);
            const index = group.channels.findIndex((entry) => rank(entry.channelSnowflake) > rank(target.channelSnowflake));
            const channels = [...group.channels];
            channels.splice(index === -1 ? channels.length : index, 0, target);
            return { ...group, channels };
          })
        ),
      retry: () => handleDelete(target),
    });
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
                  onPatch={handlePatch}
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
