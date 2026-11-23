"use client";

import { useReducedMotion } from "motion/react";
import { useEffect, useState } from "react";

const TYPE_MS = 80;
const DELETE_MS = 45;
const HOLD_MS = 2500;
const GAP_MS = 300;

type Cursor = { index: number; length: number; deleting: boolean };

/* Cycles through `words` like a typewriter: hold the word, erase it letter by
   letter, type the next one, repeat. It starts with the first word fully typed,
   so the server render and the first client render match and there is no flash
   on load. Visitors who prefer reduced motion get the first word, still.

   The letters are decorative: it is aria-hidden, and the caller supplies the
   screen-reader text. */
export function TypewriterWord({ words }: { words: readonly string[] }) {
  const reduceMotion = useReducedMotion();
  const [cursor, setCursor] = useState<Cursor>({ index: 0, length: words[0].length, deleting: false });
  const word = words[cursor.index];
  const holding = !cursor.deleting && cursor.length === word.length;

  useEffect(() => {
    if (reduceMotion) return;

    const { deleting, length } = cursor;
    let delay: number;
    let next: Cursor;
    if (holding) {
      delay = HOLD_MS;
      next = { ...cursor, deleting: true };
    } else if (deleting && length === 0) {
      delay = GAP_MS;
      next = { index: (cursor.index + 1) % words.length, length: 0, deleting: false };
    } else {
      delay = deleting ? DELETE_MS : TYPE_MS;
      next = { ...cursor, length: length + (deleting ? -1 : 1) };
    }

    const id = window.setTimeout(() => setCursor(next), delay);
    return () => window.clearTimeout(id);
  }, [cursor, holding, reduceMotion, words.length]);

  const shown = reduceMotion ? words[0] : word.slice(0, cursor.length);

  return (
    <span aria-hidden="true">
      {shown}
      {/* The caret blinks while a word rests and stays solid while typing,
          like a real text cursor. Hidden by CSS (not JS) under reduced motion
          so it can't cause a hydration mismatch. */}
      <span
        className={`ml-px inline-block h-[1.05em] w-[2px] translate-y-[0.15em] bg-current motion-reduce:hidden ${
          holding ? "animate-caret-blink" : ""
        }`}
      />
    </span>
  );
}
