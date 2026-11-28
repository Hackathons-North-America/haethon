"use client";

import { useRef, useState, type ReactNode } from "react";
import { BadgeCheck, Pencil, Repeat, Trash2 } from "lucide-react";

import type { AdminHackathonListItem } from "@/components/admin/hackathon-admin-item";
import { HackathonEditDialog } from "@/components/admin/hackathon-edit-dialog";
import { previewPayloadToCard } from "@/components/admin/hackathon-card-preview";
import { HackathonCard } from "@/components/hackathon-card";
import { reportBackgroundFailure, scheduleUndoableRequest } from "@/lib/client/background-actions";
import { RequestError, sendRequest } from "@/lib/client/request";
import { showToast } from "@/lib/client/toast-store";
import { useLatestSave } from "@/lib/client/use-latest-save";

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
  onPatch,
}: {
  item: AdminHackathonListItem;
  onDelete: (item: AdminHackathonListItem) => void;
  onEdit: (item: AdminHackathonListItem) => void;
  onPatch: (hackathonId: string, patch: Partial<AdminHackathonListItem>) => void;
}) {
  /* The recurring flag the server last confirmed; a failed toggle snaps back to it. */
  const confirmedRecurringRef = useRef(item.isRecurring);

  /* Flips instantly; saves run one at a time with the last click winning. */
  const { save } = useLatestSave<boolean, AdminHackathonListItem>(
    (isRecurring) =>
      sendRequest<AdminHackathonListItem>(`/api/admin/hackathons/${item.id}/recurring`, {
        method: "PATCH",
        json: { isRecurring },
      }),
    {
      onSuccess: (saved, _value, { latest }) => {
        confirmedRecurringRef.current = saved.isRecurring;

        if (latest) {
          onPatch(item.id, { isRecurring: saved.isRecurring });
        }
      },
      onError: (error, value) => {
        onPatch(item.id, { isRecurring: confirmedRecurringRef.current });
        reportBackgroundFailure(error, {
          message: `Couldn't update the recurring flag for ${item.name}.`,
          retry: () => setRecurring(value),
        });
      },
    }
  );

  function setRecurring(isRecurring: boolean) {
    onPatch(item.id, { isRecurring });
    save(isRecurring);
  }

  const hnaApproved = item.hnaApproved === true;
  /* The approval the server last confirmed; a failed toggle snaps back to it. */
  const confirmedHnaApprovedRef = useRef(hnaApproved);

  /* Same one-click pattern as the recurring toggle. Approving a Canadian or US
     hackathon also gets its Discord channel (the route runs the sync). */
  const { save: saveHnaApproved } = useLatestSave<boolean, AdminHackathonListItem>(
    (approved) =>
      sendRequest<AdminHackathonListItem>(`/api/admin/hackathons/${item.id}/hna-approved`, {
        method: "PATCH",
        json: { hnaApproved: approved },
      }),
    {
      onSuccess: (saved, _value, { latest }) => {
        confirmedHnaApprovedRef.current = saved.hnaApproved === true;

        if (latest) {
          onPatch(item.id, { hnaApproved: saved.hnaApproved === true });
        }
      },
      onError: (error, value) => {
        onPatch(item.id, { hnaApproved: confirmedHnaApprovedRef.current });
        reportBackgroundFailure(error, {
          message: `Couldn't update HNA approval for ${item.name}.`,
          retry: () => setHnaApproved(value),
        });
      },
    }
  );

  function setHnaApproved(approved: boolean) {
    onPatch(item.id, { hnaApproved: approved });
    saveHnaApproved(approved);
  }

  return (
    <div className="min-w-0">
      <HackathonCard
        cornerAction={
          <div className="flex items-center gap-1">
            <CardIconAction label="Edit" onClick={() => onEdit(item)}>
              <Pencil aria-hidden="true" className="size-4" />
            </CardIconAction>
            <CardIconAction
              label={item.isRecurring ? "Repeats yearly" : "Not repeating"}
              onClick={() => setRecurring(!item.isRecurring)}
              pressed={item.isRecurring}
            >
              <Repeat aria-hidden="true" className="size-4" />
            </CardIconAction>
            <CardIconAction
              label={hnaApproved ? "HNA approved" : "Not HNA approved"}
              onClick={() => setHnaApproved(!hnaApproved)}
              pressed={hnaApproved}
            >
              <BadgeCheck aria-hidden="true" className="size-4" />
            </CardIconAction>
            <CardIconAction label="Delete" onClick={() => onDelete(item)} tone="danger">
              <Trash2 aria-hidden="true" className="size-4" />
            </CardIconAction>
          </div>
        }
        hackathon={{
          ...previewPayloadToCard(itemToPreviewPayload(item), item.id),
        }}
        preview
      />
    </div>
  );
}

