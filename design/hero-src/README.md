# Hero illustration sources

Generated with GPT-6.1 Sol's built-in image generation. These source PNGs are
not deployed. `HeroToolbox` (components/landing/hero-toolbox.tsx) stacks seven
lossless PNG layers from `components/landing/hero-art/`, each cropped to its
item and placed on a shared 900 × 870 canvas. The case front is drawn last to
hide the lower edges of the gear. The ground shadow is CSS.

Delivery: the PNGs are served unconverted (plain `<img>`, not the next/image
optimizer). Static imports give them content-hashed `/_next/static/media/` URLs
served with `Cache-Control: public, max-age=31536000, immutable`. Every layer
has an @2x and an @3x file, and `srcset` + `sizes` make the browser download
only the set its screen needs: about 509 KB on 1x/2x screens, about 1.07 MB on
3x phones (see asset-manifest.json).

Compression is lossless only: no palette quantization, no lossy formats.
`build-layers.mjs` encodes at max deflate, then runs `oxipng -o max --alpha`
if installed (`brew install oxipng`, about 5% smaller), and fails if any
visible pixel differs from the encoder output. Zopfli (`oxipng -Z`) was tested
and saved only another 0.5%, so it is not used.

Run `node design/hero-src/build-layers.mjs` from the repository root to
rebuild the layers, previews and manifest. If you change a placement's
left/top, update the matching entry in `hero-toolbox.tsx`. Layer sizes are read
from the imports, so they need no update. The script does not regenerate the
artwork. Prompts are in `prompts.json`.

Art direction: premium soft 3D editorial illustration; warm orange molded case
around `#f48a50` / `#e9662d`, dark burnt-orange cavity, silver laptop, midnight
navy can with a lime lightning bolt, cream badge and sticker sheet, cobalt
lanyard, golden pepperoni pizza. Soft light from the upper left. No real brands
or logos, heavy outlines, scenery, or baked-in ground shadow. One transparent
set for both the beige and espresso page surfaces.
