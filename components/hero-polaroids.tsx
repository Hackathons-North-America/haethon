"use client";

import {
  motion,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
  type MotionValue,
} from "motion/react";
import { useEffect } from "react";

import { heroPolaroids, PolaroidFrame } from "@/components/polaroid-frame";

type HeroShot = (typeof heroPolaroids)[number];

/* Per-frame parallax depth and entrance over-rotation. Varied so the piles
   drift at different rates and settle like photos tossed on a table. */
const depths = [0.9, 0.5, 1.1, 0.6, 0.8, 0.55, 1, 0.7, 0.45, 0.85];
const tossRotations = [-7, 6, -5, 8, -6, 7, -8, 5, -6, 9];

type ParallaxFrameProps = {
  shot: HeroShot;
  index: number;
  pointerX: MotionValue<number>;
  pointerY: MotionValue<number>;
  still: boolean;
};

function ParallaxFrame({
  shot,
  index,
  pointerX,
  pointerY,
  still,
}: ParallaxFrameProps) {
  const depth = depths[index % depths.length];
  const x = useTransform(pointerX, (value) => value * depth * 30);
  const y = useTransform(pointerY, (value) => value * depth * 22);

  return (
    /* The shot's className carries position, size, breakpoints, and the base
       rotation — it lives on the wrapper so motion's transform (parallax x/y,
       toss-in rotate) composes with it instead of overwriting it. */
    <div className={`polaroid-wrap ${shot.className}`}>
      <motion.div
        style={still ? undefined : { x, y }}
        initial={
          still
            ? false
            : {
                opacity: 0,
                y: -44,
                scale: 1.12,
                rotate: tossRotations[index % tossRotations.length],
              }
        }
        animate={{ opacity: 1, y: 0, scale: 1, rotate: 0 }}
        transition={{
          delay: 0.35 + index * 0.08,
          type: "spring",
          stiffness: 68,
          damping: 13,
          mass: 0.9,
        }}
      >
        <PolaroidFrame
          src={shot.src}
          alt={shot.alt}
          caption={shot.caption}
          className="w-full"
          width={shot.width}
          height={shot.height}
          sticker={shot.sticker}
          lift={shot.lift}
          tape={shot.tape}
        />
      </motion.div>
    </div>
  );
}

export function HeroPolaroids() {
  const prefersReducedMotion = useReducedMotion();
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const smoothX = useSpring(pointerX, { stiffness: 55, damping: 18, mass: 0.7 });
  const smoothY = useSpring(pointerY, { stiffness: 55, damping: 18, mass: 0.7 });

  useEffect(() => {
    if (prefersReducedMotion) {
      return;
    }

    const onPointerMove = (event: PointerEvent) => {
      pointerX.set(event.clientX / window.innerWidth - 0.5);
      pointerY.set(event.clientY / window.innerHeight - 0.5);
    };

    window.addEventListener("pointermove", onPointerMove);
    return () => window.removeEventListener("pointermove", onPointerMove);
  }, [pointerX, pointerY, prefersReducedMotion]);

  return (
    <>
      {heroPolaroids.map((shot, index) => (
        <ParallaxFrame
          key={shot.src}
          shot={shot}
          index={index}
          pointerX={smoothX}
          pointerY={smoothY}
          still={prefersReducedMotion ?? false}
        />
      ))}
    </>
  );
}
