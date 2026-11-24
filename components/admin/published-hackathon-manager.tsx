"use client";

import { useRef, useState } from "react";
import { Pencil, Repeat, Trash2 } from "lucide-react";

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

  return (
    <div className="min-w-0">
      <HackathonCard
        hackathon={{
          ...previewPayloadToCard(itemToPreviewPayload(item), item.id),
        }}
        preview
      />
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-full bg-pine px-4 text-sm font-semibold text-paper hover:bg-pine/90 disabled:opacity-50"
          onClick={() => onEdit(item)}
          type="button"
        >
          <Pencil aria-hidden="true" className="size-4" />
          Edit
        </button>
        <button
          aria-pressed={item.isRecurring}
          className={`inline-flex min-h-10 items-center gap-2 rounded-full border px-4 text-sm font-semibold ${
            item.isRecurring
              ? "border-pine bg-pine text-paper"
              : "border-ink/20 text-ink/70"
          }`}
          onClick={() => setRecurring(!item.isRecurring)}
          type="button"
        >
          <Repeat aria-hidden="true" className="size-4" />
          {item.isRecurring ? "Repeats yearly" : "Not repeating"}
        </button>
        <button
          className="inline-flex min-h-10 items-center gap-2 rounded-full border border-danger px-4 text-sm font-semibold text-danger"
          onClick={() => onDelete(item)}
          type="button"
        >
          <Trash2 aria-hidden="true" className="size-4" />
          Delete
        </button>
      </div>
    </div>
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
