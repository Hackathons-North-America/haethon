"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";
import { BadgeCheck } from "lucide-react";

import { cardClassName } from "@/components/account/account-styles";
import { DevpostImportDialog, type DevpostImportState } from "@/components/forms/devpost-import-dialog";

/**
 * The Devpost verify + import flow for the owner's /account page.
 *
 * `state` always comes from the server (devpostVerificationState), so it
 * already describes the saved Devpost URL. When the dialog saves a new
 * Devpost handle, the page is refreshed so the header links, the edit form's
 * draft and this state all pick it up; the dialog refreshes again itself
 * after a verification or an import, so the card's "Verified" line updates.
 *
 * Only one instance is mounted at a time: the card's while editing, the
 * attended section's otherwise (that section is hidden while editing).
 */
export function AccountDevpostImportButton({ state }: { state: DevpostImportState }) {
  const router = useRouter();
  const [, startTransition] = useTransition();

  return (
    <DevpostImportDialog
      initialState={state}
      onProfileSaved={() => {
        startTransition(() => router.refresh());
      }}
    />
  );
}

function formatImportedAt(value: string | null) {
  if (!value) {
    return null;
  }

  const date = new Date(value);

  return Number.isNaN(date.getTime())
    ? null
    : new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(date);
}

/**
 * Card form of the import flow, shown alongside the edit form. It lives
 * outside the edit <form> element because the dialog contains a form of its
 * own, and it saves independently of the edit form's Save button.
 */
export function AccountDevpostImportCard({ state }: { state: DevpostImportState }) {
  const importedAt = formatImportedAt(state.lastImportedAt);

  return (
    <section aria-labelledby="profile-devpost-title" className={`${cardClassName} p-4 sm:p-5`}>
      <h2 className="text-base font-semibold tracking-tight text-ink" id="profile-devpost-title">
        Devpost import
      </h2>
      <p className="mt-0.5 text-sm text-ink/55">
        Add your Devpost projects and wins to Hackathons attended. Imports save on their own, separate from Save
        changes.
      </p>

      {state.handle ? (
        <p className="mt-3 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink/75">
          {state.verified ? (
            <span className="inline-flex items-center gap-1.5 font-medium text-pine">
              <BadgeCheck aria-hidden="true" className="size-4" />
              Verified as {state.handle}
            </span>
          ) : (
            <span>Linked to {state.handle}, not verified yet</span>
          )}
          {importedAt ? (
            <>
              <span aria-hidden="true" className="text-ink/35">
                ·
              </span>
              <span className="text-ink/55">Last imported {importedAt}</span>
            </>
          ) : null}
        </p>
      ) : null}

      <div className="mt-3">
        <AccountDevpostImportButton state={state} />
      </div>
    </section>
  );
}
