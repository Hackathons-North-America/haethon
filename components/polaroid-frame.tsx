import Image from "next/image";

type PolaroidFrameProps = {
  src: string;
  alt: string;
  caption?: string;
  className?: string;
  width?: number;
  height?: number;
};

export function PolaroidFrame({
  src,
  alt,
  caption,
  className = "",
  width = 320,
  height = 240,
}: PolaroidFrameProps) {
  return (
    <figure
      className={`pointer-events-none select-none bg-wheat p-2 pb-8 shadow-[0_18px_50px_-18px_rgba(0,0,0,0.65)] sm:p-2.5 sm:pb-9 ${className}`}
    >
      <div className="relative overflow-hidden bg-[#0f0f0f]">
        <Image
          src={src}
          alt={alt}
          width={width}
          height={height}
          className="aspect-[4/3] h-auto w-full object-cover"
          sizes="(max-width: 768px) 140px, 220px"
        />
      </div>
      {caption ? (
        <figcaption className="mt-2 px-1 text-center font-serif text-[0.65rem] font-medium tracking-tight text-navy/70 sm:text-[0.7rem]">
          {caption}
        </figcaption>
      ) : null}
    </figure>
  );
}

export const heroPolaroids = [
  {
    src: "/photos/atrium.png",
    alt: "Students collaborating on laptops in a modern atrium",
    caption: "building together",
    className:
      "absolute left-[-2%] top-[18%] hidden w-[118px] rotate-[-11deg] sm:block md:left-[1%] md:w-[150px] lg:left-[3%] lg:top-[16%] lg:w-[190px]",
    width: 1024,
    height: 682,
  },
  {
    src: "/photos/keynote.png",
    alt: "A packed hackathon keynote hall filled with attendees",
    caption: "opening ceremony",
    className:
      "absolute right-[-3%] top-[20%] hidden w-[122px] rotate-[9deg] sm:block md:right-[0%] md:w-[155px] lg:right-[2%] lg:top-[18%] lg:w-[195px]",
    width: 1024,
    height: 768,
  },
  {
    src: "/photos/swag.png",
    alt: "Hackathon stickers, lanyards, and a sticker-covered laptop",
    caption: "swag haul",
    className:
      "absolute bottom-[8%] left-[0%] hidden w-[110px] rotate-[7deg] md:block lg:bottom-[10%] lg:left-[5%] lg:w-[175px]",
    width: 1024,
    height: 650,
  },
  {
    src: "/photos/sushi.png",
    alt: "Hackers grabbing sushi at a late-night event buffet",
    caption: "midnight fuel",
    className:
      "absolute bottom-[6%] right-[-2%] hidden w-[112px] rotate-[-8deg] md:block lg:bottom-[8%] lg:right-[4%] lg:w-[180px]",
    width: 1024,
    height: 682,
  },
] as const;
