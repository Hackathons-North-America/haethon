"use client";

import { ChevronDown } from "lucide-react";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";

type CompanyImage = {
  src: string;
  alt: string;
  // Intrinsic pixel size, so the stacked image reserves its true aspect-ratio
  // space (fills the window width, natural height) before the file loads.
  width: number;
  height: number;
};

type Company = {
  id: string;
  name: string;
  heading: string;
  description: string;
  // Optional photos, rendered by count:
  //   3 photos -> "trio": [0] fills the tall portrait slot on the left, [1]
  //     and [2] stack as landscape shots on the right.
  //   4 photos -> "grid": a 2x2 grid of landscape shots.
  images?: readonly CompanyImage[];
  // "browser" replaces the photo area with a single browser-window card.
  showcase?: "browser";
};

const companies: readonly Company[] = [
  {
    id: "hack-canada",
    name: "HC25",
    heading: "Canada's flagship student hackathon.",
    description:
      "A weekend where hundreds of builders ship real projects, backed by mentors, hardware, and a community that keeps going long after the closing ceremony.",
    images: [
      {
        src: "/photos/hc25-hallway.webp",
        alt: "Hackers lining the hallway between sessions at HC25.",
        width: 1440,
        height: 2160,
      },
      {
        src: "/photos/hc25-collab.webp",
        alt: "Three hackers laughing around a laptop at HC25.",
        width: 2326,
        height: 1548,
      },
      {
        src: "/photos/hc25-crowd.webp",
        alt: "A packed room of hackers during an HC25 ceremony.",
        width: 2160,
        height: 1440,
      },
    ],
  },
  {
    id: "hackathons-north-america",
    name: "HNA",
    heading: "Every hackathon on the continent, in one place.",
    description:
      "HNA maps hackathons across North America so hackers can find, track, and commit to their next build without digging through scattered forms and Discord servers.",
    showcase: "browser",
  },
  {
    id: "corporate",
    name: "Corporate",
    heading: "A direct line to the people who build.",
    description:
      "We help companies reach hackers through events, challenges, and recruiting. It's sponsorship that lands in the room instead of a logo on a banner.",
    images: [
      {
        src: "/photos/corporate-catering.webp",
        alt: "A hacker serving themselves from a spread of catered sushi.",
        width: 2586,
        height: 1724,
      },
      {
        src: "/photos/corporate-celebration.webp",
        alt: "Two hackers cheering during a sponsor prize reveal.",
        width: 2586,
        height: 1724,
      },
      {
        src: "/photos/corporate-conversation.webp",
        alt: "Two hackers chatting during a networking break.",
        width: 2586,
        height: 1724,
      },
      {
        src: "/photos/corporate-group.webp",
        alt: "The full crowd posing with oversized prize cheques.",
        width: 2586,
        height: 1724,
      },
    ],
  },
];

// Height of a single name row in the centered scrolling list.
const NAME_ROW = "8rem";

// Left column: a tech-style text block (large heading + short description)
// that crossfades to match the active section.
function TechPanel({ activeIndex }: { activeIndex: number }) {
  return (
    <div className="relative min-h-[22rem] lg:min-h-[30rem]">
      {companies.map((company, index) => {
        const isActive = index === activeIndex;

        return (
          <div
            className={`absolute inset-0 flex flex-col justify-center transition-[opacity,transform,visibility] duration-[600ms] ease-out motion-reduce:transition-none ${
              isActive
                ? "visible translate-y-0 opacity-100"
                : "invisible translate-y-2 opacity-0"
            }`}
            key={company.id}
          >
            <p className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.16em] text-pine">
              {company.name}
            </p>
            <h3 className="mt-4 font-serif text-3xl font-semibold leading-[1.05] tracking-tight text-ink sm:text-4xl lg:text-5xl dark:text-paper">
              {company.heading}
            </h3>
            <p className="mt-5 max-w-[420px] text-sm leading-6 text-ink/60 sm:text-base sm:leading-7 dark:text-paper/60">
              {company.description}
            </p>
          </div>
        );
      })}
    </div>
  );
}

// A single full-width photo in the scrolling stack. The image fills the window
// width; its intrinsic width/height keep the natural aspect ratio (no crop, no
// squish) and reserve the correct height before the file loads.
function StripImage({ image }: { image: CompanyImage }) {
  return (
    <Image
      alt={image.alt}
      className="h-auto w-full rounded-2xl border border-ink/10 dark:border-paper/10"
      height={image.height}
      sizes="(max-width: 1024px) 90vw, 24vw"
      src={image.src}
      width={image.width}
    />
  );
}

