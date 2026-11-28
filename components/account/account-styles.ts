// Shared class names for the owner's /account page: the view-mode header
// actions, the in-place edit form, and the Devpost import controls.

const focusRing = "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine";

// Padding is kept out of the shared base so variants never carry two
// conflicting px-* utilities (Tailwind, not class order, decides which wins).
const buttonBase = `inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-full text-sm font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${focusRing}`;
const secondarySkin = "border border-ink/15 bg-surface text-ink hover:border-ink/25 hover:bg-ink/[0.04]";

export const primaryButtonClassName = `${buttonBase} bg-pine px-4 text-paper hover:bg-pine/90`;

export const secondaryButtonClassName = `${buttonBase} ${secondarySkin} px-4`;

/** A 44px square icon-only button; give it an aria-label and a title. */
export const iconButtonClassName = `${buttonBase} ${secondarySkin} size-11`;

export const eyebrowClassName = "text-xs font-semibold uppercase tracking-[0.14em] text-ink/55";

export const cardClassName = "rounded-2xl border border-ink/10 bg-surface";
