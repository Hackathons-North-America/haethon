"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import {
  motion,
  useMotionTemplate,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";

import type { TechIcon, TechIconVibe } from "@/lib/faceoff/tech-icons";

/* Tiling grayscale speckle — the same feTurbulence trick the hackathon arena
   uses for its streak grain, kept here so both backdrops can dust their
   gradients with film noise instead of reading as flat CSS. */
const GRAIN_URI =
  "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='140' height='140'%3E%3Cfilter id='n'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='0.85' numOctaves='2' stitchTiles='stitch'/%3E%3CfeColorMatrix type='saturate' values='0'/%3E%3CfeComponentTransfer%3E%3CfeFuncR type='linear' slope='2.6' intercept='-0.8'/%3E%3CfeFuncG type='linear' slope='2.6' intercept='-0.8'/%3E%3CfeFuncB type='linear' slope='2.6' intercept='-0.8'/%3E%3C/feComponentTransfer%3E%3C/filter%3E%3Crect width='140' height='140' filter='url(%23n)'/%3E%3C/svg%3E\")";

/* One elevation band of the topographic field the card art sits on. Each layer
   is masked to its own blob so the rings fade out instead of tiling the whole
   viewport into moire, drifts on its own slow loop, and swings by its own
   `depth` as the pointer moves — near bands travel further than far ones, which
   is what turns a flat gradient into a space with room in it. */
type ContourLayer = {
  /* Ellipse ending-shape and center for the ring stack. */
  shape: string;
  /* Gap between rings, in px along the gradient ray. */
  spacing: number;
  drift: { x: number; y: number };
  duration: number;
  /* Parallax travel in px across the full width of the panel. */
  depth: number;
};

const CONTOUR_LAYERS: readonly ContourLayer[] = [
  { shape: "ellipse 60% 44% at 16% 22%", spacing: 15, drift: { x: 26, y: -18 }, duration: 34, depth: 26 },
  { shape: "ellipse 52% 68% at 84% 62%", spacing: 19, drift: { x: -22, y: 24 }, duration: 46, depth: 46 },
  { shape: "ellipse 76% 40% at 46% 94%", spacing: 23, drift: { x: 18, y: -14 }, duration: 58, depth: 72 },
];

type Vibe = {
  /* Base wash behind everything on this icon's half of the arena. */
  field: string;
  /* Slow-rotating color wheel that gives the field its shifting cast. */
  aurora: string;
  auroraOpacity: number;
  contour: string;
  contourOpacity: number;
  /* Foil pass raked across the card face, anchored to the pointer. */
  sheen: string;
  sheenBlend: CSSProperties["mixBlendMode"];
  /* Bloom pooled behind the card, and the ring around its edge. */
  glow: string;
  edge: string;
  grainOpacity: number;
};

/* Each icon's half of the arena is styled from its own vibe rather than a
   shared accent: the whole point is that Musk's oil-slick holo and Khosla's
   cobalt field feel like different worlds meeting at the VS. */
const ICON_VIBES: Record<TechIconVibe, Vibe> = {
  prism: {
    field: "radial-gradient(120% 90% at 50% 0%, #14101c 0%, #0a0810 45%, #050408 100%)",
    aurora:
      "conic-gradient(from 0deg at 50% 50%, #7c3aed, #06b6d4, #f59e0b, #ec4899, #22c55e, #7c3aed)",
    auroraOpacity: 0.34,
    contour: "rgba(214, 168, 72, 0.34)",
    contourOpacity: 0.9,
    sheen:
      "linear-gradient(112deg, transparent 34%, rgba(255,120,205,0.30) 40%, rgba(120,220,255,0.34) 44%, rgba(255,232,150,0.30) 48%, transparent 54%)",
    sheenBlend: "color-dodge",
    glow: "rgba(216, 166, 60, 0.55)",
    edge: "rgba(232, 196, 118, 0.55)",
    grainOpacity: 0.3,
  },
  cobalt: {
    field: "radial-gradient(120% 90% at 50% 0%, #2a3d99 0%, #1d2a70 42%, #101845 100%)",
    aurora:
      "conic-gradient(from 0deg at 50% 50%, #4f6ae0, #1b2a72, #7f97ff, #16205a, #4f6ae0)",
    auroraOpacity: 0.45,
    contour: "rgba(226, 233, 255, 0.16)",
    contourOpacity: 1,
    sheen:
      "linear-gradient(112deg, transparent 34%, rgba(190,210,255,0.26) 41%, rgba(255,255,255,0.32) 45%, rgba(150,180,255,0.24) 49%, transparent 56%)",
    sheenBlend: "soft-light",
    glow: "rgba(111, 141, 255, 0.5)",
    edge: "rgba(178, 198, 255, 0.5)",
    grainOpacity: 0.22,
  },
};

