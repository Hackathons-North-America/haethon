"use client";

import Image from "next/image";
import type { CSSProperties } from "react";
import { useEffect, useRef, useState } from "react";

const aboutSections = [
  {
    id: "hack-canada",
    name: "Hack Canada",
    eyebrow: "Flagship event",
    tabLabel: "001 · 2026 — Present",
    folderColor: "#3150FF",
    watermark: "Canada",
    description:
      "Hack Canada was one of the fastest-growing hackathons in Canada, bringing over 700 members together for a high-energy weekend of building, mentorship, and demos.",
    photos: [
      {
        src: "https://images.unsplash.com/photo-1504384308090-c894fdcc538d?auto=format&fit=crop&w=640&q=80",
        alt: "Hackers building together at Hack Canada",
      },
      {
        src: "https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=640&q=80",
        alt: "A workshop session at Hack Canada",
      },
      {
        src: "https://images.unsplash.com/photo-1522071820081-009f0129c71c?auto=format&fit=crop&w=640&q=80",
        alt: "A team collaborating during the hackathon",
      },
    ],
    stats: [
      { value: "700+", label: "Community members" },
      { value: "36", label: "Hours of hacking" },
      { value: "100+", label: "Projects shipped" },
    ],
  },
  {
    id: "hackathons-canada",
    name: "Hackathons Canada",
    eyebrow: "Organizer network",
    tabLabel: "002 · 2025 — Present",
    folderColor: "#D83A2E",
    watermark: "Canada",
    description:
      "Hackathons Canada helps Canadian organizers reach more hackers, sharpen their event positioning, and turn scattered promotion into a stronger application pipeline.",
    photos: [
      {
        src: "https://images.unsplash.com/photo-1540575467063-178a50c2df87?auto=format&fit=crop&w=640&q=80",
        alt: "A packed hackathon opening ceremony",
      },
      {
        src: "https://images.unsplash.com/photo-1556761175-b413da4baf72?auto=format&fit=crop&w=640&q=80",
        alt: "Organizers planning an event together",
      },
      {
        src: "https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=640&q=80",
        alt: "A mentor helping a hacker debug",
      },
    ],
    stats: [
      { value: "10K+", label: "Hackers reached" },
      { value: "40+", label: "Events supported" },
      { value: "13", label: "Provinces & territories" },
    ],
  },
  {
    id: "hackathons-north-america",
    name: "Hackathons North America",
    eyebrow: "Discovery platform",
    tabLabel: "003 · Now",
    folderColor: "#111111",
    watermark: "North America",
    description:
      "Hackathons North America maps upcoming hackathons across the continent so hackers can search, compare, save events, and never miss a deadline.",
    photos: [
      {
        src: "https://images.unsplash.com/photo-1519389950473-47ba0277781c?auto=format&fit=crop&w=640&q=80",
        alt: "Hackers browsing events on their laptops",
      },
      {
        src: "https://images.unsplash.com/photo-1515879218367-8466d910aaa4?auto=format&fit=crop&w=640&q=80",
        alt: "Code on a screen during a build sprint",
      },
      {
        src: "https://images.unsplash.com/photo-1543269865-cbf427effbad?auto=format&fit=crop&w=640&q=80",
        alt: "Students planning their next hackathon",
      },
    ],
    stats: [
      { value: "150+", label: "Hackathons tracked" },
      { value: "30+", label: "Cities covered" },
      { value: "1", label: "Home for hackers" },
    ],
  },
] as const;

const NAME_ROW_REM = 7;

