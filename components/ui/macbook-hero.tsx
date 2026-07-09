"use client";

import { useRef, type CSSProperties, type ReactNode } from "react";
import {
  motion,
  useReducedMotion,
  useScroll,
  useTransform,
} from "motion/react";

// Pose of the machine: the lid starts slightly reclined and settles almost
// parallel to the viewer's screen, while the base hangs back so the hinge
// stays around 105deg — the keyboard is visible but heavily foreshortened.
const SCROLL_RANGE: [number, number] = [0, 420];
const LID_TILT: [number, number] = [15, 2];
const DECK_TILT: [number, number] = [-85, -73];

type KeyDef = {
  main: string;
  top?: string;
  grow?: number;
  align?: "bl" | "br";
};

const letters = (chars: string): KeyDef[] =>
  chars.split("").map((main) => ({ main }));

const fnRow: KeyDef[] = [
  { main: "esc", grow: 1.4, align: "bl" },
  ...Array.from({ length: 12 }, (_, i) => ({ main: `F${i + 1}` })),
  { main: "" },
];

const numberRow: KeyDef[] = [
  { main: "`", top: "~" },
  { main: "1", top: "!" },
  { main: "2", top: "@" },
  { main: "3", top: "#" },
  { main: "4", top: "$" },
  { main: "5", top: "%" },
  { main: "6", top: "^" },
  { main: "7", top: "&" },
  { main: "8", top: "*" },
  { main: "9", top: "(" },
  { main: "0", top: ")" },
  { main: "-", top: "_" },
  { main: "=", top: "+" },
  { main: "delete", grow: 1.5, align: "br" },
];

const tabRow: KeyDef[] = [
  { main: "tab", grow: 1.5, align: "bl" },
  ...letters("QWERTYUIOP"),
  { main: "[", top: "{" },
  { main: "]", top: "}" },
  { main: "\\", top: "|" },
];

// The deck is cut off right below this row — nothing past ASDF gets drawn.
const homeRow: KeyDef[] = [
  { main: "caps lock", grow: 1.75, align: "bl" },
  ...letters("ASDFGHJKL"),
  { main: ";", top: ":" },
  { main: "'", top: "\"" },
  { main: "return", grow: 1.75, align: "br" },
];

function KeyCap({ def, short = false }: { def: KeyDef; short?: boolean }) {
  const alignment =
    def.align === "bl"
      ? "items-end justify-start pl-1 pb-0.5"
      : def.align === "br"
        ? "items-end justify-end pr-1 pb-0.5"
        : "items-center justify-center";

  return (
    <div
      style={{ flexGrow: def.grow ?? 1, flexBasis: 0 }}
      className={`flex ${short ? "h-4" : "h-7"} ${alignment} rounded-[4px] bg-[#0f0f13] text-[6px] font-medium leading-[1.15] text-neutral-400 shadow-[inset_0_-0.5px_1px_rgba(255,255,255,0.08),inset_0_1px_2px_rgba(0,0,0,0.7)]`}
    >
      {def.top ? (
        <span className="flex flex-col items-center">
          <span className="text-neutral-500">{def.top}</span>
          <span>{def.main}</span>
        </span>
      ) : (
        def.main
      )}
    </div>
  );
}

function KeyRow({ keys, short = false }: { keys: KeyDef[]; short?: boolean }) {
  return (
    <div className="flex w-full gap-[2px]">
      {keys.map((def, i) => (
        <KeyCap key={`${def.main}-${i}`} def={def} short={short} />
      ))}
    </div>
  );
}

const speakerGridStyle: CSSProperties = {
  backgroundImage:
    "radial-gradient(circle, rgba(255,255,255,0.13) 0.5px, transparent 0.5px)",
  backgroundSize: "4px 4px",
};