/**
 * The full-bleed field behind one icon's card: base wash, a slowly turning
 * color wheel, drifting topographic bands, and grain. Everything animates on
 * transforms only, so the looping layers stay on the compositor.
 *
 * Each band also parallaxes against the pointer at its own depth, so moving
 * across a panel moves the world behind the card rather than just the card.
 */
export function IconVibeBackdrop({
  dimmed,
  pointer,
  reduceMotion,
  vibe,
}: {
  /* True while the opposite panel has focus — this side pulls back so the one
     being considered is unmistakably the one in front. */
  dimmed: boolean;
  pointer: { x: MotionValue<number>; y: MotionValue<number> };
  reduceMotion: boolean;
  vibe: TechIconVibe;
}) {
  const theme = ICON_VIBES[vibe];

  return (
    <motion.div
      animate={{ opacity: dimmed ? 0.45 : 1 }}
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 -z-10 overflow-hidden"
      transition={{ duration: 0.5, ease: "easeOut" }}
    >
      <div className="absolute inset-0" style={{ background: theme.field }} />

      {/* An oversized wheel blurred past recognition — what survives is a slow
          drift of color temperature across the field. */}
      <motion.div
        animate={reduceMotion ? undefined : { rotate: 360 }}
        className="absolute left-1/2 top-1/2 aspect-square w-[170%] -translate-x-1/2 -translate-y-1/2 rounded-full blur-[100px]"
        style={{ background: theme.aurora, opacity: theme.auroraOpacity }}
        transition={{ duration: 90, ease: "linear", repeat: Infinity }}
      />

      <div className="absolute inset-0" style={{ opacity: theme.contourOpacity }}>
        {CONTOUR_LAYERS.map((layer, index) => (
          /* Two nested elements on purpose: the outer one carries the pointer
             parallax and the inner one the idle drift, so the two transforms
             compose instead of overwriting each other. */
          <ParallaxLayer depth={layer.depth} key={layer.shape} pointer={pointer} reduceMotion={reduceMotion}>
            <motion.div
              animate={
                reduceMotion
                  ? undefined
                  : { x: [0, layer.drift.x, 0], y: [0, layer.drift.y, 0] }
              }
              className="absolute inset-0"
              style={{
                backgroundImage: `repeating-radial-gradient(${layer.shape}, transparent 0 ${layer.spacing}px, ${theme.contour} ${layer.spacing}px ${layer.spacing + 1.5}px)`,
                /* Fade each band into the field so the stack reads as terrain
                   rather than three overlapping bullseyes. */
                maskImage: `radial-gradient(${layer.shape}, black 0%, black 46%, transparent 78%)`,
                WebkitMaskImage: `radial-gradient(${layer.shape}, black 0%, black 46%, transparent 78%)`,
              }}
              transition={{
                delay: index * 2,
                duration: layer.duration,
                ease: "easeInOut",
                repeat: Infinity,
              }}
            />
          </ParallaxLayer>
        ))}
      </div>

      <div
        className="absolute inset-0 mix-blend-overlay"
        style={{ backgroundImage: GRAIN_URI, opacity: theme.grainOpacity }}
      />

      {/* Pulls the eye to the card and hides where the contour masks run out. */}
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_72%_62%_at_50%_50%,transparent_30%,rgba(0,0,0,0.7)_100%)]" />
    </motion.div>
  );
}

