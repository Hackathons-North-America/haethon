"use client";

import { motion, useReducedMotion } from "motion/react";

import { useTheme } from "@/components/providers/theme-provider";

/* Deterministic starfield for the dark-mode night sky. Positions cluster in
   the upper half so stars read as sky, not confetti. */
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

export function HeroAurora() {
  const prefersReducedMotion = useReducedMotion();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div
      aria-hidden="true"
      className="pointer-events-none absolute inset-0 overflow-hidden"
    >
      {/* Base wash — deep night sky in dark, warm paper in light. */}
      <div
        className="absolute inset-0"
        style={{
          background: isDark
            ? "radial-gradient(120% 85% at 50% 0%, rgb(16 23 34 / 0.85) 0%, transparent 72%)"
            : "radial-gradient(115% 75% at 50% 0%, rgb(244 235 217 / 0.5) 0%, transparent 68%)",
        }}
      />

      {/* Main aurora cluster, biased to the upper right. */}
      <motion.div
        className={`absolute -right-[8%] top-[-10%] h-[120%] w-[78%] ${isDark ? "opacity-90" : "opacity-70"}`}
        animate={
          prefersReducedMotion
            ? undefined
            : { x: ["0%", "2%", "-1%", "0%"], scale: [1, 1.03, 0.99, 1] }
        }
        transition={
          prefersReducedMotion
            ? undefined
            : { duration: 16, repeat: Infinity, ease: "easeInOut" }
        }
        style={{
          background: isDark
            ? "radial-gradient(ellipse 60% 50% at 70% 40%, rgb(45 74 34 / 0.55), transparent 68%), radial-gradient(ellipse 50% 45% at 88% 55%, rgb(70 120 110 / 0.35), transparent 65%), radial-gradient(ellipse 45% 40% at 55% 30%, rgb(114 28 36 / 0.32), transparent 70%), radial-gradient(ellipse 40% 35% at 80% 20%, rgb(179 84 30 / 0.22), transparent 65%), radial-gradient(ellipse 35% 30% at 40% 70%, rgb(29 42 68 / 0.4), transparent 60%)"
            : "radial-gradient(ellipse 60% 50% at 70% 40%, rgb(45 74 34 / 0.18), transparent 68%), radial-gradient(ellipse 50% 45% at 88% 55%, rgb(70 120 110 / 0.14), transparent 65%), radial-gradient(ellipse 45% 40% at 55% 30%, rgb(114 28 36 / 0.12), transparent 70%), radial-gradient(ellipse 40% 35% at 80% 20%, rgb(179 84 30 / 0.1), transparent 65%), radial-gradient(ellipse 35% 30% at 40% 70%, rgb(29 42 68 / 0.1), transparent 60%)",
          filter: "blur(40px)",
        }}
      />

      {/* Counter-glow on the upper left so the composition doesn't lean. */}
      <motion.div
        className={`absolute -left-[12%] top-[-8%] h-[90%] w-[55%] ${isDark ? "opacity-70" : "opacity-60"}`}
        animate={
          prefersReducedMotion
            ? undefined
            : { x: ["0%", "-2%", "1%", "0%"], scale: [1, 1.04, 0.98, 1] }
        }
        transition={
          prefersReducedMotion
            ? undefined
            : { duration: 19, repeat: Infinity, ease: "easeInOut", delay: 2 }
        }
        style={{
          background: isDark
            ? "radial-gradient(ellipse 55% 45% at 30% 35%, rgb(70 120 110 / 0.3), transparent 66%), radial-gradient(ellipse 45% 40% at 15% 60%, rgb(45 74 34 / 0.35), transparent 68%), radial-gradient(ellipse 38% 32% at 42% 22%, rgb(29 42 68 / 0.42), transparent 62%)"
            : "radial-gradient(ellipse 55% 45% at 30% 35%, rgb(70 120 110 / 0.12), transparent 66%), radial-gradient(ellipse 45% 40% at 15% 60%, rgb(45 74 34 / 0.12), transparent 68%), radial-gradient(ellipse 38% 32% at 42% 22%, rgb(29 42 68 / 0.08), transparent 62%)",
          filter: "blur(44px)",
        }}
      />

      {/* Slow conic swirl — the sky "turning". */}
      <motion.div
        className={`absolute right-0 top-[5%] h-[90%] w-[58%] ${isDark ? "opacity-75" : "opacity-55"}`}
        animate={
          prefersReducedMotion
            ? undefined
            : {
                rotate: [0, 3, -2, 0],
                opacity: isDark ? [0.55, 0.8, 0.6, 0.55] : [0.35, 0.55, 0.4, 0.35],
              }
        }
        transition={
          prefersReducedMotion
            ? undefined
            : { duration: 14, repeat: Infinity, ease: "easeInOut" }
        }
        style={{
          background:
            "conic-gradient(from 200deg at 72% 42%, transparent 0deg, rgb(45 74 34 / 0.32) 50deg, rgb(90 140 130 / 0.22) 110deg, rgb(29 42 68 / 0.28) 170deg, rgb(114 28 36 / 0.14) 230deg, transparent 290deg)",
          filter: "blur(52px)",
        }}
      />

      {/* Aurora curtains — tall skewed bands that breathe vertically. */}
      <motion.div
        className={`absolute left-[16%] top-[-12%] h-[68%] w-[13%] -skew-x-12 ${isDark ? "opacity-60" : "opacity-40"}`}
        animate={
          prefersReducedMotion
            ? undefined
            : {
                y: ["0%", "6%", "-3%", "0%"],
                opacity: isDark ? [0.4, 0.65, 0.45, 0.4] : [0.25, 0.42, 0.3, 0.25],
              }
        }
        transition={
          prefersReducedMotion
            ? undefined
            : { duration: 11, repeat: Infinity, ease: "easeInOut", delay: 1 }
        }
        style={{
          background: isDark
            ? "linear-gradient(180deg, rgb(70 120 110 / 0.45) 0%, rgb(45 74 34 / 0.3) 45%, transparent 90%)"
            : "linear-gradient(180deg, rgb(70 120 110 / 0.2) 0%, rgb(45 74 34 / 0.12) 45%, transparent 90%)",
          filter: "blur(38px)",
        }}
      />
      <motion.div
        className={`absolute right-[24%] top-[-10%] h-[62%] w-[11%] skew-x-12 ${isDark ? "opacity-55" : "opacity-35"}`}
        animate={
          prefersReducedMotion
            ? undefined
            : {
                y: ["0%", "-5%", "4%", "0%"],
                opacity: isDark ? [0.35, 0.6, 0.4, 0.35] : [0.2, 0.38, 0.26, 0.2],
              }
        }
        transition={
          prefersReducedMotion
            ? undefined
            : { duration: 13, repeat: Infinity, ease: "easeInOut", delay: 3.5 }
        }
        style={{
          background: isDark
            ? "linear-gradient(180deg, rgb(114 28 36 / 0.32) 0%, rgb(70 120 110 / 0.28) 50%, transparent 88%)"
            : "linear-gradient(180deg, rgb(114 28 36 / 0.12) 0%, rgb(70 120 110 / 0.12) 50%, transparent 88%)",
          filter: "blur(42px)",
        }}
      />

      {/* Night sky — stars only come out in the dark. */}
      {isDark
        ? stars.map((star, i) => (
            <span
              key={i}
              className="hero-star absolute rounded-full bg-wheat"
              style={{
                top: star.top,
                left: star.left,
                width: star.size,
                height: star.size,
                boxShadow:
                  star.size >= 2
                    ? "0 0 6px 1px rgb(244 235 217 / 0.35)"
                    : undefined,
                ["--star-delay" as string]: `${star.delay}s`,
                ["--star-duration" as string]: `${star.duration}s`,
                ["--star-max" as string]: star.max,
              }}
            />
          ))
        : null}

      {/* Readability halo — quietly lifts the copy off the atmosphere. */}
      <div
        className="absolute inset-0"
        style={{
          background: isDark
            ? "radial-gradient(52% 42% at 50% 38%, rgb(20 20 20 / 0.5), transparent 72%)"
            : "radial-gradient(52% 42% at 50% 38%, rgb(255 255 255 / 0.6), transparent 72%)",
        }}
      />

      {/* Film grain — keeps the gradients tactile, never smooth-plastic. */}
      <div className="hero-grain absolute inset-0 opacity-[0.05] mix-blend-overlay dark:opacity-[0.08]" />

      {/* Settle into the page before the map section. */}
      <div className="absolute inset-x-0 bottom-0 h-40 bg-gradient-to-b from-transparent to-page" />
    </div>
  );
}