/* An icon-only action in the card's footer, where the public card has its
   votes and More info. Its name shows in a small label above it on hover or
   keyboard focus; screen readers get the same text from aria-label. Toggles
   (repeating, HNA approved) fill in when on, and their label names the
   current state. */
function CardIconAction({
  children,
  label,
  onClick,
  pressed,
  tone = "default",
}: {
  children: ReactNode;
  label: string;
  onClick: () => void;
  pressed?: boolean;
  tone?: "default" | "danger";
}) {
  const stateClassName = pressed
    ? "bg-pine text-paper hover:bg-pine/90"
    : tone === "danger"
      ? "text-ink/55 hover:bg-danger/10 hover:text-danger"
      : "text-ink/55 hover:bg-ink/[0.07] hover:text-ink";

  return (
    <button
      aria-label={label}
      aria-pressed={pressed}
      className={`group/action relative grid size-8 place-items-center rounded-full transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine ${stateClassName}`}
      onClick={onClick}
      type="button"
    >
      {children}
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-full left-1/2 mb-1.5 -translate-x-1/2 whitespace-nowrap rounded-md bg-ink px-2 py-1 text-[11px] font-medium leading-none text-paper opacity-0 shadow-sm transition-opacity delay-0 duration-150 group-hover/action:opacity-100 group-hover/action:delay-150 group-focus-visible/action:opacity-100 motion-reduce:transition-none"
      >
        {label}
      </span>
    </button>
  );
}

/* An open (or parked) edit dialog. Dialogs stay mounted while their save runs
   in the background, so a rejected save can reopen with every typed edit. */
type Editor = {
  item: AdminHackathonListItem;
  phase: "editing" | "saving" | "failed";
  error?: string;
};

function withoutKey<T>(record: Record<string, T>, key: string) {
  const next = { ...record };
  delete next[key];
  return next;
}

/* Puts a restored item back where it sat in the server's original ordering. */
function restoreInOrder(current: AdminHackathonListItem[], target: AdminHackathonListItem, order: string[]) {
  if (current.some((item) => item.id === target.id)) {
    return current;
  }

  const rank = (id: string) => order.indexOf(id);
  const index = current.findIndex((item) => rank(item.id) > rank(target.id));
  const next = [...current];
  next.splice(index === -1 ? next.length : index, 0, target);
  return next;
}

/* Every action here is optimistic: deletes hide the card behind an undo
   toast, the recurring toggle flips instantly, and edits close the dialog and
   update the card while the PATCH runs. Failures restore the previous state
   and explain why in a toast. */
