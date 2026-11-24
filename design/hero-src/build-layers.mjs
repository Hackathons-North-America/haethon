import { execFileSync } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const root = path.resolve(import.meta.dirname, "../..");
const sharp = require(require.resolve("sharp", { paths: [path.dirname(require.resolve("next/package.json"))] }));
const source = path.join(root, "design/hero-src");
// Not under public/: the component imports these statically, so Next copies
// them to content-hashed /_next/static/media/ URLs with immutable caching.
// Files in public/ would ship a second, unhashed copy.
const output = path.join(root, "components/landing/hero-art");
const width = 900;
const height = 870;
// Layers ship at the 3x canvas (900 wide = 300 CSS px x 3) and at 2x. The
// browser picks one per layer from srcset, so only 3x screens pay for 3x.
const scales = { "3x": 1, "2x": 2 / 3 };

// Each generated cutout is trimmed, then placed in the shared 900 x 870 canvas.
// The item bases extend below the foreground rim for clean occlusion.
const placements = [
  { name: "case-back", left: 34, top: 425, width: 832, height: 158 },
  { name: "laptop", left: 52, top: 150, width: 415, height: 432 },
  { name: "can", left: 325, top: 33, width: 240, height: 555 },
  { name: "badge", left: 466, top: 58, width: 310, height: 530 },
  { name: "pizza", left: 642, top: 247, width: 242, height: 343 },
  { name: "stickers", left: 58, top: 365, width: 218, height: 225 },
  { name: "case-front", left: 20, top: 503, width: 860, height: 344 },
];

// Lossless only: full RGBA, no palette quantization. Don't pass `quality`,
// `colours` or `effort` to sharp's png(); any of them silently turns on
// palette mode, which is lossy. Try both filter strategies at maximum deflate
// and keep whichever is smaller.
async function losslessPng(image) {
  const candidates = await Promise.all(
    [true, false].map((adaptiveFiltering) =>
      image.clone().png({ compressionLevel: 9, adaptiveFiltering, palette: false }).toBuffer(),
    ),
  );
  return candidates.reduce((a, b) => (b.length < a.length ? b : a));
}

// oxipng (brew install oxipng) recompresses further, still losslessly. --alpha
// only rewrites the colour of fully transparent pixels, which are never shown.
// Optional: without it the PNGs are about 5% larger.
function oxipng(file) {
  try {
    execFileSync("oxipng", ["-o", "max", "--alpha", "--strip", "safe", "-q", file]);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

// Fails the build if any visible pixel changed: alpha must match everywhere,
// and colour must match wherever alpha > 0.
async function assertSamePixels(before, after, file) {
  const [a, b] = await Promise.all(
    [before, after].map((input) => sharp(input).ensureAlpha().raw().toBuffer()),
  );
  if (a.length !== b.length) throw new Error(`Size changed: ${file}`);
  for (let i = 0; i < a.length; i += 4) {
    if (a[i + 3] !== b[i + 3]) throw new Error(`Alpha changed: ${file}`);
    if (a[i + 3] && (a[i] !== b[i] || a[i + 1] !== b[i + 1] || a[i + 2] !== b[i + 2])) {
      throw new Error(`Visible pixel changed: ${file}`);
    }
  }
}

await fs.rm(output, { recursive: true, force: true });
await fs.mkdir(output, { recursive: true });

const layers = [];
const previewInputs = [];
let usedOxipng = false;
for (const placement of placements) {
  const cutout = await sharp(path.join(source, `${placement.name}.png`))
    .trim({ background: "#00000000", threshold: 15 })
    .resize(placement.width, placement.height, { fit: placement.name.startsWith("case-") ? "fill" : "inside" })
    .png()
    .toBuffer();
  const { width: w, height: h } = await sharp(cutout).metadata();
  // "inside" can shrink one side, so record the real size, not the request.
  const layer = { name: placement.name, left: placement.left, top: placement.top, width: w, height: h, files: {} };
  for (const [label, scale] of Object.entries(scales)) {
    // Round up: a 2x file even 0.3px narrower than sizes x DPR makes the
    // browser skip it and download the 3x file instead.
    const sw = Math.ceil(w * scale);
    const sh = Math.ceil(h * scale);
    const img = scale === 1 ? sharp(cutout) : sharp(cutout).resize(sw, sh, { kernel: "lanczos3" });
    const encoded = await losslessPng(img);
    const file = `${placement.name}@${label}.png`;
    const target = path.join(output, file);
    await fs.writeFile(target, encoded);
    if (oxipng(target)) usedOxipng = true;
    const buffer = await fs.readFile(target);
    await assertSamePixels(encoded, buffer, file);
    const meta = await sharp(buffer).metadata();
    if (meta.width !== sw || meta.height !== sh || !meta.hasAlpha || meta.format !== "png") {
      throw new Error(`Invalid layer: ${file}`);
    }
    layer.files[label] = { file, width: sw, height: sh, bytes: buffer.length };
  }
  layers.push(layer);
  previewInputs.push({ input: cutout, left: placement.left, top: placement.top });
}

const blank = (w, h, background = "#00000000") => sharp({ create: { width: w, height: h, channels: 4, background } });
const preview = path.join(source, "composed-preview.png");
await blank(width, height).composite(previewInputs).png().toFile(preview);
const art300 = await sharp(preview).resize(300, 290).toBuffer();
const art240 = await sharp(preview).resize(240, 232).toBuffer();
await blank(720, 660, "#f5f0e6")
  .composite([
    { input: { create: { width: 360, height: 660, channels: 4, background: "#2b2420" } }, left: 360, top: 0 },
    { input: art300, left: 30, top: 40 },
    { input: art300, left: 390, top: 40 },
    { input: art240, left: 60, top: 390 },
    { input: art240, left: 420, top: 390 },
  ])
  .png()
  .toFile(path.join(source, "theme-preview.png"));

const total = (label) => layers.reduce((sum, layer) => sum + layer.files[label].bytes, 0);
const manifest = { canvas: { width, height }, totalBytes: { "2x": total("2x"), "3x": total("3x") }, layers };
await fs.writeFile(path.join(source, "asset-manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`);
if (!usedOxipng) console.warn("oxipng not found; PNGs are lossless but not fully recompressed.");
console.log(JSON.stringify(manifest.totalBytes));
for (const l of layers) console.log(l.name, `${l.width}x${l.height}`, l.files["2x"].bytes, l.files["3x"].bytes);