function ParallaxLayer({
  children,
  depth,
  pointer,
  reduceMotion,
}: {
  children: React.ReactNode;
  depth: number;
  pointer: { x: MotionValue<number>; y: MotionValue<number> };
  reduceMotion: boolean;
}) {
  const glide = { damping: 30, stiffness: 90, mass: 0.8 };
  const x = useSpring(useTransform(pointer.x, [0, 1], [depth, -depth]), glide);
  const y = useSpring(useTransform(pointer.y, [0, 1], [depth * 0.6, -depth * 0.6]), glide);

  /* Oversized so the widest swing never drags an edge into frame. */
  return (
    <motion.div className="absolute -inset-[18%]" style={reduceMotion ? undefined : { x, y }}>
      {children}
    </motion.div>
  );
}

export type CardOutcome = "pending" | "won" | "lost";

/**
 * A card that behaves like a physical object: it tilts toward the pointer,
 * catches a foil sheen from wherever the light lands, floats above a blurred
 * reflection, and drags a soft bloom of its own color behind it.
 *
 * The card is presentation only — the whole panel around it is the vote
 * target — and it fills whatever box the panel sizes for it, so the artwork
 * scales with the viewport instead of a fixed width.
 */
export function IconCard({
  dimmed,
  entranceDelay,
  focused,
  icon,
  outcome,
  pointer,
  reduceMotion,
}: {
  dimmed: boolean;
  /* Staggers the two cards so the matchup deals in rather than snapping on. */
  entranceDelay: number;
  focused: boolean;
  icon: TechIcon;
  outcome: CardOutcome;
  /* Pointer position over the whole panel, 0–1 on each axis, owned by the panel
     so the card keeps reacting anywhere in its half of the arena. */
  pointer: { x: MotionValue<number>; y: MotionValue<number> };
  reduceMotion: boolean;
}) {
  const theme = ICON_VIBES[icon.vibe];
  const settle = { damping: 26, stiffness: 210, mass: 0.6 };
  const rotateY = useSpring(useTransform(pointer.x, [0, 1], [-19, 19]), settle);
  const rotateX = useSpring(useTransform(pointer.y, [0, 1], [16, -16]), settle);
  /* The sheen strip is twice the card's width and its band sits just left of
     center, so this range rakes the highlight from one edge of the visible face
     to the other. Percentages are of the doubled box, hence the small numbers. */
  const sheenX = useSpring(useTransform(pointer.x, [0, 1], [-14, 22]), settle);
  const sheenOffset = useMotionTemplate`${sheenX}%`;

  const won = outcome === "won";
  const lost = outcome === "lost";

  /* Scale collapses three states in priority order: the result outranks the
     hover, and the hover outranks resting. */
  const scale = won ? 1.09 : lost ? 0.88 : focused ? 1.05 : dimmed ? 0.94 : 1;

  return (
    /* Three nested transform layers, each owning one job so they compose rather
       than overwrite: the entrance deal, then the state (hover/result/idle
       float), then the pointer tilt. */
    <motion.div
      animate={{ opacity: 1, scale: 1, y: 0 }}
      className="h-full w-full"
      initial={reduceMotion ? false : { opacity: 0, scale: 0.88, y: 80 }}
      transition={{ type: "spring", stiffness: 130, damping: 20, delay: entranceDelay }}
    >
      <motion.div
        animate={
          reduceMotion
            ? { opacity: lost ? 0.45 : dimmed ? 0.6 : 1, scale: 1, y: 0 }
            : {
                opacity: lost ? 0.45 : dimmed ? 0.6 : 1,
                scale,
                /* Idle levitation, suspended once the result is in so the two
                   cards settle at their final heights. */
                y: outcome === "pending" ? [0, -14, 0] : won ? -20 : 10,
              }
        }
        className="relative h-full w-full [perspective:1400px]"
        transition={
          outcome === "pending" && !reduceMotion
            ? {
                default: { type: "spring", stiffness: 170, damping: 20 },
                y: { duration: 7, ease: "easeInOut", repeat: Infinity },
              }
            : { type: "spring", stiffness: 170, damping: 20 }
        }
      >
        <motion.div
          className="relative h-full w-full"
          style={{ rotateX, rotateY, transformStyle: "preserve-3d" }}
        >
          {/* Bloom of the icon's own color, pushed well behind the card so the
              tilt parallaxes it against the face. */}
          <motion.div
            animate={reduceMotion ? undefined : { opacity: won ? 1 : [0.55, 0.85, 0.55] }}
            aria-hidden="true"
            className="absolute -inset-12 rounded-[48px] blur-3xl"
            style={{
              background: `radial-gradient(60% 55% at 50% 45%, ${theme.glow} 0%, transparent 72%)`,
              transform: "translateZ(-110px)",
            }}
            transition={{ duration: 6, ease: "easeInOut", repeat: Infinity }}
          />

          {/* `isolate` is load-bearing: it pins the foil's blend group to the card
              face. Without it the blend reaches back into the 3D scene behind the
              card and dodges the artwork away entirely. */}
          <div
            className="relative isolate h-full w-full overflow-hidden rounded-[26px] border shadow-[0_50px_90px_-30px_rgba(0,0,0,0.92)] transition-[filter] duration-500"
            style={{
              borderColor: theme.edge,
              filter: lost ? "grayscale(0.8) brightness(0.7)" : "none",
            }}
          >
            <Image
              alt={`${icon.name} — ${icon.title}`}
              className="h-full w-full select-none object-cover"
              height={1280}
              priority
              sizes="(min-width: 1024px) 40vh, 60vh"
              src={icon.card}
              width={720}
            />

            {/* Foil pass. Wider than the card so the pointer can rake it fully
                off either edge without exposing a hard end. Faint at rest so the
                artwork reads; approaching the panel brings the foil up. */}
            <motion.span
              aria-hidden="true"
              className="pointer-events-none absolute -inset-x-1/2 inset-y-0 opacity-40 transition-opacity duration-500 group-hover:opacity-95"
              style={{
                backgroundImage: theme.sheen,
                mixBlendMode: theme.sheenBlend,
                x: sheenOffset,
              }}
            />

            {/* Bevel: a bright inner hairline plus a darkened bottom, which is
                what actually sells the card as having thickness. */}
            <span
              aria-hidden="true"
              className="pointer-events-none absolute inset-0 rounded-[26px]"
              style={{
                boxShadow: `inset 0 1px 0 rgba(255,255,255,0.32), inset 0 -22px 40px -28px rgba(0,0,0,0.95), inset 0 0 0 1px ${theme.edge}`,
              }}
            />
          </div>

          {/* Blurred, upside-down copy fading into the floor — the cheapest
              honest cue that the card is standing in a space. Flipping the image
              about its own center swaps its bottom edge to the top, so this
              window shows the card's foot mirrored directly beneath it. */}
          <div
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-full h-[12%] overflow-hidden opacity-20 blur-[6px]"
            style={{
              maskImage: "linear-gradient(to bottom, black 0%, transparent 88%)",
              WebkitMaskImage: "linear-gradient(to bottom, black 0%, transparent 88%)",
              transform: "translateZ(-40px)",
            }}
          >
            <Image
              alt=""
              className="block h-auto w-full -scale-y-100"
              height={1280}
              sizes="(min-width: 1024px) 40vh, 60vh"
              src={icon.card}
              width={720}
            />
          </div>
        </motion.div>
      </motion.div>
    </motion.div>
  );
}

export function iconVibe(vibe: TechIconVibe) {
  return ICON_VIBES[vibe];
}
