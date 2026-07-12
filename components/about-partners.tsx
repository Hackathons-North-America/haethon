"use client";

import { useEffect, useRef, useState } from "react";

// Reveal order top-to-bottom; even indices sit in the left column, odd in the
// right, so scrolling fills both sides in an alternating cadence.
const partners = [
  "Google",
  "1Password",
  "GitHub",
  "Orkes",
  "Microsoft",
  "PCBWay",
  "Amazon",
  "Spur Innovations",
  "Stan",
  "Tailscale",
  "Cloudinary",
] as const;

// The logos fade in one after another across this slice of scroll progress.
const REVEAL_START = 0.06;
const REVEAL_END = 0.8;
const REVEAL_FADE = 0.1;

const entries = partners.map((name, index) => ({ name, index }));
const leftColumn = entries.filter((entry) => entry.index % 2 === 0);
const rightColumn = entries.filter((entry) => entry.index % 2 === 1);

function revealAt(index: number) {
  return (
    REVEAL_START + (index / (partners.length - 1)) * (REVEAL_END - REVEAL_START)
  );
}

export function AboutPartners() {
  const [progress, setProgress] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let frame = 0;

    const updateProgress = () => {
      frame = 0;
      const wrapper = wrapperRef.current;

      if (!wrapper) {
        return;
      }

      const rect = wrapper.getBoundingClientRect();
      const scrollable = rect.height - window.innerHeight;

      if (scrollable <= 0) {
        return;
      }

      const next = Math.min(Math.max(-rect.top / scrollable, 0), 1);
      const rounded = Math.round(next * 100) / 100;

      setProgress((current) => (current === rounded ? current : rounded));
    };

    const requestUpdate = () => {
      if (!frame) {
        frame = requestAnimationFrame(updateProgress);
      }
    };

    updateProgress();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

  const renderPartner = ({ name, index }: { name: string; index: number }) => {
    const opacity = Math.min(
      Math.max((progress - revealAt(index)) / REVEAL_FADE, 0),
      1
    );

    return (
      <li
        className="font-serif text-3xl font-semibold leading-none tracking-tight text-navy transition-none sm:text-4xl lg:text-5xl dark:text-wheat"
        key={name}
        style={{
          opacity,
          transform: `translateY(${(1 - opacity) * 18}px)`,
        }}
      >
        {name}
      </li>
    );
  };

  return (
    <section
      aria-labelledby="about-partners-heading"
      className="px-5 sm:px-8 lg:px-12"
    >
      <div
        className="relative"
        ref={wrapperRef}
        style={{ height: "220vh" }}
      >
        <div className="sticky top-0 flex h-screen items-center overflow-hidden">
          <div className="mx-auto grid w-full max-w-[1300px] grid-cols-1 items-center gap-y-12 lg:grid-cols-[1fr_auto_1fr] lg:gap-x-20">
            <ul className="order-2 flex flex-col items-center gap-6 lg:order-1 lg:items-end lg:gap-8 lg:text-right">
              {leftColumn.map(renderPartner)}
            </ul>

            <div className="order-1 text-center lg:order-2">
              <h2
                className="font-serif text-6xl font-semibold leading-none tracking-tight text-navy lg:text-7xl dark:text-wheat"
                id="about-partners-heading"
              >
                Partners
              </h2>
              <p className="mt-5 font-serif text-lg italic text-navy/60 dark:text-wheat/60">
                and the teams building alongside us
              </p>
            </div>

            <ul className="order-3 flex flex-col items-center gap-6 lg:items-start lg:gap-8 lg:text-left">
              {rightColumn.map(renderPartner)}
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
