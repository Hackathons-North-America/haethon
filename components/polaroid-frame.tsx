import Image from "next/image";

type PolaroidFrameProps = {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  width?: number;
  height?: number;
  sticker?: "beaver" | null;
  lift?: "left" | "right" | "none";
  tape?: "corners" | "top" | null;
};

export function PolaroidFrame({
  src,
  alt,
  caption,
  className = "",
  width = 320,
  height = 240,
  sticker = null,
  lift = "none",
  tape = null,
}: PolaroidFrameProps) {
  // Don't set `relative` here — hero frames pass `absolute`, and both utilities
  // conflict in Tailwind (order in the stylesheet wins, not class string order).
  const positionClass = className.includes("absolute") ? "" : "relative";
  const liftClass = {
    left: "group-hover:translate-x-7 group-hover:-translate-y-2 group-hover:scale-[1.08] group-focus-visible:translate-x-7 group-focus-visible:-translate-y-2 group-focus-visible:scale-[1.08]",
    right:
      "group-hover:-translate-x-7 group-hover:-translate-y-2 group-hover:scale-[1.08] group-focus-visible:-translate-x-7 group-focus-visible:-translate-y-2 group-focus-visible:scale-[1.08]",
    none: "group-hover:-translate-y-[0.4rem] group-hover:scale-[1.06] group-focus-visible:-translate-y-[0.4rem] group-focus-visible:scale-[1.06]",
  }[lift];
  const tapeClass = "absolute z-[2] h-[1.1rem] w-[3.4rem] bg-[linear-gradient(90deg,rgb(0_0_0_/_0.06),transparent_16%,transparent_84%,rgb(0_0_0_/_0.06)),linear-gradient(180deg,rgb(252_248_238_/_0.88),rgb(238_229_209_/_0.72))] shadow-[0_1px_3px_rgb(0_0_0_/_0.14)] [clip-path:polygon(0_8%,4%_0,96%_3%,100%_12%,99%_90%,95%_100%,5%_97%,1%_86%)]";

  return (
    <figure
      className={`group cursor-pointer select-none hover:z-50 focus-visible:z-50 ${positionClass} ${className}`}
      tabIndex={0}
    >
      <div className={`relative rounded-none bg-[linear-gradient(165deg,#ffffff_0%,#faf6ec_100%)] p-[5px] pb-6 shadow-[0_12px_28px_-8px_rgba(0,0,0,0.35),0_2px_6px_-2px_rgba(0,0,0,0.16)] ring-1 ring-black/[0.04] transition-[transform,box-shadow] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:shadow-[0_28px_48px_-14px_rgba(0,0,0,0.4),0_8px_16px_-8px_rgba(0,0,0,0.2)] group-focus-visible:shadow-[0_28px_48px_-14px_rgba(0,0,0,0.4),0_8px_16px_-8px_rgba(0,0,0,0.2)] motion-reduce:transition-none motion-reduce:group-hover:transform-none motion-reduce:group-focus-visible:transform-none dark:bg-[linear-gradient(165deg,#f9f3e7_0%,#f0e7d5_100%)] dark:ring-black/10 ${liftClass}`}>
        {tape === "top" ? (
          <span
            aria-hidden="true"
            className={`${tapeClass} left-1/2 top-0 -translate-x-1/2 -translate-y-1/2 rotate-[-3deg]`}
          />
        ) : null}
        {tape === "corners" ? (
          <>
            <span
              aria-hidden="true"
              className={`${tapeClass} -left-3.5 -top-1.5 rotate-[-40deg]`}
            />
            <span
              aria-hidden="true"
              className={`${tapeClass} -right-3.5 -top-1.5 rotate-[40deg]`}
            />
          </>
        ) : null}
        <div className="relative overflow-hidden rounded-none bg-[#111]">
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            className="aspect-[4/3] h-auto w-full object-cover [filter:saturate(0.88)_contrast(1.04)_sepia(0.08)] transition-[filter] duration-[650ms] ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:[filter:saturate(1.06)_contrast(1.02)_sepia(0)] group-focus-visible:[filter:saturate(1.06)_contrast(1.02)_sepia(0)] motion-reduce:transition-none"
            sizes="(max-width: 1024px) 160px, 220px"
          />
          <span
            aria-hidden="true"
            className="absolute inset-0 shadow-[inset_0_0_14px_rgba(0,0,0,0.22),inset_0_0_1px_rgba(0,0,0,0.4)]"
          />
          {caption ? (
            <figcaption className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 to-transparent px-2.5 pb-2 pt-6 text-center font-serif text-[0.65rem] font-medium italic tracking-tight text-white/90 sm:text-[0.7rem]">
              {caption}
            </figcaption>
          ) : null}
        </div>
        {sticker === "beaver" ? (
          <Image
            src="/logo-beaver.png"
            alt=""
            aria-hidden="true"
            width={48}
            height={42}
            className="pointer-events-none absolute -bottom-1 -right-2.5 w-9 rotate-[14deg] drop-shadow-[0_6px_12px_rgba(0,0,0,0.3)] sm:-right-3 sm:w-10"
          />
        ) : null}
      </div>
    </figure>
  );
}