export function PublishedHackathonManager({ hackathons }: { hackathons: AdminHackathonListItem[] }) {
  const [items, setItems] = useState(hackathons);
  const [order] = useState(() => hackathons.map((item) => item.id));
  const [editors, setEditors] = useState<Record<string, Editor>>({});
  const [visibleEditorId, setVisibleEditorId] = useState<string | null>(null);

  function patchItem(hackathonId: string, patch: Partial<AdminHackathonListItem>) {
    setItems((current) => current.map((item) => (item.id === hackathonId ? { ...item, ...patch } : item)));
  }

  function deleteItem(target: AdminHackathonListItem) {
    setItems((current) => current.filter((item) => item.id !== target.id));
    setEditors((current) => withoutKey(current, target.id));

    scheduleUndoableRequest({
      message: `Deleted ${target.name}.`,
      failureMessage: `Couldn't delete ${target.name}.`,
      url: `/api/admin/hackathons/${target.id}`,
      init: { method: "DELETE" },
      onUndo: () => setItems((current) => restoreInOrder(current, target, order)),
      retry: () => deleteItem(target),
    });
  }

  function openEditor(item: AdminHackathonListItem) {
    const existing = editors[item.id];

    if (existing?.phase === "saving") {
      showToast({ message: `Still saving your last changes to ${item.name}.` });
      return;
    }

    setEditors((current) => {
      // Opening another listing closes a plain (unsaved, unfailed) draft.
      const next =
        visibleEditorId && visibleEditorId !== item.id && current[visibleEditorId]?.phase === "editing"
          ? withoutKey(current, visibleEditorId)
          : current;

      // A failed draft reopens as-is, with the user's edits and the error.
      return next[item.id] ? next : { ...next, [item.id]: { item, phase: "editing" } };
    });
    setVisibleEditorId(item.id);
  }

  function closeEditor(hackathonId: string) {
    setEditors((current) => withoutKey(current, hackathonId));
    setVisibleEditorId((current) => (current === hackathonId ? null : current));
  }

  function submitEdit(hackathonId: string, body: Record<string, unknown>, optimistic: AdminHackathonListItem) {
    const before = items.find((item) => item.id === hackathonId);

    setEditors((current) =>
      current[hackathonId] ? { ...current, [hackathonId]: { ...current[hackathonId], phase: "saving", error: undefined } } : current
    );
    setVisibleEditorId((current) => (current === hackathonId ? null : current));
    patchItem(hackathonId, withoutRecurring(optimistic));

    sendRequest<AdminHackathonListItem>(`/api/admin/hackathons/${hackathonId}`, { method: "PATCH", json: body })
      .then((saved) => {
        patchItem(hackathonId, withoutRecurring(saved));
        setEditors((current) => withoutKey(current, hackathonId));
      })
      .catch((error: unknown) => {
        if (before) {
          patchItem(hackathonId, withoutRecurring(before));
        }

        const reason =
          error instanceof RequestError && error.serverMessage
            ? error.serverMessage
            : "Could not save changes. Check the required fields.";

        setEditors((current) =>
          current[hackathonId]
            ? { ...current, [hackathonId]: { ...current[hackathonId], phase: "failed", error: reason } }
            : current
        );
        // Reopen right away unless another dialog is in use; the toast can
        // reopen it later either way.
        setVisibleEditorId((current) => current ?? hackathonId);
        reportBackgroundFailure(error, {
          message: `Couldn't save changes to ${optimistic.name}.`,
          undoneNote: "Your edits were kept in the editor.",
          action: { label: "Reopen", onClick: () => setVisibleEditorId(hackathonId) },
        });
      });
  }

  if (!items.length && !Object.keys(editors).length) {
    return (
      <p className="rounded-xl border border-ink/10 bg-surface p-6 text-sm text-ink/55">
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
            onDelete={deleteItem}
            onEdit={openEditor}
            onPatch={patchItem}
          />
        ))}
      </div>
      {Object.entries(editors).map(([hackathonId, editor]) => (
        <HackathonEditDialog
          error={editor.error ?? null}
          hidden={visibleEditorId !== hackathonId}
          item={editor.item}
          key={hackathonId}
          onClose={() => closeEditor(hackathonId)}
          onSubmit={(body, optimistic) => submitEdit(hackathonId, body, optimistic)}
        />
      ))}
    </>
  );
}

/* The recurring flag has its own toggle and endpoint, so edits never touch it. */
function withoutRecurring(item: AdminHackathonListItem): Partial<AdminHackathonListItem> {
  const rest: Partial<AdminHackathonListItem> = { ...item };
  delete rest.isRecurring;
  return rest;
}
