"use client";

import { useState } from "react";
import type { DragEvent } from "react";
import { useRouter } from "next/navigation";

import { HackathonCard } from "@/components/hackathon-card";
import type { HackathonCardData, HackathonCardReminder } from "@/components/hackathon-card";
import { RemoveHackathonControl } from "@/components/remove-hackathon-control";

const trashButtonClassName =
  "relative z-20 grid size-8 place-items-center rounded-full text-navy/45 dark:text-wheat/45 transition-colors hover:bg-cabernet/10 hover:text-cabernet dark:hover:bg-white/10 dark:hover:text-[#e4a3ab] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cabernet/35 dark:focus-visible:outline-wheat/40 disabled:cursor-wait disabled:opacity-60";

function redirectToSignIn() {
  window.location.href = "/sign-in";
}

export type PipelineStage = "interested" | "applied" | "accepted";

type PipelineCard = {
  /* The userHackathons row id — stable React key across stage moves. */
  userHackathonId: string;
  hackathonId: string;
  card: HackathonCardData;
  reminder: HackathonCardReminder;
};

export type PipelineColumn = {
  stage: PipelineStage;
  title: string;
  cards: PipelineCard[];
};

type DragState = { hackathonId: string; from: PipelineStage } | null;

/* Notion-style pipeline board where each card can be dragged between the
   interested / applied / accepted columns. Drops optimistically re-slot the
   card, PATCH the tracking status, then refresh so the server recomputes the
   reminders offered for the new stage. */
export function MyPipelineBoard({ columns: initialColumns }: { columns: PipelineColumn[] }) {
  const router = useRouter();
  const [columns, setColumns] = useState(initialColumns);
  const [syncedColumns, setSyncedColumns] = useState(initialColumns);
  const [dragging, setDragging] = useState<DragState>(null);
  const [overStage, setOverStage] = useState<PipelineStage | null>(null);

  // Resync when the server re-renders the board (e.g. after router.refresh)
  // by adjusting state during render rather than in an effect.
  if (syncedColumns !== initialColumns) {
    setSyncedColumns(initialColumns);
    setColumns(initialColumns);
  }

  async function moveCard(hackathonId: string, from: PipelineStage, to: PipelineStage) {
    if (from === to) {
      return;
    }

    const previous = columns;
    const moved = previous.find((column) => column.stage === from)?.cards.find((card) => card.hackathonId === hackathonId);

    if (!moved) {
      return;
    }

    setColumns((current) =>
      current.map((column) => {
        if (column.stage === from) {
          return { ...column, cards: column.cards.filter((card) => card.hackathonId !== hackathonId) };
        }

        if (column.stage === to) {
          return { ...column, cards: [...column.cards, { ...moved, reminder: { ...moved.reminder, statusLabel: column.title } }] };
        }

        return column;
      })
    );

    try {
      const response = await fetch(`/api/hackathons/${encodeURIComponent(hackathonId)}/track`, {
        body: JSON.stringify({ applicationStatus: to }),
        headers: { "Content-Type": "application/json" },
        method: "PATCH",
      });

      if (response.status === 401) {
        redirectToSignIn();
        return;
      }

      if (!response.ok) {
        throw new Error("Could not update pipeline status.");
      }

      // Pull fresh reminder options for the new stage.
      router.refresh();
    } catch {
      setColumns(previous);
    }
  }

  // The trash control itself deletes the tracking row; on success we just drop
  // the card from the board and refresh so the server-side counts resync.
  function removeCard(hackathonId: string) {
    setColumns((current) =>
      current.map((column) => ({
        ...column,
        cards: column.cards.filter((card) => card.hackathonId !== hackathonId),
      }))
    );
    router.refresh();
  }

  function handleDrop(event: DragEvent<HTMLElement>, to: PipelineStage) {
    event.preventDefault();
    setOverStage(null);

    if (dragging) {
      void moveCard(dragging.hackathonId, dragging.from, to);
    }

    setDragging(null);
  }

  return (
    <div className="mt-10 flex items-start gap-5 overflow-x-auto pb-4">
      {columns.map((column) => {
        const isDropTarget = Boolean(dragging) && dragging?.from !== column.stage && overStage === column.stage;

        return (
          <section
            className={`w-[320px] shrink-0 rounded-2xl border bg-ivory dark:bg-white/5 p-3 transition-colors ${
              isDropTarget
                ? "border-cabernet dark:border-[#e4a3ab]/60 bg-cabernet/5 dark:bg-[#e4a3ab]/10"
                : "border-navy/10 dark:border-white/10"
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
              <span className="inline-flex items-center gap-1.5 rounded-full bg-cabernet/10 dark:bg-[#e4a3ab]/15 px-2.5 py-1 font-mono text-[11px] font-medium uppercase tracking-[0.12em] text-cabernet dark:text-[#e4a3ab]">
                <span aria-hidden="true" className="size-1.5 rounded-full bg-current" />
                {column.title}
              </span>
              <span className="text-sm font-semibold text-navy/45 dark:text-wheat/45">{column.cards.length}</span>
            </div>

            <div className="mt-2 space-y-3">
              {column.cards.map((item) => (
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
                        onRemoved={() => removeCard(item.hackathonId)}
                      />
                    }
                    hackathon={item.card}
                    key={item.userHackathonId}
                    reminder={item.reminder}
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
