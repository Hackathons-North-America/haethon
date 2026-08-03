/* The logo-cloud strip that sits directly under the hero: a small-caps kicker
   over an endless left-drifting row of event names. We have no logo art for
   these events, so the "logos" are the names themselves, set bold in the
   section-heading voice. */

const TRACKED_HACKATHONS = [
  "Hack the North",
  "TreeHacks",
  "HackMIT",
  "Cal Hacks",
  "PennApps",
  "Hack the Valley",
  "Hack Canada",
  "JamHacks",
  "DeltaHacks",
  "UofTHacks",
];

function MarqueeRow({ ariaHidden }: { ariaHidden?: boolean }) {
  return (
    <ul
      aria-hidden={ariaHidden ? "true" : undefined}
      className="flex shrink-0 items-center gap-10 pr-10 sm:gap-16 sm:pr-16"
    >
      {TRACKED_HACKATHONS.map((name) => (
        <li
          key={name}
          className="shrink-0 whitespace-nowrap text-lg font-semibold tracking-[-0.03em] text-ink/80 sm:text-xl"
        >
          {name}
        </li>
      ))}
    </ul>
  );
}

export function HackathonMarquee() {
  return (
    // Only a top rule, to part the strip from the hero. The sheet below opens
    // borderless so the marquee runs into it without a second line.
    <section
      aria-labelledby="tracked-hackathons-heading"
      className="border-t border-black bg-paper py-10 sm:py-12"
    >
      <h2
        id="tracked-hackathons-heading"
        className="px-6 text-center font-mono text-[10px] font-medium uppercase tracking-[0.14em] text-pine sm:px-10"
      >
        Hackathons we track
      </h2>

      {/* The rail masks its own edges, so names dissolve into the paper rather
          than getting clipped at the viewport. */}
      <div
        className="relative mt-7 flex overflow-hidden sm:mt-8"
        style={{
          maskImage:
            "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
          WebkitMaskImage:
            "linear-gradient(to right, transparent, black 8%, black 92%, transparent)",
        }}
      >
        {/* Four rows, two per half: the track slides exactly half its width, so
            the back half is mid-frame when the front half wraps around. Two
            rows per half (rather than one) keeps the half wider than any real
            viewport, so no gap opens on ultrawide displays. */}
        <div className="flex w-max animate-marquee motion-reduce:animate-none">
          <MarqueeRow />
          <MarqueeRow ariaHidden />
          <MarqueeRow ariaHidden />
          <MarqueeRow ariaHidden />
        </div>
      </div>
    </section>
  );
}