export function AboutScrollShowcase() {
  const [activeIndex, setActiveIndex] = useState(0);
  const wrapperRef = useRef<HTMLDivElement | null>(null);

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
      const nextIndex = Math.min(
        aboutSections.length - 1,
        Math.floor(progress * aboutSections.length)
      );

      setActiveIndex((currentIndex) =>
        currentIndex === nextIndex ? currentIndex : nextIndex
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
    const target =
      window.scrollY +
      rect.top +
      ((index + 0.5) / aboutSections.length) * scrollable;

    setActiveIndex(index);
    window.scrollTo({ top: target, behavior: "smooth" });
  };

  const activeSection = aboutSections[activeIndex];

  return (
    <section aria-labelledby="about-showcase-heading" className="px-5 sm:px-8 lg:px-12">
      <h2 id="about-showcase-heading" className="sr-only">
        Haethon work areas
      </h2>

      <div
        className="relative"
        ref={wrapperRef}
        style={{ height: `${aboutSections.length * 100}vh` }}
      >
        <div
          className="sticky top-0 flex h-screen items-center"
          data-about-stage
          data-active-section={activeSection.id}
        >
          <div className="mx-auto grid w-full max-w-[1240px] items-center gap-10 lg:grid-cols-[0.36fr_1fr] lg:gap-16">
            <aside className="hidden lg:block">
              <nav aria-label="About sections">
                <div className="h-[7rem]">
                  <div
                    className="about-name-track transition-transform duration-500 ease-out"
                    style={{
                      transform: `translateY(${-activeIndex * NAME_ROW_REM}rem)`,
                    }}
                  >
                    {aboutSections.map((section, index) => {
                      const isActive = index === activeIndex;
                      const distance = Math.abs(index - activeIndex);

                      return (
                        <button
                          aria-current={isActive ? "true" : undefined}
                          className="about-section-link flex h-[7rem] w-full items-center text-left font-serif text-[2.3rem] font-semibold leading-[0.95] transition duration-300 xl:text-[2.7rem]"
                          data-active={isActive ? "true" : "false"}
                          key={section.id}
                          onClick={() => scrollToSection(index)}
                          style={{
                            opacity: isActive ? 1 : distance === 1 ? 0.35 : 0.14,
                          }}
                          type="button"
                        >
                          {section.name}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </nav>
            </aside>

            <div
              className="about-showcase-folder"
              style={
                {
                  "--folder-color": activeSection.folderColor,
                } as CSSProperties
              }
            >
              <span
                className="about-showcase-folder-tab font-mono text-xs font-medium uppercase tracking-[0.14em]"
                key={activeSection.id}
              >
                {activeSection.tabLabel}
              </span>

              <div className="about-showcase-folder-body">
                {aboutSections.map((section, index) => (
                  <article
                    className="about-folder-layer"
                    data-active={index === activeIndex ? "true" : "false"}
                    key={section.id}
                  >
                    <div className="about-layer-watermark pointer-events-none absolute -left-6 top-20 select-none font-serif text-[5.5rem] font-semibold leading-none text-white/10 sm:text-[8rem]">
                      {section.watermark}
                    </div>

                    <div className="relative z-10 flex h-full flex-col justify-between gap-6 p-6 sm:p-8 lg:p-10">
                      <div
                        className="about-layer-item"
                        style={{ "--stagger": 0 } as CSSProperties}
                      >
                        <p className="font-mono text-xs font-medium uppercase tracking-[0.14em] text-white/70">
                          {section.eyebrow}
                        </p>
                        <h3 className="mt-3 text-4xl font-semibold leading-[0.98] tracking-normal text-white sm:text-5xl lg:text-6xl">
                          {section.name}
                        </h3>
                        <p className="mt-4 max-w-[580px] text-sm leading-6 text-white/80 sm:text-base sm:leading-7 lg:text-lg">
                          {section.description}
                        </p>
                      </div>

                      <div>
                        <div
                          className="about-layer-item grid grid-cols-3 gap-3 sm:gap-4"
                          style={{ "--stagger": 1 } as CSSProperties}
                        >
                          {section.photos.map((photo) => (
                            <div
                              className="relative aspect-[4/3] overflow-hidden rounded-xl border border-white/25"
                              key={photo.src}
                            >
                              <Image
                                alt={photo.alt}
                                className="object-cover"
                                fill
                                sizes="(min-width: 1024px) 220px, 30vw"
                                src={photo.src}
                              />
                            </div>
                          ))}
                        </div>

                        <div
                          className="about-layer-item mt-5 grid grid-cols-3 gap-3 sm:mt-6 sm:gap-4"
                          style={{ "--stagger": 2 } as CSSProperties}
                        >
                          {section.stats.map((stat) => (
                            <div key={`${section.id}-${stat.label}`}>
                              <p className="text-3xl font-semibold leading-none text-white sm:text-4xl lg:text-[3.2rem]">
                                {stat.value}
                              </p>
                              <p className="mt-2 font-mono text-[0.65rem] font-medium uppercase tracking-[0.14em] text-white/65 sm:text-xs">
                                {stat.label}
                              </p>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
