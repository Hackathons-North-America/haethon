"use client";

import { motion, useReducedMotion } from "motion/react";

import { filmGrainClassName } from "@/lib/tailwind";

/* Deterministic starfield for the night sky. Positions cluster in the upper
   half so stars read as sky, not confetti. */
const stars = [
  { top: "6%", left: "14%", size: 2, delay: 0, duration: 4.2, max: 0.9 },
  { top: "12%", left: "30%", size: 1.5, delay: 1.4, duration: 3.6, max: 0.7 },
  { top: "8%", left: "46%", size: 2.5, delay: 0.6, duration: 5, max: 1 },
  { top: "16%", left: "58%", size: 1.5, delay: 2.2, duration: 4.4, max: 0.65 },
  { top: "5%", left: "68%", size: 2, delay: 0.9, duration: 3.8, max: 0.85 },
  { top: "13%", left: "82%", size: 1.5, delay: 1.8, duration: 4.6, max: 0.7 },
  { top: "22%", left: "8%", size: 1.5, delay: 2.6, duration: 5.2, max: 0.6 },
  { top: "26%", left: "22%", size: 2, delay: 0.3, duration: 4, max: 0.8 },
  { top: "20%", left: "38%", size: 1.5, delay: 3.1, duration: 4.8, max: 0.55 },
  { top: "28%", left: "52%", size: 1.5, delay: 1.1, duration: 3.4, max: 0.7 },
  { top: "24%", left: "72%", size: 2.5, delay: 2, duration: 5.4, max: 0.95 },
  { top: "31%", left: "88%", size: 2, delay: 0.7, duration: 4.2, max: 0.8 },
  { top: "38%", left: "16%", size: 1.5, delay: 1.6, duration: 4.6, max: 0.6 },
  { top: "42%", left: "64%", size: 1.5, delay: 2.8, duration: 3.8, max: 0.65 },
  { top: "36%", left: "44%", size: 1.5, delay: 0.4, duration: 5, max: 0.5 },
  { top: "48%", left: "6%", size: 2, delay: 2.4, duration: 4.4, max: 0.7 },
  { top: "52%", left: "92%", size: 1.5, delay: 1.2, duration: 4, max: 0.6 },
  { top: "58%", left: "34%", size: 1.5, delay: 3.4, duration: 5.2, max: 0.5 },
] as const;

/* Meteors: each starts in the upper sky and flies along its own angle. Cycle
   lengths (duration + repeatDelay) are co-prime-ish so they never sync up and
   the shower stays unpredictable. The last one is the rare bright showpiece. */
const meteors = [
  {
    top: "9%",
    left: "12%",
    angle: 16,
    distance: 520,
    tail: 110,
    duration: 1.3,
    delay: 4,
    repeatDelay: 19,
    brightness: 0.85,
  },
  {
    top: "4%",
    left: "54%",
    angle: 26,
    distance: 400,
    tail: 75,
    duration: 1.05,
    delay: 11,
    repeatDelay: 23,
    brightness: 0.65,
  },
  {
    top: "16%",
    left: "28%",
    angle: 11,
    distance: 660,
    tail: 160,
    duration: 1.8,
    delay: 17.5,
    repeatDelay: 29,
    brightness: 1,
  },
] as const;

type Meteor = (typeof meteors)[number];

function ShootingStar({ meteor }: { meteor: Meteor }) {
  const { top, left, angle, distance, tail, duration, delay, repeatDelay, brightness } = meteor;
  /* The wrapper sets the flight angle; the inner span only ever translates
     along local x, so the whole meteor moves along that angle. */
  const cycle = { duration, delay, repeat: Infinity, repeatDelay } as const;

  return (
    <span
      data-meteor
      className="absolute block"
      style={{ top, left, transform: `rotate(${angle}deg)` }}
    >
      <motion.span
        className="relative block h-px w-px"
        initial={{ x: 0, opacity: 0 }}
        animate={{ x: distance, opacity: [0, brightness, brightness, 0] }}
        transition={{
          ...cycle,
          x: { ...cycle, ease: "linear" },
          opacity: { ...cycle, times: [0, 0.12, 0.68, 1] },
        }}
      >
        {/* Tail — stretches out of the head, then draws back in as it dies.
            Same clock as the flight, so the two stay in step forever. */}
        <motion.span
          className="absolute right-0 top-1/2 block origin-right -translate-y-1/2 rounded-full"
          initial={{ scaleX: 0.2 }}
          animate={{ scaleX: [0.2, 1, 1, 0.5] }}
          transition={{ ...cycle, times: [0, 0.25, 0.7, 1] }}
          style={{
            width: tail,
            height: 2,
            background:
              "linear-gradient(90deg, transparent, rgb(134 227 190 / 0.28) 45%, rgb(244 235 217 / 0.9))",
          }}
        />
        {/* White-hot head with a wheat core and a cool aurora halo. */}
        <span
          className="absolute right-0 top-1/2 block size-[3px] -translate-y-1/2 rounded-full"
          style={{
            background: "rgb(255 250 242)",
            boxShadow:
              "0 0 6px 2px rgb(244 235 217 / 0.55), 0 0 18px 6px rgb(134 227 190 / 0.22)",
          }}
        />
      </motion.span>
    </span>
  );
}

/* Vertical light shafts, blurred into soft aurora rays. Two different stripe
   periods so the layers shimmer against each other as they drift. */
const raysA =
  "repeating-linear-gradient(90deg, transparent 0px, transparent 22px, rgb(134 227 190 / 0.5) 32px, transparent 42px, transparent 78px, rgb(99 194 166 / 0.36) 90px, transparent 104px)";
