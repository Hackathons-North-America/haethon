/* Benchmarks catalog covers: originals vs the resized WebP thumbnails.
   Results back docs/perf/5-cover-thumbnails.md.

   Read-only. It loads /hackathons from a running production build, downloads
   the covers that page shows (plain GETs to the organizers' CDNs, through the
   app's own SSRF-guarded fetch), and cuts thumbnails from them locally with
   the app's own renderCoverThumbnails(). Nothing is uploaded and nothing is
   written to any database.

   Usage (Node 24, the Vercel runtime):
     pnpm build && npx -y node@24 node_modules/next/dist/bin/next start -p 3121
     BENCH_DIR=/tmp/cover-bench npx -y node@24 node_modules/tsx/dist/cli.mjs \
       scripts/perf/cover-thumbnails-bench.ts all --runs 7

   Steps (each can be run on its own; later steps read the earlier ones'
   files from BENCH_DIR):
     discover  which covers each device profile shows, and which are on the
               first screen
     download  fetch those originals and render their thumbnails
     bytes     first-screen and first-page cover bytes, before vs after
     timing    throttled page loads in Chromium, before vs after

   Timing: both cases load the same production page from localhost:3121.
   Chromium resolves every other host to a local HTTPS server (self-signed,
   HTTP/2), which answers cover URLs with either the original bytes
   ("before") or the thumbnail the card's srcset would make this device pick
   ("after"); everything else gets a 404 in both cases. So the only thing
   that differs between the cases is the cover bytes, and both go through the
   same DevTools network throttling. */
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import http2 from "node:http2";
import path from "node:path";

import { chromium, type BrowserContextOptions } from "@playwright/test";

const [command = "all", ...rest] = process.argv.slice(2);

function option(name: string, fallback: string) {
  const index = rest.indexOf(`--${name}`);
  return index === -1 ? fallback : rest[index + 1];
}

const BASE = option("base", "http://localhost:3121");
const RUNS = Number(option("runs", "7"));
const IMAGE_PORT = Number(option("image-port", "3141"));
const DIR = process.env.BENCH_DIR ?? path.resolve(".perf-cover-bench");

type Profile = {
  key: string;
  label: string;
  context: BrowserContextOptions;
  /* DevTools Network.emulateNetworkConditions; bytes per second. */
  network: { latency: number; downloadThroughput: number; uploadThroughput: number };
};

const mbps = (value: number) => (value * 1_000_000) / 8;

const PROFILES: Profile[] = [
  {
    key: "phone",
    label: "Phone (390×844, 3× DPR), Slow 4G",
    context: { viewport: { width: 390, height: 844 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true },
    // Lighthouse's mobile throttling preset.
    network: { latency: 150, downloadThroughput: mbps(1.6), uploadThroughput: mbps(0.75) },
  },
  {
    key: "desktop",
    label: "Desktop (1440×900, 2× DPR), 10 Mbps",
    context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 2 },
    network: { latency: 40, downloadThroughput: mbps(10), uploadThroughput: mbps(5) },
  },
  {
    key: "desktop1x",
    label: "Desktop (1440×900, 1× DPR), 10 Mbps",
    context: { viewport: { width: 1440, height: 900 }, deviceScaleFactor: 1 },
    network: { latency: 40, downloadThroughput: mbps(10), uploadThroughput: mbps(5) },
  },
];

/* Mirrors COVER_IMAGE_SIZES in lib/hackathons/cover-image.ts. */
function slotWidth(viewportWidth: number) {
  if (viewportWidth >= 1440) return viewportWidth / 3;
  if (viewportWidth >= 640) return viewportWidth / 2;
  return viewportWidth;
}

/* Chromium's srcset choice for width descriptors: the smallest candidate
   whose density (width / slot) is at least the device pixel ratio, else the
   largest. */
function pickedThumbnail(profile: Profile): "small" | "large" {
  const need = slotWidth(profile.context.viewport!.width) * (profile.context.deviceScaleFactor ?? 1);
  return need <= 640 ? "small" : "large";
}