// A single card styled like a browser window, filling the whole photo area.
// Used for the HNA section — the product the visitor is already looking at.
function BrowserShowcase() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden rounded-2xl border border-ink/10 bg-white shadow-[0_20px_50px_-30px_rgba(20,24,40,0.55)] dark:border-paper/10 dark:bg-ink">
      {/* Browser chrome: traffic-light dots + address bar */}
      <div className="flex items-center gap-2 border-b border-ink/10 bg-ink/[0.04] px-4 py-3 dark:border-paper/10 dark:bg-paper/[0.06]">
        <span className="size-3 rounded-full bg-[#ff5f57]" />
        <span className="size-3 rounded-full bg-[#febc2e]" />
        <span className="size-3 rounded-full bg-[#28c840]" />
        <div className="ml-3 flex-1 truncate rounded-md bg-ink/[0.06] px-3 py-1 text-center font-mono text-[0.7rem] text-ink/50 dark:bg-paper/[0.08] dark:text-paper/50">
          hna.dev
        </div>
      </div>

      {/* Page body */}
      <div className="flex flex-1 items-center justify-center px-6 py-8">
        <p className="text-center font-serif text-2xl font-medium leading-tight tracking-tight text-ink sm:text-3xl lg:text-4xl dark:text-paper">
          You are on it right now.
        </p>
      </div>
    </div>
  );
}

// Placeholder fallback for sections without photos or a browser card yet.
function PlaceholderPanel({ label }: { label: string }) {
  return (
    <div className="flex h-full w-full flex-col items-center justify-center gap-1 rounded-2xl border border-ink/10 bg-ink/[0.04] dark:border-paper/10 dark:bg-paper/[0.06]">
      <span className="font-mono text-[0.55rem] font-medium uppercase tracking-[0.16em] text-ink/40 dark:text-paper/40">
        Placeholder
      </span>
      <span className="px-2 text-center font-serif text-base text-ink/55 dark:text-paper/55">
        {label}
      </span>
    </div>
  );
}

type ImageWindowProps = {
  activeIndex: number;
  // Vertical offset (px, negative) applied to the active section's stack so it
  // scrubs through the window as the user scrolls within that section.
  imageOffset: number;
  registerStrip: (index: number, element: HTMLDivElement | null) => void;
  windowRef: React.RefObject<HTMLDivElement | null>;
};

// Right column: a fixed-height window. Each section stacks its photos at full
// width / natural height; the active section's stack translates vertically so
// the photos scrub through the window as the user scrolls. Sections crossfade.
function ImageWindow({
  activeIndex,
  imageOffset,
  registerStrip,
  windowRef,
}: ImageWindowProps) {
  return (
    <figure
      className="relative h-[60vh] w-full overflow-hidden lg:h-[72vh]"
      ref={windowRef}
    >
      {companies.map((company, index) => {
        const isActive = index === activeIndex;
        const images = company.images;

        return (
          <div
            className={`absolute inset-0 transition-opacity duration-500 ease-out motion-reduce:transition-none ${
              isActive ? "opacity-100" : "invisible opacity-0"
            }`}
            key={company.id}
          >
            {company.showcase === "browser" ? (
              <BrowserShowcase />
            ) : images ? (
              <div
                className="absolute inset-x-0 top-0 flex flex-col gap-3 will-change-transform"
                ref={(element) => registerStrip(index, element)}
                style={{
                  transform: `translateY(${isActive ? imageOffset : 0}px)`,
                }}
              >
                {images.map((image) => (
                  <StripImage image={image} key={image.src} />
                ))}
              </div>
            ) : (
              <PlaceholderPanel label={company.name} />
            )}
          </div>
        );
      })}
    </figure>
  );
}

// The side cards stay hidden until the names have scrolled roughly to
// center, then fade in over this progress window (matches the YC reveal).
const REVEAL_START = 0.12;
const REVEAL_END = 0.28;

