/* The airbrushed "streak" wash: a soft elliptical bloom with a faint outer
   shoulder ring, plus a grain overlay masked to the same shape. Shared by the
   hackathon cards (one seeded bloom per card) and the page-wide PageWash
   (a few fixed brown blooms). Positions and radii are percentages of whatever
   box paints the gradient. */

/* Tiling grayscale noise: desaturated feTurbulence pushed to high contrast so
   the speckle survives overlay-blending onto a pale tint. Masked to the
   bloom's own shape so the grain rides the tinted area and dissolves with it. */
export const STREAK_NOISE_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.9' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='3' intercept='-1'/%3E%3CfeFuncG type='linear' slope='3' intercept='-1'/%3E%3CfeFuncB type='linear' slope='3' intercept='-1'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")";

export type StreakBloomShape = {
  centerX: number;
  centerY: number;
  radiusX: number;
  radiusY: number;
  /* The shoulder ring's radii; a few points wider than the core bloom. */
  shoulderRadiusX: number;
  shoulderRadiusY: number;
};

/* Builds one bloom's gradient layers (`wash`, two comma-joined
   radial-gradients) and its grain `mask`. `rgb` is a space-separated triplet
   ("180 140 100"). `strength` scales every stop's alpha, so 1 is the cards'
   original intensity and lower values fade the bloom. */
export function streakBloom(shape: StreakBloomShape, rgb: string, strength = 1) {
  const { centerX, centerY, radiusX, radiusY, shoulderRadiusX, shoulderRadiusY } = shape;
  const ellipse = `ellipse ${radiusX}% ${radiusY}% at ${centerX}% ${centerY}%`;
  const shoulder = `ellipse ${shoulderRadiusX}% ${shoulderRadiusY}% at ${centerX}% ${centerY}%`;
  const tint = (alpha: number) => `rgb(${rgb} / ${Number((alpha * strength).toFixed(3))})`;

  return {
    wash: [
      `radial-gradient(${shoulder}, transparent 46%, ${tint(0.2)} 52%, ${tint(0.08)} 61%, transparent 72%)`,
      `radial-gradient(${ellipse}, ${tint(0.46)} 0%, ${tint(0.44)} 40%, ${tint(0.28)} 53%, ${tint(0.1)} 65%, transparent 76%)`,
    ].join(", "),
    mask: `radial-gradient(${shoulder}, black 0%, black 58%, transparent 82%)`,
  };
}

/* A softer bloom for the image-less card covers: no shoulder ring and no flat
   core. The tint eases out from the center along the whole radius, so the
   bloom melts into the paper instead of ending in a visible edge, and the
   grain mask thins out on the same curve. `strength` works as in streakBloom. */
export function softStreakBloom(
  shape: Pick<StreakBloomShape, "centerX" | "centerY" | "radiusX" | "radiusY">,
  rgb: string,
  strength = 1
) {
  const { centerX, centerY, radiusX, radiusY } = shape;
  const ellipse = `ellipse ${radiusX}% ${radiusY}% at ${centerX}% ${centerY}%`;
  const tint = (alpha: number) => `rgb(${rgb} / ${Number((alpha * strength).toFixed(3))})`;

  return {
    wash: `radial-gradient(${ellipse}, ${tint(0.46)} 0%, ${tint(0.42)} 15%, ${tint(0.34)} 30%, ${tint(0.24)} 45%, ${tint(0.14)} 60%, ${tint(0.06)} 75%, ${tint(0.015)} 88%, transparent 100%)`,
    mask: `radial-gradient(${ellipse}, black 0%, rgb(0 0 0 / 0.75) 35%, rgb(0 0 0 / 0.35) 60%, rgb(0 0 0 / 0.1) 80%, transparent 95%)`,
  };
}
