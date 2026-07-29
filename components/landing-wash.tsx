import type { CSSProperties } from "react";

/* The landing page's airbrushed gradient bloom — the same wash-and-grain
   treatment as the hackathon card's tier streak, fixed to a pale tint of the
   site's moss accent so it stays background against the paper ground.
   Deterministic from the seed, so it renders identically on server and client
   and is safe inside server components. */

/* Tiling grayscale noise: desaturated feTurbulence pushed to high contrast so
   the speckle survives overlay-blending onto a pale tint. Masked to the
   bloom's own shape so the grain rides the tinted area and dissolves with it. */
const WASH_NOISE_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='3' intercept='-1'/%3E%3CfeFuncG type='linear' slope='3' intercept='-1'/%3E%3CfeFuncB type='linear' slope='3' intercept='-1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* Pale step of the moss accent — light enough that ink text keeps its
   contrast anywhere the bloom lands. */
const WASH_RGB = "121 214 178";

/* Tiny LCG so a bloom can be "random" yet deterministic: seeding off a string
   keeps the shape identical between server and client renders and stable
   across visits, unlike Math.random(). */
function seededRandom(seed: number) {
  let state = seed >>> 0 || 1;

  return () => {
    state = (state * 1664525 + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

function getWash(seed: string) {
  const hash = Array.from(seed).reduce(
    (total, character) => (total * 31 + character.charCodeAt(0)) >>> 0,
    0
  );
  const random = seededRandom(hash);
  const entersFromLeft = random() < 0.72;
  const centerX = Math.round(entersFromLeft ? -18 + random() * 24 : 94 + random() * 24);
  const centerY = Math.round(14 + random() * 72);
  const radiusX = Math.round(48 + random() * 16);
  const radiusY = Math.round(56 + random() * 30);
  const shoulderRadiusX = radiusX + Math.round(2 + random() * 4);
  const shoulderRadiusY = radiusY + Math.round(2 + random() * 5);
  const ellipse = `ellipse ${radiusX}% ${radiusY}% at ${centerX}% ${centerY}%`;
  const shoulder = `ellipse ${shoulderRadiusX}% ${shoulderRadiusY}% at ${centerX}% ${centerY}%`;

  return {
    wash: [
      `radial-gradient(${shoulder}, transparent 46%, rgb(${WASH_RGB} / 0.18) 52%, rgb(${WASH_RGB} / 0.07) 61%, transparent 72%)`,
      `radial-gradient(${ellipse}, rgb(${WASH_RGB} / 0.4) 0%, rgb(${WASH_RGB} / 0.38) 40%, rgb(${WASH_RGB} / 0.24) 53%, rgb(${WASH_RGB} / 0.09) 65%, transparent 76%)`,
    ].join(", "),
    mask: `radial-gradient(${shoulder}, black 0%, black 58%, transparent 82%)`,
  };
}

export function LandingWash({ className, seed }: { className?: string; seed: string }) {
  const { wash, mask } = getWash(seed);

  return (
    <div
      aria-hidden="true"
      className={`pointer-events-none absolute inset-0 overflow-hidden ${className ?? ""}`}
    >
      <div className="absolute inset-0" style={{ backgroundImage: wash }} />
      <div
        className="absolute inset-0 opacity-70 mix-blend-overlay"
        style={
          {
            backgroundImage: WASH_NOISE_URI,
            maskImage: mask,
            WebkitMaskImage: mask,
          } as CSSProperties
        }
      />
    </div>
  );
}
