import { STREAK_NOISE_URI, streakBloom, type StreakBloomShape } from "@/lib/streak-wash";

/* The bloom color follows the theme through --page-wash-rgb (app/globals.css):
   coffee brown ("140 95 60") in light mode, the accent tan ("220 185 148") in
   dark mode, so the blooms read as light-brown glows on the espresso page. */
const PAGE_WASH_RGB = "var(--page-wash-rgb)";

/* Fades every bloom relative to the cards' original intensity. The blooms
   cover far more area than a card's did, so full strength would muddy the page. */
const PAGE_WASH_STRENGTH = 0.6;

/* A few blooms scattered around the viewport, each partly off-canvas so it
   reads as a wash bleeding in from the edge rather than a centered spot.
   Percentages are of the viewport. */
const PAGE_WASH_BLOOMS: StreakBloomShape[] = [
  /* Upper left. */
  { centerX: -8, centerY: 12, radiusX: 46, radiusY: 52, shoulderRadiusX: 50, shoulderRadiusY: 57 },
  /* Right edge, mid-height. */
  { centerX: 108, centerY: 52, radiusX: 42, radiusY: 48, shoulderRadiusX: 46, shoulderRadiusY: 53 },
  /* Rising from the bottom, left of center. */
  { centerX: 30, centerY: 104, radiusX: 50, radiusY: 40, shoulderRadiusX: 54, shoulderRadiusY: 44 },
];

const blooms = PAGE_WASH_BLOOMS.map((shape) => streakBloom(shape, PAGE_WASH_RGB, PAGE_WASH_STRENGTH));
const washImage = blooms.map((bloom) => bloom.wash).join(", ");
/* Mask layers composite with `add` by default, so the grain shows wherever
   any bloom does. */
const grainMask = blooms.map((bloom) => bloom.mask).join(", ");

/* The page-wide brown wash: the same airbrushed bloom and grain as the
   hackathon cards' streak, in one coffee brown, fixed to the viewport so it stays
   put while content scrolls over it. It sits at -z-10 in the root stacking
   context, above the canvas (html's bg-paper) and below all page content.
   Pages with an opaque background of their own cover it. Decorative only. */
export function PageWash() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 -z-10 bg-paper dark:opacity-75"
      style={{ backgroundImage: washImage }}
    >
      <div
        className="absolute inset-0 opacity-70 mix-blend-overlay"
        style={{
          backgroundImage: STREAK_NOISE_URI,
          maskImage: grainMask,
          WebkitMaskImage: grainMask,
        }}
      />
    </div>
  );
}