type DiscoveredCover = { src: string; name: string; firstScreen: boolean };
type CoverFile = {
  src: string;
  sha: string;
  contentType: string;
  bytes: number;
  thumbnails: { small: number; large: number } | { skipped: string };
};

const sha = (value: string) => createHash("sha1").update(value).digest("hex").slice(0, 16);
const file = (...parts: string[]) => path.join(DIR, ...parts);
const readJson = async <T>(name: string) => JSON.parse(await readFile(file(name), "utf8")) as T;

async function discover() {
  const browser = await chromium.launch();
  const result: Record<string, DiscoveredCover[]> = {};

  try {
    for (const profile of PROFILES) {
      const context = await browser.newContext(profile.context);
      const page = await context.newPage();
      await page.goto(`${BASE}/hackathons`, { waitUntil: "load" });
      await page.waitForSelector("article img[alt$=' cover']");
      result[profile.key] = await page.$$eval("article img[alt$=' cover']", (images) =>
        images.map((image) => {
          const rect = image.getBoundingClientRect();
          return {
            src: (image as HTMLImageElement).currentSrc || (image as HTMLImageElement).src,
            name: image.getAttribute("alt")!.replace(/ cover$/, ""),
            firstScreen: rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0,
          };
        })
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }

  await mkdir(DIR, { recursive: true });
  await writeFile(file("discovered.json"), JSON.stringify(result, null, 2));

  for (const [key, covers] of Object.entries(result)) {
    console.log(`${key}: ${covers.length} covers on the page, ${covers.filter((cover) => cover.firstScreen).length} on the first screen`);
  }
}

async function download() {
  // The app's modules read env at import; nothing here touches a database.
  process.env.SKIP_ENV_VALIDATION = "1";
  process.env.DATABASE_URL = "postgres://bench:bench@localhost:1/none";
  const { fetchSafeRemoteImage } = await import("../../lib/security/remote-image");
  const { renderCoverThumbnails } = await import("../../lib/hackathons/cover-thumbnails");

  const discovered = await readJson<Record<string, DiscoveredCover[]>>("discovered.json");
  const sources = [...new Set(Object.values(discovered).flatMap((covers) => covers.map((cover) => cover.src)))];
  const files: CoverFile[] = [];
  await mkdir(file("covers"), { recursive: true });

  for (const src of sources) {
    const key = sha(src);
    // A higher cap than ingest's 4 MB, to record what the page really sends.
    const image = await fetchSafeRemoteImage(src, 32 * 1024 * 1024);
    await writeFile(file("covers", `${key}.orig`), image.bytes);

    let thumbnails: CoverFile["thumbnails"];

    try {
      const rendered = await renderCoverThumbnails(image.bytes);

      if (rendered.status === "rendered") {
        await writeFile(file("covers", `${key}.small.webp`), rendered.small);
        await writeFile(file("covers", `${key}.large.webp`), rendered.large);
        thumbnails = { small: rendered.small.byteLength, large: rendered.large.byteLength };
      } else {
        thumbnails = { skipped: rendered.reason };
      }
    } catch (error) {
      thumbnails = { skipped: `undecodable (${error instanceof Error ? error.message : error})` };
    }

    files.push({ src, sha: key, contentType: image.contentType, bytes: image.bytes.byteLength, thumbnails });
    console.log(`${(image.bytes.byteLength / 1024).toFixed(0).padStart(6)} KB ${image.contentType.padEnd(10)} → ${JSON.stringify(thumbnails)}  ${src}`);
  }

  await writeFile(file("covers.json"), JSON.stringify(files, null, 2));
}

function servedBytes(cover: CoverFile, profile: Profile, mode: "before" | "after") {
  if (mode === "before" || "skipped" in cover.thumbnails) {
    return cover.bytes;
  }

  return cover.thumbnails[pickedThumbnail(profile)];
}

const kb = (bytes: number) => `${(bytes / 1024).toFixed(0)} KB`;

async function bytes() {
  const discovered = await readJson<Record<string, DiscoveredCover[]>>("discovered.json");
  const covers = new Map((await readJson<CoverFile[]>("covers.json")).map((cover) => [cover.src, cover]));
  const summary: Record<string, unknown> = {};

  console.log("| Profile | Covers | Before | After | Saved |\n| --- | --- | --- | --- | --- |");

  for (const profile of PROFILES) {
    for (const scope of ["first screen", "whole first page"] as const) {
      const list = discovered[profile.key].filter((cover) => scope === "whole first page" || cover.firstScreen);
      const before = list.reduce((sum, cover) => sum + servedBytes(covers.get(cover.src)!, profile, "before"), 0);
      const after = list.reduce((sum, cover) => sum + servedBytes(covers.get(cover.src)!, profile, "after"), 0);
      summary[`${profile.key}:${scope}`] = { covers: list.length, before, after, picked: pickedThumbnail(profile) };
      console.log(
        `| ${profile.label}, ${scope} | ${list.length} | ${kb(before)} | ${kb(after)} (${pickedThumbnail(profile)}) | ${(100 * (1 - after / before)).toFixed(1)}% |`
      );
    }
  }

  console.log("\nPer cover (first page):\n| Cover | Original | 640w WebP | 1280w WebP |\n| --- | --- | --- | --- |");

  for (const cover of covers.values()) {
    const name = Object.values(discovered).flat().find((entry) => entry.src === cover.src)?.name ?? cover.src;
    const thumbs = cover.thumbnails;
    console.log(
      `| ${name} | ${kb(cover.bytes)} ${cover.contentType.replace("image/", "")} | ${"skipped" in thumbs ? `kept original: ${thumbs.skipped}` : kb(thumbs.small)} | ${"skipped" in thumbs ? "" : kb(thumbs.large)} |`
    );
  }

  await writeFile(file("bytes.json"), JSON.stringify(summary, null, 2));
}

function ensureCertificate() {
  const key = file("tls-key.pem");
  const cert = file("tls-cert.pem");

  if (!existsSync(key)) {
    execFileSync("openssl", ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-days", "2", "-subj", "/CN=bench.local", "-keyout", key, "-out", cert], {
      stdio: "ignore",
    });
  }

  return { key, cert };
}

function stats(values: number[]) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q: number) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
  const round = (value: number) => Math.round(value);
  return { n: sorted.length, min: round(sorted[0]), median: round(at(0.5)), max: round(sorted[sorted.length - 1]) };
}

