import { GraduationCap } from "lucide-react";

import { getInitials } from "@/components/profile/profile-primitives";
import type { ProfileLink } from "@/components/profile/profile-sections";
import { profileFocusRingClassName } from "@/components/profile/profile-styles";

// Presentational only (no hooks, no server-only imports): rendered by the
// public share page and by the owner's client-side account form.

export function ProfileHeader({
  name,
  username,
  school,
  bio,
  links,
  actions,
}: {
  name: string;
  username?: string | null;
  school?: string | null;
  bio?: string | null;
  links: ProfileLink[];
  /**
   * Buttons etc., laid out in one row: top-right from md up, after the bio
   * below that. Callers keep them compact so the name keeps its width.
   */
  actions?: React.ReactNode;
}) {
  const displayName = name.trim() || "Hacker";
  const handle = username?.trim();
  const schoolName = school?.trim();
  const bioText = bio?.trim();

  return (
    // Grid so the actions can sit top-right on desktop but come last on
    // smaller screens. The bio row spans both columns, so only the name
    // shares its row with the actions.
    <header className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-6">
      <div className="flex min-w-0 items-center gap-4 sm:gap-5 md:col-start-1 md:row-start-1">
        <div
          aria-hidden="true"
          className="grid size-16 shrink-0 select-none place-items-center rounded-full border border-ink/10 bg-pine-soft text-xl font-semibold tracking-tight text-pine sm:size-20 sm:text-2xl"
        >
          {getInitials(displayName) || "H"}
        </div>

        <div className="min-w-0 flex-1">
          <h1 className="break-words text-2xl font-semibold tracking-tight text-ink sm:text-3xl">
            {displayName}
          </h1>

          {handle || schoolName ? (
            <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-ink/55">
              {handle ? <span className="break-all">@{handle}</span> : null}
              {handle && schoolName ? <span aria-hidden="true">·</span> : null}
              {schoolName ? (
                <span className="inline-flex min-w-0 items-center gap-1.5">
                  <GraduationCap aria-hidden="true" className="size-4 shrink-0" />
                  <span className="min-w-0 break-words">{schoolName}</span>
                </span>
              ) : null}
            </p>
          ) : null}
        </div>
      </div>

      {bioText || links.length > 0 ? (
        // Indented on desktop to line up with the name (avatar 5rem + gap 1.25rem).
        <div className="min-w-0 sm:pl-[6.25rem] md:col-span-2 md:row-start-2">
          {bioText ? (
            <p className="max-w-prose whitespace-pre-line text-[15px] leading-relaxed text-ink/75">{bioText}</p>
          ) : null}

          {links.length > 0 ? (
            <ul aria-label="Links" className={`-ml-2.5 flex flex-wrap items-center ${bioText ? "mt-2" : "-mt-2"}`}>
              {links.map(({ href, icon: Icon, label, platform }) => {
                const accessibleName = platform ? `${platform}: ${label}` : label;

                return (
                  <li key={href}>
                    <a
                      aria-label={accessibleName}
                      className={`grid size-11 place-items-center rounded-full text-ink/55 transition-colors hover:bg-ink/[0.05] hover:text-ink ${profileFocusRingClassName}`}
                      href={href}
                      rel="noreferrer nofollow"
                      target="_blank"
                      title={accessibleName}
                    >
                      <Icon aria-hidden="true" className="size-[18px]" />
                    </a>
                  </li>
                );
              })}
            </ul>
          ) : null}
        </div>
      ) : null}

      {actions ? (
        // One row, never wrapping (callers keep them compact). Indented like
        // the bio between sm and md, where it sits under the name.
        <div className="flex min-w-0 items-center gap-2 sm:pl-[6.25rem] md:col-start-2 md:row-start-1 md:justify-end md:self-start md:pl-0">
          {actions}
        </div>
      ) : null}
    </header>
  );
}
