import type { StaticImageData } from "next/image";

import badge2x from "./hero-art/badge@2x.png";
import badge3x from "./hero-art/badge@3x.png";
import can2x from "./hero-art/can@2x.png";
import can3x from "./hero-art/can@3x.png";
import caseBack2x from "./hero-art/case-back@2x.png";
import caseBack3x from "./hero-art/case-back@3x.png";
import caseFront2x from "./hero-art/case-front@2x.png";
import caseFront3x from "./hero-art/case-front@3x.png";
import laptop2x from "./hero-art/laptop@2x.png";
import laptop3x from "./hero-art/laptop@3x.png";
import pizza2x from "./hero-art/pizza@2x.png";
import pizza3x from "./hero-art/pizza@3x.png";
import stickers2x from "./hero-art/stickers@2x.png";
import stickers3x from "./hero-art/stickers@3x.png";

/* Hero illustration: an open orange equipment case stuffed with hackathon
   gear. Each item is its own lossless PNG, cropped to the item and placed on a
   shared 900 x 870 canvas (3x the 300 x 290 desktop box). The case front is
   painted last so it hides the bottom of each item. Decorative: the headline
   beside it carries the meaning.

   The PNGs are served as-is, not through the next/image optimizer. Static
   imports still give them content-hashed /_next/static/media/ URLs with
   immutable caching. Each layer has 2x and 3x files, and srcset + sizes let the
   browser fetch only the one its screen needs.

   Regenerate the files and the left/top values below with
   `node design/hero-src/build-layers.mjs`. */
const CANVAS = { width: 900, height: 870 };
// Rendered width of the whole box; keep in sync with the className in app/page.tsx.
const BOX = { desktop: 300, mobile: 240 };

type Layer = { name: string; left: number; top: number; x2: StaticImageData; x3: StaticImageData };

const layers: Layer[] = [
  { name: "case-back", left: 34, top: 425, x2: caseBack2x, x3: caseBack3x },
  { name: "laptop", left: 52, top: 150, x2: laptop2x, x3: laptop3x },
  { name: "can", left: 325, top: 33, x2: can2x, x3: can3x },
  { name: "badge", left: 466, top: 58, x2: badge2x, x3: badge3x },
  { name: "pizza", left: 642, top: 247, x2: pizza2x, x3: pizza3x },
  { name: "stickers", left: 58, top: 365, x2: stickers2x, x3: stickers3x },
  { name: "case-front", left: 20, top: 503, x2: caseFront2x, x3: caseFront3x },
];

const pct = (value: number, total: number) => `${(value / total) * 100}%`;
const px = (value: number) => `${Math.round(value * 10) / 10}px`;

export function HeroToolbox({ className = "" }: { className?: string }) {
  return (
    <div aria-hidden="true" className={`relative aspect-[300/290] ${className}`}>
      <div className="absolute bottom-[0.5%] left-[5%] h-[2.5%] w-[90%] rounded-[50%] bg-black/15 blur-[2px] dark:bg-black/25" />
      {layers.map(({ name, left, top, x2, x3 }) => {
        // The 3x file is at canvas scale, so its width is the layer's share
        // of the canvas.
        const share = x3.width / CANVAS.width;
        return (
          // eslint-disable-next-line @next/next/no-img-element -- lossless PNGs served unconverted; next/image would re-encode them.
          <img
            alt=""
            className="absolute h-auto select-none"
            decoding="async"
            draggable={false}
            // The case front is the largest layer, so it is the LCP candidate.
            fetchPriority={name === "case-front" ? "high" : "auto"}
            height={x3.height}
            key={name}
            loading="eager"
            sizes={`(min-width: 1280px) ${px(share * BOX.desktop)}, ${px(share * BOX.mobile)}`}
            src={x2.src}
            srcSet={`${x2.src} ${x2.width}w, ${x3.src} ${x3.width}w`}
            style={{ left: pct(left, CANVAS.width), top: pct(top, CANVAS.height), width: pct(x3.width, CANVAS.width) }}
            width={x3.width}
          />
        );
      })}
    </div>
  );
}
