/* The beige watercolor backdrop shared by the landing hero and the
   /hackathons header band. It is a flat beige gradient with two layers of
   fractal noise on top: a pale cream wash and deeper tan blotches, each turned
   into a soft alpha mask by a color matrix.

   With `dome`, a "horizon" cuts into the bottom: a quadratic curve whose
   height scales with the viewport (--dome, set by the caller) so the arc keeps
   the same curvature at any width. The cut is a mask, not a painted shape, so
   whatever sits behind the backdrop (the landing page's surface, the app's
   PageWash) shows through the arc unchanged. In dark mode the whole wash is
   dimmed by --watercolor-filter (app/globals.css) so its texture survives as
   a dark ground. Decorative throughout. */

/* The mask's bottom layer: opaque above the curve, clear below it. Edges sit
   on the bottom and the peak touches the top: a quadratic with its control
   point at -100 peaks at exactly y=0. Stretched to the full width and
   --dome tall by preserveAspectRatio="none". */
const DOME_MASK_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100' preserveAspectRatio='none'%3E%3Cpath d='M0 0H100V100Q50 -100 0 100Z'/%3E%3C/svg%3E\")";

/* A solid layer over everything above the dome strip (overlapping it by 1px
   so no seam shows between the two layers), then the curve below. */
const domeMask = {
  maskImage: `linear-gradient(#000, #000), ${DOME_MASK_URI}`,
  maskSize: "100% calc(100% - var(--dome) + 1px), 100% var(--dome)",
  maskPosition: "top, bottom",
  maskRepeat: "no-repeat",
  WebkitMaskImage: `linear-gradient(#000, #000), ${DOME_MASK_URI}`,
  WebkitMaskSize: "100% calc(100% - var(--dome) + 1px), 100% var(--dome)",
  WebkitMaskPosition: "top, bottom",
  WebkitMaskRepeat: "no-repeat",
};

export function WatercolorBackdrop({ className = "", dome = false }: { className?: string; dome?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none overflow-hidden ${className}`}
      style={dome ? domeMask : undefined}
    >
      <svg
        className="absolute inset-0 size-full [filter:var(--watercolor-filter)]"
        preserveAspectRatio="xMidYMid slice" viewBox="0 0 1600 480">
        <defs>
          <linearGradient id="watercolor-base" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0" stopColor="#dcc8aa" />
            <stop offset="0.65" stopColor="#e6d6bd" />
            <stop offset="1" stopColor="#efe4d2" />
          </linearGradient>

          <filter height="100%" id="watercolor-wash" width="100%" x="0" y="0">
            <feTurbulence baseFrequency="0.0032 0.0065" numOctaves="4" seed="11" type="fractalNoise" />
            <feColorMatrix values="0 0 0 0 1  0 0 0 0 0.99  0 0 0 0 0.97  3 0 0 0 -1.35" />
            <feGaussianBlur stdDeviation="5" />
          </filter>

          <filter height="100%" id="watercolor-blotch" width="100%" x="0" y="0">
            <feTurbulence baseFrequency="0.0045 0.008" numOctaves="3" seed="4" type="fractalNoise" />
            <feColorMatrix values="0 0 0 0 0.78  0 0 0 0 0.66  0 0 0 0 0.5  0 3.2 0 0 -1.4" />
            <feGaussianBlur stdDeviation="10" />
          </filter>
        </defs>

        <rect fill="url(#watercolor-base)" height="480" width="1600" />
        <rect filter="url(#watercolor-blotch)" height="480" width="1600" />
        <rect filter="url(#watercolor-wash)" height="480" opacity="0.55" width="1600" />
      </svg>
    </div>
  );
}