function DefaultScreen() {
  return (
    <div className="relative flex h-full w-full flex-col items-center justify-center overflow-hidden bg-[#0b0b0b] text-center">
      <div
        aria-hidden="true"
        className="absolute inset-x-0 bottom-[-40%] h-[80%] rounded-[100%] bg-[#660000]/35 blur-3xl"
      />
      <p className="relative font-serif text-xl font-semibold text-[#f7f3ea] sm:text-3xl">
        Hackathons North America
      </p>
      <p className="relative mt-3 font-mono text-[8px] font-medium uppercase tracking-[0.2em] text-[#f7f3ea]/55 sm:text-[10px]">
        hundreds of hackathons &middot; one profile
      </p>
    </div>
  );
}

export function MacbookHero({ children }: { children?: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const prefersReducedMotion = useReducedMotion();

  const { scrollY } = useScroll();
  const lidTilt = useTransform(scrollY, SCROLL_RANGE, LID_TILT);
  const deckTilt = useTransform(scrollY, SCROLL_RANGE, DECK_TILT);
  // The deck's projected height grows as it opens, so the shadow tracks its
  // bottom edge instead of sitting at a fixed offset.
  const shadowY = useTransform(scrollY, SCROLL_RANGE, [-26, 0]);
  const shadowOpacity = useTransform(scrollY, SCROLL_RANGE, [0.55, 1]);

  return (
    <div
      ref={ref}
      className="relative mx-auto w-[21.5rem] max-w-full sm:w-[30rem] lg:w-[36rem]"
    >
      {/* Lid */}
      <motion.div
        style={{
          rotateX: prefersReducedMotion ? LID_TILT[1] : lidTilt,
          transformPerspective: 1800,
        }}
        className="relative z-10 origin-bottom rounded-t-[1.15rem] rounded-b-md border border-[#2a2a2e] bg-[#050507] p-2 shadow-[0_40px_90px_-24px_rgba(0,0,0,0.55)] sm:p-2.5"
      >
        <div
          aria-hidden="true"
          className="absolute left-1/2 top-[5px] size-1 -translate-x-1/2 rounded-full bg-[#1e1e23]"
        />
        <div className="relative aspect-[16/10] w-full overflow-hidden rounded-lg bg-[#101014]">
          {children ?? <DefaultScreen />}
        </div>
      </motion.div>

      {/* Base — rotated back around the hinge; layout height is kept short
          because the rotation collapses most of its projected height. */}
      <div className="relative h-9">
        <motion.div
          style={{
            rotateX: prefersReducedMotion ? DECK_TILT[1] : deckTilt,
            transformPerspective: 1800,
          }}
          className="absolute inset-x-0 top-0 origin-top border-x border-[#2a2a2e] bg-[#1c1c20] px-2 pt-1"
        >
          <div className="mx-auto mb-1 h-1.5 w-[38%] rounded-b-md bg-[#0a0a0c]" />
          <div className="flex gap-1 pb-[3px]">
            <div
              aria-hidden="true"
              className="w-[7%] rounded-md bg-[#0e0e11]"
              style={speakerGridStyle}
            />
            <div className="flex flex-1 flex-col gap-[2px] rounded-md bg-[#0a0a0d] p-1">
              <KeyRow keys={fnRow} short />
              <KeyRow keys={numberRow} />
              <KeyRow keys={tabRow} />
              <KeyRow keys={homeRow} />
            </div>
            <div
              aria-hidden="true"
              className="w-[7%] rounded-md bg-[#0e0e11]"
              style={speakerGridStyle}
            />
          </div>
        </motion.div>
      </div>

      {/* Gradient shadow falling away below the cutoff line */}
      <motion.div
        aria-hidden="true"
        style={
          prefersReducedMotion ? undefined : { y: shadowY, opacity: shadowOpacity }
        }
        className="pointer-events-none relative left-1/2 h-24 w-[110%] -translate-x-1/2"
      >
        <div className="absolute inset-0 bg-gradient-to-b from-black/45 via-black/15 to-transparent blur-[2px] [mask-image:linear-gradient(to_right,transparent,black_16%,black_84%,transparent)]" />
      </motion.div>
    </div>
  );
}
