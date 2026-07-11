"use client";

import { motion, useReducedMotion } from "motion/react";

import { useTheme } from "@/components/providers/theme-provider";

export function HeroAurora() {
  const prefersReducedMotion = useReducedMotion();
  const { theme } = useTheme();
  const isDark = theme === "dark";

  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-0 overflow-hidden">
      <motion.div
        className={`absolute -right-[8%] top-[-10%] h-[120%] w-[70%] ${isDark ? "opacity-90" : "opacity-70"}`}
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
      <motion.div
        className={`absolute right-0 top-[5%] h-[90%] w-[58%] ${isDark ? "opacity-75" : "opacity-55"}`}
        animate={
          prefersReducedMotion
            ? undefined
            : { rotate: [0, 3, -2, 0], opacity: isDark ? [0.55, 0.8, 0.6, 0.55] : [0.35, 0.55, 0.4, 0.35] }
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
    </div>
  );
}