const raysB =
  "repeating-linear-gradient(90deg, transparent 0px, transparent 38px, rgb(99 194 166 / 0.42) 50px, transparent 64px, transparent 108px, rgb(134 227 190 / 0.3) 118px, transparent 136px)";
/* Confines the shafts to the arc of the ribbon and feathers every edge. */
const rayMask =
  "radial-gradient(115% 80% at 50% 24%, black 30%, transparent 74%)";

/* The landing hero is locked to the night-sky look — no theme branching. */
export function HeroAurora() {
  const prefersReducedMotion = useReducedMotion();
  const still = prefersReducedMotion ?? false;

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Night base — deep blue-black overhead settling into the page tone. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "linear-gradient(180deg, #0a1220 0%, #0e151e 42%, #141414 80%)",
        }}
      />

      {/* Main aurora ribbon — one arc across the upper sky, green core with a
          teal tail that cools off toward violet before it fades. */}
      <motion.div
        className="absolute inset-x-[-14%] top-[-6%] h-[48%] rotate-[-7deg]"
        animate={
          still
            ? undefined
            : {
                x: ["0%", "1.5%", "-1%", "0%"],
                y: ["0%", "2.5%", "-1.5%", "0%"],
                opacity: [0.85, 1, 0.9, 0.85],
              }
        }
        transition={
          still
            ? undefined
            : { duration: 18, repeat: Infinity, ease: "easeInOut" }
        }
        style={{
          background:
            "linear-gradient(103deg, transparent 4%, rgb(88 156 142 / 0.3) 22%, rgb(99 194 166 / 0.42) 40%, rgb(134 227 190 / 0.4) 52%, rgb(88 156 142 / 0.3) 66%, rgb(150 110 180 / 0.2) 80%, transparent 94%)",
          filter: "blur(36px)",
        }}
      />

      {/* Aurora rays — vertical shafts of light drifting through the ribbon.
          The two layers move against each other so the curtain shimmers. */}
      <motion.div
        className="absolute inset-x-[-12%] top-[-8%] h-[56%] rotate-[-7deg]"
        animate={
          still ? undefined : { x: ["0%", "2%", "-1.5%", "0%"], opacity: [0.55, 0.8, 0.6, 0.55] }
        }
        transition={
          still
            ? undefined
            : { duration: 16, repeat: Infinity, ease: "easeInOut" }
        }
        style={{
          background: raysA,
          filter: "blur(10px)",
          maskImage: rayMask,
          WebkitMaskImage: rayMask,
          opacity: still ? 0.6 : undefined,
        }}
      />
      <motion.div
        className="absolute inset-x-[-12%] top-[-8%] h-[56%] rotate-[-7deg]"
        animate={
          still ? undefined : { x: ["0%", "-2%", "1.5%", "0%"], opacity: [0.4, 0.65, 0.45, 0.4] }
        }
        transition={
          still
            ? undefined
            : { duration: 21, repeat: Infinity, ease: "easeInOut", delay: 2 }
        }
        style={{
          background: raysB,
          filter: "blur(12px)",
          maskImage: rayMask,
          WebkitMaskImage: rayMask,
          opacity: still ? 0.45 : undefined,
        }}
      />

      {/* Violet under-fringe — the magenta lower border real aurora carries. */}
      <motion.div
        className="absolute inset-x-[-8%] top-[26%] h-[16%] rotate-[-7deg]"
        animate={still ? undefined : { opacity: [0.5, 0.8, 0.55, 0.5] }}
        transition={
          still
            ? undefined
            : { duration: 13, repeat: Infinity, ease: "easeInOut", delay: 1 }
        }
        style={{
          background:
            "linear-gradient(180deg, rgb(168 120 190 / 0.2) 0%, rgb(114 28 36 / 0.1) 45%, transparent 85%)",
          filter: "blur(32px)",
          opacity: still ? 0.6 : undefined,
        }}
      />

      {/* Faint teal pool low on the left so the sky has depth below the arc. */}
      <div
        className="absolute -left-[10%] top-[34%] h-[50%] w-[48%]"
        style={{
          background:
            "radial-gradient(ellipse 55% 45% at 35% 40%, rgb(70 130 120 / 0.22), transparent 68%)",
          filter: "blur(44px)",
        }}
      />

      {/* Night sky. */}
      {stars.map((star, i) => (
        <motion.span
          key={i}
          animate={
            still
              ? undefined
              : { opacity: [0.2, star.max, 0.2], scale: [0.85, 1.2, 0.85] }
          }
          className="absolute rounded-full bg-wheat"
          initial={false}
          transition={{
            delay: star.delay,
            duration: star.duration,
            ease: "easeInOut",
            repeat: Infinity,
          }}
          style={{
            top: star.top,
            left: star.left,
            width: star.size,
            height: star.size,
            boxShadow:
              star.size >= 2
                ? "0 0 6px 1px rgb(244 235 217 / 0.35)"
                : undefined,
          }}
        />
      ))}

      {/* Shooting stars — every so often one crosses the sky. Blink and you
          miss it; watch long enough and the bright one rewards you. */}
      {still
        ? null
        : meteors.map((meteor) => (
            <ShootingStar key={`${meteor.top}-${meteor.left}`} meteor={meteor} />
          ))}

      {/* Readability halo — quietly lifts the copy off the atmosphere. */}
      <div
        className="absolute inset-0"
        style={{
          background:
            "radial-gradient(52% 42% at 50% 38%, rgb(16 19 22 / 0.55), transparent 72%)",
        }}
      />

      {/* Film grain — keeps the gradients tactile, never smooth-plastic. */}
      <div className={`${filmGrainClassName} absolute inset-0 opacity-[0.08] mix-blend-overlay`} />

      {/* Settle into the page before the map section. */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-[#141414]" />
    </div>
  );
}