/* In-page code is kept as plain strings: tsx rewrites TypeScript functions
   with a helper (__name) that does not exist inside the page. */
const IN_PAGE_LCP = `
  window.__lcp = 0;
  window.__lcpTag = "";
  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      window.__lcp = entry.startTime;
      window.__lcpTag = entry.element ? entry.element.tagName : "";
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });
`;

/* Resolves when every cover on the first screen has loaded: "firstCover" is
   the first one, "allFirstScreen" the last (both include decode, polled per
   frame), "responseEnd" the last of their downloads finishing. */
const IN_PAGE_WAIT_FOR_COVERS = `new Promise((resolve, reject) => {
  const deadline = performance.now() + 120000;
  let firstCover = 0;
  const check = () => {
    const visible = [...document.querySelectorAll("article img[alt$=' cover']")].filter((image) => {
      const rect = image.getBoundingClientRect();
      return rect.bottom > 0 && rect.top < window.innerHeight && rect.width > 0;
    });
    const loaded = visible.filter((image) => image.complete && image.naturalWidth > 0);
    if (!firstCover && loaded.length) firstCover = performance.now();
    if (visible.length && loaded.length === visible.length) {
      const urls = new Set(visible.map((image) => image.currentSrc));
      const responseEnd = Math.max(...performance.getEntriesByType("resource")
        .filter((entry) => urls.has(entry.name)).map((entry) => entry.responseEnd));
      resolve({ firstCover, allFirstScreen: performance.now(), responseEnd, count: visible.length });
      return;
    }
    if (performance.now() > deadline) { reject(new Error("covers did not load")); return; }
    requestAnimationFrame(check);
  };
  check();
})`;

