/* The beige watercolor backdrop shared by the landing hero and the
   /hackathons header band. It is a flat beige gradient with two layers of
   fractal noise on top: a pale cream wash and deeper tan blotches, each turned
   into a soft alpha mask by a color matrix.

   With `dome`, a white "horizon" cuts into the bottom: a quadratic curve whose
   height scales with the viewport (--dome, set by the caller) so the arc keeps
   the same curvature at any width. Decorative throughout. */
export function WatercolorBackdrop({ className = "", dome = false }: { className?: string; dome?: boolean }) {
  return (
    <div aria-hidden="true" className={`pointer-events-none overflow-hidden ${className}`}>
      <svg className="absolute inset-0 size-full" preserveAspectRatio="xMidYMid slice" viewBox="0 0 1600 480">
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

      {dome ? (
        <svg
          className="absolute inset-x-0 bottom-0 h-[var(--dome)] w-full"
          preserveAspectRatio="none"
          viewBox="0 0 100 100"
        >
          {/* Edges sit on the bottom, the peak touches the top: a quadratic
              with its control point at -100 peaks at exactly y=0. The extra 1
              unit below hides any sub-pixel seam against the white page. */}
          <path d="M0 100 Q50 -100 100 100 V101 H0 Z" fill="#fff" />
        </svg>
      ) : null}
    </div>
  );
}