export function AboutScrollShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const [reveal, setReveal] = useState(0);
  const [imageOffset, setImageOffset] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);
  const windowRef = useRef<HTMLDivElement | null>(null);
  const stripRefs = useRef<(HTMLDivElement | null)[]>([]);

  const registerStrip = (index: number, element: HTMLDivElement | null) => {
    stripRefs.current[index] = element;
  };

  useEffect(() => {
    let frame = 0;

    const updateActiveIndex = () => {
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

      const progress = Math.min(Math.max(-rect.top / scrollable, 0), 1);

      // Split overall progress into a whole-number section index plus the
      // fractional progress *within* that section (0 -> first image, 1 -> last).
      const rawSection = progress * companies.length;
      const nextIndex = Math.min(
        companies.length - 1,
        Math.floor(rawSection)
      );
      const intraProgress = Math.min(Math.max(rawSection - nextIndex, 0), 1);

      setActiveIndex((currentIndex) =>
        currentIndex === nextIndex ? currentIndex : nextIndex
      );

      // Translate the active section's photo stack so it scrubs through the
      // window: from the top of the stack (0) to its bottom edge (-overflow).
      const strip = stripRefs.current[nextIndex];
      const windowEl = windowRef.current;
      let nextOffset = 0;

      if (strip && windowEl) {
        const overflow = Math.max(
          0,
          strip.scrollHeight - windowEl.clientHeight
        );
        nextOffset = Math.round(-intraProgress * overflow);
      }

      setImageOffset((currentOffset) =>
        currentOffset === nextOffset ? currentOffset : nextOffset
      );

      const nextReveal = Math.min(
        Math.max((progress - REVEAL_START) / (REVEAL_END - REVEAL_START), 0),
        1
      );
      const roundedReveal = Math.round(nextReveal * 100) / 100;

      setReveal((currentReveal) =>
        currentReveal === roundedReveal ? currentReveal : roundedReveal
      );
    };

    const requestUpdate = () => {
      if (!frame) {
        frame = requestAnimationFrame(updateActiveIndex);
      }
    };

    updateActiveIndex();
    window.addEventListener("scroll", requestUpdate, { passive: true });
    window.addEventListener("resize", requestUpdate);

    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("scroll", requestUpdate);
      window.removeEventListener("resize", requestUpdate);
    };
  }, []);

  const scrollToSection = (index: number) => {
    const wrapper = wrapperRef.current;

    if (!wrapper) {
      return;
    }

    const rect = wrapper.getBoundingClientRect();
    const scrollable = rect.height - window.innerHeight;
    // Land just inside the section so its photo stack starts at the top.
    const target =
      window.scrollY +
      rect.top +
      ((index + 0.02) / companies.length) * scrollable;

    setActiveIndex(index);
    window.scrollTo({ top: target, behavior: "smooth" });
  };

  const activeSection = companies[activeIndex];

  return (
    <section
      aria-labelledby="about-showcase-heading"
      className="px-5 sm:px-8 lg:px-12"
    >
      <h2 id="about-showcase-heading" className="sr-only">
        What we&apos;ve built
      </h2>

      <div
        className="relative"
        ref={wrapperRef}
        style={{ height: `${companies.length * 100}vh` }}
      >
        <div
          className="sticky top-0 h-screen overflow-hidden"
          data-about-stage
          data-active-section={activeSection.id}
        >
          <div className="relative mx-auto grid h-full max-w-[1300px] grid-cols-[minmax(0,1fr)_minmax(0,1fr)] items-center gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_minmax(0,1fr)] lg:gap-10">
            {/* Left image */}
            <div
              className="order-2 lg:order-1"
              style={{
                opacity: reveal,
                transform: `translateY(${(1 - reveal) * 24}px)`,
              }}
            >
              <TechPanel activeIndex={activeIndex} />
            </div>

            {/* Center — scrolling list of names + scroll hint */}
            <div className="pointer-events-none relative order-1 col-span-2 h-[24rem] lg:order-2 lg:col-span-1 lg:h-full">
              {activeIndex === 0 && (
                <ChevronDown
                  aria-hidden="true"
                  className="absolute left-1/2 -translate-x-1/2 text-ink/30 dark:text-paper/30"
                  data-about-scroll-hint
                  size={26}
                  strokeWidth={1.5}
                  style={{ top: "calc(50% - 5rem)" }}
                />
              )}

              <nav
                aria-label="About sections"
                className="pointer-events-auto absolute inset-0"
              >
                <ul
                  className="absolute inset-x-0 top-1/2 transition-transform duration-500 ease-out motion-reduce:transition-none"
                  style={{
                    transform: `translateY(calc(${-(activeIndex + 0.5)} * ${NAME_ROW}))`,
                  }}
                >
                  {companies.map((company, index) => {
                    const isActive = index === activeIndex;
                    const distance = Math.abs(index - activeIndex);

                    return (
                      <li
                        className="flex items-center justify-center"
                        key={company.id}
                        style={{ height: NAME_ROW }}
                      >
                        <button
                          aria-current={isActive ? "true" : undefined}
                          className="px-4 text-center font-serif text-3xl font-medium leading-tight tracking-tight text-ink transition-opacity duration-300 ease-out motion-reduce:transition-none sm:text-4xl lg:text-6xl dark:text-paper"
                          onClick={() => scrollToSection(index)}
                          style={{
                            opacity: isActive ? 1 : distance === 1 ? 0.25 : 0.12,
                          }}
                          type="button"
                        >
                          {company.name}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </nav>
            </div>

            {/* Right image window */}
            <div
              className="order-3"
              style={{
                opacity: reveal,
                transform: `translateY(${(1 - reveal) * 24}px)`,
              }}
            >
              <ImageWindow
                activeIndex={activeIndex}
                imageOffset={imageOffset}
                registerStrip={registerStrip}
                windowRef={windowRef}
              />
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