/* LCP so far, and the cover bytes downloaded so far: every https:// resource
   is a cover, since every other host gets an empty 404. */
const IN_PAGE_TOTALS = `({
  lcp: window.__lcp,
  lcpTag: window.__lcpTag,
  transferred: performance.getEntriesByType("resource")
    .filter((entry) => entry.name.startsWith("https://"))
    .reduce((sum, entry) => sum + entry.encodedBodySize, 0),
})`;

async function timing() {
  const covers = await readJson<CoverFile[]>("covers.json");
  const byUrl = new Map(covers.map((cover) => [cover.src, cover]));
  const state: { mode: "before" | "after"; profile: Profile } = { mode: "before", profile: PROFILES[0] };
  const bodies = new Map<string, Buffer>();
  const body = async (name: string) => {
    if (!bodies.has(name)) bodies.set(name, await readFile(file("covers", name)));
    return bodies.get(name)!;
  };

  const tls = ensureCertificate();
  const server = http2.createSecureServer(
    { key: await readFile(tls.key), cert: await readFile(tls.cert), allowHTTP1: true },
    async (request, response) => {
      const url = `https://${request.headers[":authority"] ?? request.headers.host}${request.url}`;
      const cover = byUrl.get(url);

      if (!cover) {
        response.writeHead(404, { "timing-allow-origin": "*" }).end();
        return;
      }

      const useThumbnail = state.mode === "after" && !("skipped" in cover.thumbnails);
      const size = pickedThumbnail(state.profile);
      const payload = useThumbnail ? await body(`${cover.sha}.${size}.webp`) : await body(`${cover.sha}.orig`);
      response.writeHead(200, {
        "content-type": useThumbnail ? "image/webp" : cover.contentType,
        "content-length": payload.byteLength,
        "cache-control": "no-store",
        "timing-allow-origin": "*",
      });
      response.end(payload);
    }
  );
  await new Promise<void>((resolve) => server.listen(IMAGE_PORT, "127.0.0.1", resolve));

  const browser = await chromium.launch({
    args: [`--host-resolver-rules=MAP * 127.0.0.1:${IMAGE_PORT}, EXCLUDE localhost`],
  });
  const results: Record<string, Record<string, Record<string, number[]>>> = {};

  try {
    for (const profile of PROFILES) {
      results[profile.key] = { before: {}, after: {} };

      // Alternate the cases so drift on a shared machine hits both equally.
      for (let run = 0; run < RUNS * 2; run += 1) {
        const mode = run % 2 === 0 ? "before" : "after";
        state.mode = mode;
        state.profile = profile;

        const context = await browser.newContext({ ...profile.context, ignoreHTTPSErrors: true });
        const page = await context.newPage();
        const cdp = await context.newCDPSession(page);
        await cdp.send("Network.enable");
        await cdp.send("Network.setCacheDisabled", { cacheDisabled: true });
        await cdp.send("Network.emulateNetworkConditions", { offline: false, ...profile.network });
        let inFlight = 0;
        let lastActivity = Date.now();
        const track = (delta: number) => (request: { url(): string }) => {
          if (request.url().startsWith("https://")) {
            inFlight += delta;
            lastActivity = Date.now();
          }
        };
        page.on("request", track(1));
        page.on("requestfinished", track(-1));
        page.on("requestfailed", track(-1));
        await page.addInitScript(IN_PAGE_LCP);
        await page.goto(`${BASE}/hackathons`, { waitUntil: "commit" });
        const measured = (await page.evaluate(IN_PAGE_WAIT_FOR_COVERS)) as Record<string, number>;
        // Let LCP settle after the last cover paints.
        await page.waitForTimeout(300);
        const { lcp, lcpTag, transferred } = (await page.evaluate(IN_PAGE_TOTALS)) as {
          lcp: number;
          lcpTag: string;
          transferred: number;
        };

        // Then wait for the page to stop fetching covers (preloads and lazy
        // loading's look-ahead), to count what a first visit downloads.
        const settleDeadline = Date.now() + 120_000;
        while ((inFlight > 0 || Date.now() - lastActivity < 2000) && Date.now() < settleDeadline) {
          await page.waitForTimeout(250);
        }
        const settled = ((await page.evaluate(IN_PAGE_TOTALS)) as { transferred: number }).transferred;
        const settledAt = ((await page.evaluate("performance.now()")) as number) - 2000;

        for (const [key, value] of Object.entries({ ...measured, lcp, transferred, settled, settledAt })) {
          (results[profile.key][mode][key] ??= []).push(value);
        }

        console.log(
          `${profile.key} ${mode} run ${Math.floor(run / 2) + 1}: all first-screen covers ${Math.round(measured.allFirstScreen)} ms, ` +
            `first ${Math.round(measured.firstCover)} ms, LCP ${Math.round(lcp)} ms (${lcpTag}), cover bytes so far ${kb(transferred)}, ` +
            `settled ${kb(settled)} at ${Math.round(settledAt)} ms`
        );
        await context.close();
      }
    }
  } finally {
    await browser.close();
    server.close();
  }

  await writeFile(file("timing.json"), JSON.stringify(results, null, 2));

  console.log("\n| Profile | Metric | Before median (min–max) | After median (min–max) |\n| --- | --- | --- | --- |");

  for (const profile of PROFILES) {
    for (const metric of ["firstCover", "allFirstScreen", "responseEnd", "lcp", "settled", "settledAt"]) {
      const before = stats(results[profile.key].before[metric]);
      const after = stats(results[profile.key].after[metric]);
      console.log(`| ${profile.label} | ${metric} | ${before.median} (${before.min}–${before.max}) | ${after.median} (${after.min}–${after.max}) |`);
    }
  }
}