/** Left-edge scrapbook pile — hung off the margin, overlapping, crooked */
const leftPolaroids = [
  {
    src: "/photos/celebration.png",
    alt: "Hackers celebrating at HackAI Toronto",
    caption: "we shipped it",
    className:
      "absolute left-[-12%] top-[8%] z-[3] hidden w-[140px] rotate-[-14deg] sm:block sm:left-[-8%] sm:w-[155px] md:left-[-6%] md:w-[170px] lg:left-[-3%] lg:w-[195px] xl:left-[-1%] xl:w-[215px]",
    width: 1024,
    height: 682,
    sticker: "beaver" as const,
    lift: "left" as const,
    tape: "top" as const,
  },
  {
    src: "/photos/atrium.png",
    alt: "Students collaborating on laptops in a modern atrium",
    caption: "building together",
    className:
      "absolute left-[-18%] top-[24%] z-[1] hidden w-[125px] rotate-[11deg] sm:block sm:left-[-12%] sm:w-[140px] md:left-[-9%] md:w-[155px] lg:left-[-5%] lg:top-[26%] lg:w-[180px] xl:left-[-2%] xl:w-[200px]",
    width: 1024,
    height: 682,
    sticker: null,
    lift: "left" as const,
    tape: "corners" as const,
  },
  {
    src: "/photos/team-huddle.png",
    alt: "A hackathon team huddled around a laptop in a classroom",
    caption: "debugging live",
    className:
      "absolute left-[-6%] top-[40%] z-[4] hidden w-[122px] rotate-[-9deg] md:block md:left-[-3%] md:w-[148px] lg:left-[0%] lg:w-[170px] xl:left-[2%] xl:w-[190px]",
    width: 640,
    height: 427,
    sticker: null,
    lift: "left" as const,
    tape: "top" as const,
  },
  {
    src: "/photos/swag.png",
    alt: "Hackathon stickers, lanyards, and a sticker-covered laptop",
    caption: "swag haul",
    className:
      "absolute left-[-14%] top-[56%] z-[2] hidden w-[118px] rotate-[7deg] md:block md:left-[-8%] md:w-[145px] lg:left-[-4%] lg:w-[168px] xl:left-[-1%] xl:w-[188px]",
    width: 1024,
    height: 650,
    sticker: null,
    lift: "left" as const,
    tape: "corners" as const,
  },
  {
    src: "/photos/collab.png",
    alt: "A team huddled around a laptop during a hackathon",
    caption: "pair programming",
    className:
      "absolute bottom-[1%] left-[-16%] z-[3] hidden w-[132px] rotate-[16deg] md:block md:left-[-10%] md:w-[150px] lg:bottom-[3%] lg:left-[-4%] lg:w-[175px] xl:left-[-1%] xl:w-[195px]",
    width: 1024,
    height: 682,
    sticker: "beaver" as const,
    lift: "left" as const,
    tape: "top" as const,
  },
] as const;

/** Right-edge scrapbook pile */
const rightPolaroids = [
  {
    src: "/photos/keynote.png",
    alt: "A packed hackathon keynote hall filled with attendees",
    caption: "opening ceremony",
    className:
      "absolute right-[-14%] top-[7%] z-[2] hidden w-[138px] rotate-[12deg] sm:block sm:right-[-9%] sm:w-[158px] md:right-[-6%] md:w-[172px] lg:right-[-3%] lg:w-[198px] xl:right-[-1%] xl:w-[218px]",
    width: 1024,
    height: 768,
    sticker: null,
    lift: "right" as const,
    tape: "corners" as const,
  },
  {
    src: "/photos/stage.png",
    alt: "A speaker presenting on stage at a developer community event",
    caption: "talks & demos",
    className:
      "absolute right-[-20%] top-[22%] z-[4] hidden w-[128px] rotate-[-13deg] sm:block sm:right-[-13%] sm:w-[142px] md:right-[-9%] md:w-[158px] lg:right-[-5%] lg:top-[24%] lg:w-[182px] xl:right-[-2%] xl:w-[202px]",
    width: 1024,
    height: 682,
    sticker: "beaver" as const,
    lift: "right" as const,
    tape: "top" as const,
  },
  {
    src: "/photos/demo-guitar.png",
    alt: "A team demoing a hardware guitar project on stage",
    caption: "demo day",
    className:
      "absolute right-[-8%] top-[38%] z-[3] hidden w-[124px] rotate-[9deg] md:block md:right-[-4%] md:w-[150px] lg:right-[-1%] lg:w-[172px] xl:right-[1%] xl:w-[192px]",
    width: 640,
    height: 427,
    sticker: null,
    lift: "right" as const,
    tape: "corners" as const,
  },
  {
    src: "/photos/sushi.png",
    alt: "Hackers grabbing sushi at a late-night event buffet",
    caption: "midnight fuel",
    className:
      "absolute right-[-16%] top-[54%] z-[1] hidden w-[120px] rotate-[-6deg] md:block md:right-[-10%] md:w-[148px] lg:right-[-5%] lg:w-[170px] xl:right-[-2%] xl:w-[190px]",
    width: 1024,
    height: 682,
    sticker: null,
    lift: "right" as const,
    tape: "top" as const,
  },
  {
    src: "/photos/atrium-wide.png",
    alt: "A multi-level university atrium during a community event",
    caption: "the venue",
    className:
      "absolute bottom-[1%] right-[-15%] z-[3] hidden w-[130px] rotate-[-10deg] md:block md:right-[-9%] md:w-[152px] lg:bottom-[3%] lg:right-[-4%] lg:w-[178px] xl:right-[-1%] xl:w-[198px]",
    width: 1024,
    height: 682,
    sticker: null,
    lift: "right" as const,
    tape: "corners" as const,
  },
] as const;

export const heroPolaroids = [...leftPolaroids, ...rightPolaroids];

export const mobilePolaroids = [
  leftPolaroids[0],
  rightPolaroids[0],
  leftPolaroids[2],
  rightPolaroids[2],
] as const;
