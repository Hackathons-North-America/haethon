"use client";

import { useEffect, useState } from "react";

const phrases = [
  "never miss another application deadline.",
  "know when a hackathon is happening nearby.",
  "get notified when applications open.",
  "connect with teammates before the event.",
];

type TypewriterPhase = "waiting" | "deleting" | "typing";

const deleteSpeedMs = 34;
const typeSpeedMs = 46;
const holdMs = 1600;
const emptyHoldMs = 220;

type HeroTypewriterSpanProps = {
  className?: string;
};

export function HeroTypewriterSpan({
  className = "text-cabernet",
}: HeroTypewriterSpanProps) {
  const [phraseIndex, setPhraseIndex] = useState(0);
  const [phase, setPhase] = useState<TypewriterPhase>("waiting");
  const [text, setText] = useState(phrases[0]);

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      return;
    }

    const delay =
      phase === "waiting"
        ? holdMs
        : phase === "deleting" && text.length === 0
          ? emptyHoldMs
          : phase === "deleting"
            ? deleteSpeedMs
            : typeSpeedMs;

    const timeout = window.setTimeout(
      () => {
        if (phase === "waiting") {
          setPhase("deleting");
          return;
        }

        if (phase === "deleting") {
          if (text.length > 0) {
            setText((currentText) => currentText.slice(0, -1));
            return;
          }

          setPhraseIndex((currentIndex) => (currentIndex + 1) % phrases.length);
          setPhase("typing");
          return;
        }

        const phrase = phrases[phraseIndex];

        if (text.length < phrase.length) {
          setText(phrase.slice(0, text.length + 1));
          return;
        }

        setPhase("waiting");
      },
      delay
    );

    return () => window.clearTimeout(timeout);
  }, [phase, phraseIndex, text]);

  return (
    <>
      <span className="sr-only">{phrases[0]}</span>
      <span
        aria-hidden="true"
        className={`inline ${className}`}
      >
        <span data-hero-typewriter-text>{text || "\u00A0"}</span>
        <span className="ml-1 inline-block h-[0.86em] w-[0.075em] translate-y-[0.08em] bg-current motion-safe:animate-pulse" />
      </span>
    </>
  );
}
