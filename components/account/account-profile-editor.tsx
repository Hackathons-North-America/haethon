"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check, Eye, Link2, Pencil } from "lucide-react";

import { AccountDevpostImportCard } from "@/components/account/account-devpost-import";
import {
  iconButtonClassName,
  primaryButtonClassName,
  secondaryButtonClassName,
} from "@/components/account/account-styles";
import { AccountProfileForm, type AccountProfileValues } from "@/components/forms/account-profile-form";
import type { DevpostImportState } from "@/components/forms/devpost-import-dialog";
import { ProfileHeader } from "@/components/profile/profile-header";
import { buildProfileLinks } from "@/components/profile/profile-sections";
import { showToast } from "@/lib/client/toast-store";
import { profileShareUrl } from "@/lib/profile/username";

/**
 * The top of /account: the same header visitors see on /p/<username>, plus
 * owner actions. "Edit profile" swaps the header for the edit form in place.
 *
 * The view always renders the server's props. After a save, leaving edit mode
 * and router.refresh() run in one transition, so the form stays up (showing
 * "Saving") until the refreshed values arrive — no stale flash, and the
 * server-rendered sections below (skills, stats) update in the same commit.
 *
 * `stats` and `children` are those server-rendered sections (server
 * components passed through this client component). They show only in view
 * mode: while editing they would repeat what the form edits (Skills) and
 * push Save thousands of pixels down the page.
 */
export function AccountProfileEditor({
  values,
  username,
  devpostImport,
  stats,
  children,
}: {
  values: AccountProfileValues;
  username: string | null;
  devpostImport: DevpostImportState;
  /** Rendered right under the header, in view mode only. */
  stats?: React.ReactNode;
  /** The sections below the header, in view mode only. */
  children?: React.ReactNode;
}) {
  const router = useRouter();
  const [mode, setMode] = useState<"view" | "edit">("view");
  const [, startTransition] = useTransition();
  const [copied, setCopied] = useState(false);
  const editButtonRef = useRef<HTMLButtonElement>(null);
  // Set right before leaving edit mode; read once the view has committed.
  const pendingReturn = useRef<"cancel" | "save" | null>(null);

  useEffect(() => {
    if (mode !== "view" || !pendingReturn.current) {
      return;
    }

    if (pendingReturn.current === "save") {
      showToast({ message: "Profile saved" });
    }

    pendingReturn.current = null;
    editButtonRef.current?.focus();
  }, [mode]);

  useEffect(() => {
    if (!copied) {
      return;
    }

    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  async function copyProfileLink() {
    if (!username) {
      return;
    }

    try {
      await navigator.clipboard.writeText(profileShareUrl(window.location.origin, username));
      setCopied(true);
      showToast({ message: "Profile link copied" });
    } catch {
      showToast({ message: "Couldn't copy the link", description: "Open your public profile and copy it from the address bar.", tone: "error" });
    }
  }

  if (mode === "edit") {
    return (
      <>
        <div id="profile">
          <AccountProfileForm
            devpostCard={<AccountDevpostImportCard state={devpostImport} />}
            onCancel={() => {
              pendingReturn.current = "cancel";
              setMode("view");
            }}
            onSaved={() => {
              pendingReturn.current = "save";
              startTransition(() => {
                setMode("view");
                router.refresh();
              });
            }}
            values={values}
          />
        </div>
        {stats || children ? (
          <p className="rounded-2xl border border-dashed border-ink/15 px-4 py-3 text-sm text-ink/55">
            Your profile sections are hidden while editing. Save or cancel to see them again.
          </p>
        ) : null}
      </>
    );
  }

  const name = [values.firstName, values.lastName].filter(Boolean).join(" ").trim();
  const links = buildProfileLinks(values);
  const missing = [
    !name && "your name",
    !values.school?.trim() && "your school",
    !values.bio?.trim() && "a short bio",
    links.length === 0 && "your links",
  ].filter((item): item is string => Boolean(item));

  return (
    <>
      <div className="space-y-6" id="profile">
        <div>
          <ProfileHeader
            actions={
              <>
                <button
                  className={`${primaryButtonClassName} min-w-0 flex-1 md:flex-none`}
                  onClick={() => setMode("edit")}
                  ref={editButtonRef}
                  type="button"
                >
                  {/* Icons from sm up: at 360px the two labels need the room. */}
                  <Pencil aria-hidden="true" className="hidden size-4 sm:block" />
                  Edit profile
                </button>
                {username ? (
                  <>
                    <Link
                      className={`${secondaryButtonClassName} min-w-0 flex-1 md:flex-none`}
                      href={`/p/${username}`}
                      prefetch={false}
                      title="View public profile"
                    >
                      <Eye aria-hidden="true" className="hidden size-4 sm:block" />
                      View profile
                    </Link>
                    <button
                      aria-label={copied ? "Profile link copied" : "Copy profile link"}
                      className={iconButtonClassName}
                      onClick={copyProfileLink}
                      title="Copy profile link"
                      type="button"
                    >
                      {copied ? <Check aria-hidden="true" className="size-4" /> : <Link2 aria-hidden="true" className="size-4" />}
                    </button>
                  </>
                ) : null}
              </>
            }
            bio={values.bio}
            links={links}
            name={name}
            school={values.school}
            username={username}
          />

          {missing.length > 0 ? (
            <p className="mt-4 rounded-2xl border border-dashed border-ink/15 px-4 py-3 text-sm text-ink/55">
              Only you see this: add {joinList(missing)} so organizers and teammates know who you are.
            </p>
          ) : null}
        </div>
        {stats}
      </div>
      {children}
    </>
  );
}

function joinList(items: string[]) {
  if (items.length <= 1) {
    return items[0] ?? "";
  }

  return `${items.slice(0, -1).join(", ")}${items.length > 2 ? "," : ""} and ${items.at(-1)}`;
}