/* Checks that the originals downloaded above are the bytes a real browser
   gets from those CDNs (Luma's image CDN can negotiate the format from the
   Accept header), by loading the page on the real network and reading each
   cover response's size. Also counts what the page downloads in covers on a
   first visit (preloads + lazy loading's look-ahead), per profile. */
async function verify() {
  const covers = new Map((await readJson<CoverFile[]>("covers.json")).map((cover) => [cover.src, cover]));
  const browser = await chromium.launch();

  try {
    for (const profile of PROFILES) {
      const context = await browser.newContext(profile.context);
      const page = await context.newPage();
      const seen = new Map<string, { bytes: number; type: string }>();
      page.on("requestfinished", async (request) => {
        const cover = covers.get(request.url());
        if (!cover) return;
        const response = await request.response();
        seen.set(request.url(), { bytes: (await request.sizes()).responseBodySize, type: response?.headers()["content-type"] ?? "" });
      });
      await page.goto(`${BASE}/hackathons`, { waitUntil: "load" });
      await page.waitForTimeout(3000);
      let mismatches = 0;

      for (const [url, real] of seen) {
        const cover = covers.get(url)!;
        // Playwright's responseBodySize carries a little HTTP framing, so
        // allow 1%; a different format or size would be far off that.
        if (Math.abs(real.bytes - cover.bytes) > cover.bytes * 0.01 + 1500) {
          mismatches += 1;
          console.log(`  differs: browser got ${real.bytes} B ${real.type}, bench has ${cover.bytes} B ${cover.contentType}: ${url}`);
        }
      }

      const total = [...seen.values()].reduce((sum, entry) => sum + entry.bytes, 0);
      const after = [...seen.keys()].reduce((sum, url) => sum + servedBytes(covers.get(url)!, profile, "after"), 0);
      console.log(
        `${profile.key}: first visit downloaded ${seen.size} covers, ${kb(total)} (the same covers as thumbnails: ${kb(after)}); ` +
          `${mismatches} differ from the bench's copies`
      );
      await context.close();
    }
  } finally {
    await browser.close();
  }
}

const steps: Record<string, () => Promise<void>> = { discover, download, bytes, verify, timing };

async function main() {
  for (const step of command === "all" ? Object.keys(steps) : [command]) {
    console.log(`\n== ${step} ==`);
    await steps[step]();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
