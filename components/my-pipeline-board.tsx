"use client";

import { useRef, useState } from "react";
import type { DragEvent } from "react";
import { useRouter } from "next/navigation";

import { HackathonCard } from "@/components/hackathon-card";
import type { HackathonCardData } from "@/components/hackathon-card";
import { RemoveHackathonControl } from "@/components/remove-hackathon-control";
import { reportBackgroundFailure } from "@/lib/client/background-actions";
import { sendRequest } from "@/lib/client/request";
import { useKeyedLatestSave } from "@/lib/client/use-latest-save";

const trashButtonClassName =
  "relative z-20 grid size-8 place-items-center rounded-full text-ink/45 transition-colors hover:bg-pine/10 hover:text-pine focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35";

export type PipelineStage = "interested" | "applied" | "attending";

type PipelineCard = {
  /* The userHackathons row id — stable React key across stage moves. */
  userHackathonId: string;
  hackathonId: string;
  card: HackathonCardData;
};

export type PipelineColumn = {
  stage: PipelineStage;
  title: string;
  cards: PipelineCard[];
};

type DragState = { hackathonId: string; from: PipelineStage } | null;

/* Moves a card (wherever it currently is) to the end of the `to` column. */
function relocate(columns: PipelineColumn[], hackathonId: string, to: PipelineStage) {
  const card = columns.flatMap((column) => column.cards).find((entry) => entry.hackathonId === hackathonId);

  if (!card) {
    return columns;
  }

  return columns.map((column) => {
    const cards = column.cards.filter((entry) => entry.hackathonId !== hackathonId);
    return { ...column, cards: column.stage === to ? [...cards, card] : cards };
  });
}

/* Notion-style pipeline board where each card can be dragged between the
   interested / applied / attending columns. Drops re-slot the card instantly
   and save in the background (last drop wins per card). A failed save moves
   the card back to its last confirmed column with a retry toast. Once every
   save has landed, the page refreshes so the board resyncs with the server. */
export function MyPipelineBoard({ columns: initialColumns }: { columns: PipelineColumn[] }) {
  const router = useRouter();
  const [columns, setColumns] = useState(initialColumns);
  const [syncedColumns, setSyncedColumns] = useState(initialColumns);
  const [dragging, setDragging] = useState<DragState>(null);
  const [overStage, setOverStage] = useState<PipelineStage | null>(null);
  /* Cards hidden by the trash button while their undo window runs. */
  const [removedIds, setRemovedIds] = useState<ReadonlySet<string>>(() => new Set());
  /* Last server-confirmed stage per card, for rolling back a failed move. */
  const confirmedStagesRef = useRef(new Map<string, PipelineStage>());

  // Resync when the server re-renders the board (e.g. after router.refresh)
  // by adjusting state during render rather than in an effect.
  if (syncedColumns !== initialColumns) {
    setSyncedColumns(initialColumns);
    setColumns(initialColumns);
  }

  const { save, isSaving } = useKeyedLatestSave<string, PipelineStage, unknown>(
    (hackathonId, to) =>
      sendRequest(`/api/hackathons/${encodeURIComponent(hackathonId)}/track`, {
        method: "PATCH",
        json: { applicationStatus: to },
      }),
    {
      onSuccess: (_result, to, { key }) => {
        confirmedStagesRef.current.set(key, to);
        refreshWhenIdle();
      },
      onError: (error, to, { key }) => {
        const confirmed = confirmedStagesRef.current.get(key);
        const name = columns.flatMap((column) => column.cards).find((card) => card.hackathonId === key)?.card.name;

        if (confirmed) {
          setColumns((current) => relocate(current, key, confirmed));
        }

        reportBackgroundFailure(error, {
          message: name ? `Couldn't move ${name}.` : "Couldn't move that hackathon.",
          retry: confirmed ? () => moveCard(key, confirmed, to) : undefined,
        });
      },
    }
  );

  // A refresh while another card is still saving would snap that card back
  // to the server's (older) column, so wait until every save has landed.
  function refreshWhenIdle() {
    if (!isSaving()) {
      router.refresh();
    }
  }

  function moveCard(hackathonId: string, from: PipelineStage, to: PipelineStage) {
    if (from === to) {
      return;
    }

    // The column a card sat in before its first unsaved move is what the
    // server has; later moves keep that until a save confirms a new one.
    if (!confirmedStagesRef.current.has(hackathonId)) {
      confirmedStagesRef.current.set(hackathonId, from);
    }

    setColumns((current) => relocate(current, hackathonId, to));
    save(hackathonId, to);
  }

  function handleDrop(event: DragEvent<HTMLElement>, to: PipelineStage) {
    event.preventDefault();
    setOverStage(null);

    if (dragging) {
      moveCard(dragging.hackathonId, dragging.from, to);
    }

    setDragging(null);
  }

  return (
    <div className="mt-10 flex items-stretch gap-5 overflow-x-auto pb-4">
      {columns.map((column) => {
        const cards = column.cards.filter((card) => !removedIds.has(card.hackathonId));
        const isDropTarget = Boolean(dragging) && dragging?.from !== column.stage && overStage === column.stage;

        return (
          <section
            className={`flex min-w-[320px] flex-1 shrink-0 flex-col rounded-2xl border bg-paper p-3 transition-colors ${
              isDropTarget
                ? "border-pine bg-pine/5"
                : "border-ink/10"
            }`}
            key={column.stage}
            onDragLeave={(event) => {
              // Ignore drags moving between children of this column.
              if (!event.currentTarget.contains(event.relatedTarget as Node | null)) {
                setOverStage((current) => (current === column.stage ? null : current));
              }
            }}
            onDragOver={(event) => {
              if (dragging && dragging.from !== column.stage) {
                event.preventDefault();
                event.dataTransfer.dropEffect = "move";
                setOverStage(column.stage);
              }
            }}
            onDrop={(event) => handleDrop(event, column.stage)}
          >
            <div className="flex items-center gap-2 px-1 py-1">
              <span className="inline-flex items-center gap-1.5 rounded-full bg-pine/10 px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-pine">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                {column.title}
              </span>
              <span className="text-sm font-semibold text-ink/45">{cards.length}</span>
            </div>

            <div className="mt-2 flex-1 space-y-3">
              {cards.map((item) => (
                <div
                  className={`cursor-grab active:cursor-grabbing ${
                    dragging?.hackathonId === item.hackathonId ? "opacity-40" : ""
                  }`}
                  draggable
                  key={item.userHackathonId}
                  onDragEnd={() => {
                    setDragging(null);
                    setOverStage(null);
                  }}
                  onDragStart={(event) => {
                    event.dataTransfer.effectAllowed = "move";
                    event.dataTransfer.setData("text/plain", item.hackathonId);
                    setDragging({ hackathonId: item.hackathonId, from: column.stage });
                  }}
                >
                  <HackathonCard
                    compact
                    cornerAction={
                      <RemoveHackathonControl
                        className={trashButtonClassName}
                        hackathonId={item.hackathonId}
                        hackathonName={item.card.name}
                        listLabel={column.title}
                        onRemove={() => setRemovedIds((current) => new Set(current).add(item.hackathonId))}
                        onRemoved={refreshWhenIdle}
                        onRestore={() =>
                          setRemovedIds((current) => {
                            const next = new Set(current);
                            next.delete(item.hackathonId);
                            return next;
                          })
                        }
                      />
                    }
                    hackathon={item.card}
                    key={item.userHackathonId}
                    layout="bookmark"
                  />
                </div>
              ))}
            </div>
          </section>
        );
      })}
    </div>
  );
}
