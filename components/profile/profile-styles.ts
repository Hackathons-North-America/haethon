// Class names shared by the profile's server sections and its client
// components (activity chart, attended table). Kept free of component and
// icon imports so a client component can use them without pulling
// next/image or react-icons into its bundle.

/** Modest section heading shared by every profile section. */
export const profileSectionTitleClassName = "text-base font-semibold tracking-tight text-ink sm:text-lg";

/** Gold used only for wins; the one non-token color on the profile. */
export const winnerTextClassName = "text-[#9a7b1f] dark:text-[#e8c76b]";
export const winnerPillClassName = `bg-[#D4A72C]/15 ${winnerTextClassName}`;

export const profileFocusRingClassName =
  "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine";

const pillBaseClassName =
  "inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-semibold";

/** Status pills: Winner (gold), Verified (success tint), Self-reported (neutral outline). */
export const profilePillClassNames = {
  winner: `${pillBaseClassName} ${winnerPillClassName}`,
  verified: `${pillBaseClassName} bg-success/10 text-success`,
  selfReported: `${pillBaseClassName} text-ink/60 ring-1 ring-inset ring-ink/15`,
} as const;
