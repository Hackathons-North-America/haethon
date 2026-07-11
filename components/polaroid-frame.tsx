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
}: PolaroidFrameProps) {
  // Don't set `relative` here — hero frames pass `absolute`, and both utilities
  // conflict in Tailwind (order in the stylesheet wins, not class string order).
  const positionClass = className.includes("absolute") ? "" : "relative";

  return (
    <figure
      className={`polaroid-frame group cursor-pointer select-none ${positionClass} ${className}`}
      data-lift={lift}
      tabIndex={0}
    >
      <div className="polaroid-lift relative rounded-none bg-white p-[5px] pb-6 shadow-[0_12px_28px_-8px_rgba(0,0,0,0.35),0_2px_6px_-2px_rgba(0,0,0,0.16)] ring-1 ring-black/[0.04] dark:bg-[#f7f0e4] dark:ring-black/10">
        <div className="relative overflow-hidden rounded-none bg-[#111]">
          <Image
            src={src}
            alt={alt}
            width={width}
            height={height}
            className="aspect-[4/3] h-auto w-full object-cover"
            sizes="(max-width: 1024px) 160px, 220px"
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
export const leftPolaroids = [
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
  },
] as const;

/** Right-edge scrapbook pile */
export const rightPolaroids = [
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
  },
] as const;

export const heroPolaroids = [...leftPolaroids, ...rightPolaroids];

export const mobilePolaroids = [
  leftPolaroids[0],
  rightPolaroids[0],
  leftPolaroids[2],
  rightPolaroids[2],
] as const;
