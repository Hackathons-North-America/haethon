#!/usr/bin/env node
/* Benchmarks the homepage → Hackathons click against a production server.
   Results back docs/perf/2-instant-hackathons-nav.md.

   Usage (build first, then let the script own the server for cold runs):
     pnpm build
     pnpm start -p 3102 &
     node scripts/perf/hackathons-nav-bench.mjs nav --runs 15
     node scripts/perf/hackathons-nav-bench.mjs nav --runs 15 --click immediate
     node scripts/perf/hackathons-nav-bench.mjs nav --runs 15 --latency 100
     node scripts/perf/hackathons-nav-bench.mjs direct --runs 15
     node scripts/perf/hackathons-nav-bench.mjs ttfb --runs 30
     node scripts/perf/hackathons-nav-bench.mjs js
     # Cold: the script stops/starts `next start` itself and clears the data cache
     node scripts/perf/hackathons-nav-bench.mjs nav --runs 10 --cold

   "Cards visible" means the first hackathon card is in the viewport, fully
   opaque (cumulative ancestor opacity ≥ 0.95) and no longer covered by the
   app shell's full-screen wipe. "Cards in DOM" is when the card first exists,
   i.e. when the data arrived and React committed it. Both are measured inside
   the page with performance.now(), from the click event to the animation
   frame where the condition first holds. "First cover loaded" is when the
   first card's cover image has finished downloading and decoding its size.

   `direct` measures a direct visit to /hackathons instead: the same
   conditions, timed from the start of the navigation. Each run first opens
   /about in the same browser context so shared scripts are in the HTTP cache
   and Clerk's development-instance handshake redirect (which production
   instances don't do for signed-out visitors) has already happened. */
import { spawn } from "node:child_process";
import { rm } from "node:fs/promises";
import { gzipSync } from "node:zlib";

import { chromium } from "@playwright/test";

const [command = "nav", ...rest] = process.argv.slice(2);

function option(name, fallback) {
  const index = rest.indexOf(`--${name}`);

  if (index === -1) {
    return fallback;
  }

  const value = rest[index + 1];

  return value === undefined || value.startsWith("--") ? true : value;
}

const base = option("base", "http://localhost:3102");
const runs = Number(option("runs", 15));
const clickMode = option("click", "settled");
const latency = Number(option("latency", 0));
const cold = Boolean(option("cold", false));
const linkName = option("link", "Go to app");
const port = new URL(base).port || "3102";

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (q) => sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(q * sorted.length) - 1))];
  const round = (value) => Math.round(value * 10) / 10;

  return {
    n: sorted.length,
    min: round(sorted[0]),
    median: round(at(0.5)),
    p95: round(at(0.95)),
    max: round(sorted[sorted.length - 1]),
  };
}

async function isServerUp() {
  try {
    return (await fetch(`${base}/api/health`)).ok;
  } catch {
    return false;
  }
}

async function waitForServer() {
  for (let attempt = 0; attempt < 200; attempt += 1) {
    if (await isServerUp()) {
      return;
    }

    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  throw new Error(`Server at ${base} did not come up.`);
}

/* A cold server: no in-memory caches and no persisted data-cache entries, so
   the first render pays for every query it needs. Prerendered (static) output
   from the build is left alone — that is the deployed state too. */
async function startColdServer() {
  if (await isServerUp()) {
    throw new Error(`Something is already listening at ${base}; stop it before a --cold run.`);
  }

  await rm(".next/cache/fetch-cache", { force: true, recursive: true });

  const child = spawn("node_modules/.bin/next", ["start", "-p", port], { stdio: "ignore" });

  child.once("exit", () => {
    child.exited = true;
  });
  await waitForServer();

  return child;
}

async function stopServer(child) {
  if (!child || child.exited) {
    return;
  }

  const exited = new Promise((resolve) => child.once("exit", resolve));

  child.kill("SIGTERM");
  await exited;
}

/* Runs in the page. Starts timing on the click that targets /hackathons and
   polls each animation frame until the first card is really on screen. */
function installProbe(mode) {
  const probe = { clickAt: null, domAt: null, visibleAt: null, coverAt: null, hasCover: null, wipeSeen: false };

  window.__navProbe = probe;

  function cumulativeOpacity(element) {
    let opacity = 1;

    for (let node = element; node instanceof Element; node = node.parentElement) {
      opacity *= Number(getComputedStyle(node).opacity);
    }

    return opacity;
  }

  function coveredByWipe(rect) {
    for (const wipe of document.querySelectorAll("div.pointer-events-none.fixed.inset-0.bg-ink, [data-shell-wipe]")) {
      const style = getComputedStyle(wipe);

      if (style.display === "none" || style.visibility === "hidden" || Number(style.opacity) === 0) {
        continue;
      }

      probe.wipeSeen = true;

      const cover = wipe.getBoundingClientRect();

      if (cover.left < rect.right && cover.right > rect.left && cover.top < rect.bottom && cover.bottom > rect.top) {
        return true;
      }
    }

    return false;
  }

  function check() {
    const now = performance.now();
    const card = document.querySelector("main article");

    if (card) {
      probe.domAt ??= now - probe.clickAt;

      if (probe.visibleAt === null) {
        const rect = card.getBoundingClientRect();
        const onScreen = rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0;

        if (onScreen && cumulativeOpacity(card) >= 0.95 && !coveredByWipe(rect)) {
          probe.visibleAt = now - probe.clickAt;
        }
      }

      const cover = card.querySelector("img");

      probe.hasCover = Boolean(cover);

      if (cover && cover.complete && cover.naturalWidth > 0) {
        probe.coverAt ??= now - probe.clickAt;
      }

      if (probe.visibleAt !== null && (probe.coverAt !== null || !cover)) {
        return;
      }
    }

    requestAnimationFrame(check);
  }

  if (mode === "load") {
    // Direct visit: time from the start of this document's navigation.
    if (location.pathname === "/hackathons") {
      probe.clickAt = 0;
      requestAnimationFrame(check);
    }

    return;
  }

  document.addEventListener(
    "click",
    (event) => {
      const link = event.target instanceof Element ? event.target.closest('a[href="/hackathons"]') : null;

      if (link && probe.clickAt === null) {
        probe.clickAt = performance.now();
        requestAnimationFrame(check);
      }
    },
    true
  );
}

async function benchNavigation() {
  const browser = await chromium.launch();
  const results = { dom: [], visible: [], cover: [], requestsAfterClick: [], documentNavigations: 0, wipeSeen: 0 };
  let server = null;

  try {
    for (let run = 0; run < runs; run += 1) {
      if (cold) {
        await stopServer(server);
        server = await startColdServer();
      }

      // A fresh context per run: empty HTTP cache, empty router cache.
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();

      if (latency > 0) {
        const session = await context.newCDPSession(page);

        await session.send("Network.enable");
        await session.send("Network.emulateNetworkConditions", {
          offline: false,
          latency,
          downloadThroughput: (10 * 1024 * 1024) / 8,
          uploadThroughput: (5 * 1024 * 1024) / 8,
        });
      }

      await page.addInitScript(installProbe, "click");

      let clicked = false;
      let requestsAfterClick = 0;
      let documentNavigation = false;

      page.on("request", (request) => {
        if (!clicked) {
          return;
        }

        const url = new URL(request.url());

        // Same-origin app requests only; images, Clerk and analytics are
        // not what makes the cards appear.
        if (url.origin === new URL(base).origin && !url.pathname.startsWith("/_next/image")) {
          requestsAfterClick += 1;
        }

        if (request.isNavigationRequest()) {
          documentNavigation = true;
        }
      });

      await page.goto(`${base}/`, { waitUntil: clickMode === "settled" ? "networkidle" : "load" });

      const link = page.getByRole("link", { name: linkName }).first();

      if (clickMode === "settled") {
        // Let viewport prefetches finish, like a visitor who read the hero.
        await page.waitForTimeout(1500);
      } else {
        // Click as early as React can handle it: the link has been hydrated.
        await link.evaluate(
          (node) =>
            new Promise((resolve) => {
              const ready = () => Object.keys(node).some((key) => key.startsWith("__reactProps"));
              const poll = () => (ready() ? resolve() : requestAnimationFrame(poll));

              poll();
            })
        );
      }

      clicked = true;
      await link.click();
      await page.waitForFunction(() => window.__navProbe?.visibleAt !== null && window.__navProbe?.visibleAt !== undefined, null, {
        timeout: 30_000,
      });

      const probe = await readProbe(page);

      results.dom.push(probe.domAt);
      results.visible.push(probe.visibleAt);
      if (probe.coverAt !== null) results.cover.push(probe.coverAt);
      results.requestsAfterClick.push(requestsAfterClick);
      results.documentNavigations += documentNavigation ? 1 : 0;
      results.wipeSeen += probe.wipeSeen ? 1 : 0;

      await context.close();
    }
  } finally {
    await browser.close();
    await stopServer(server);
  }

  console.log(
    JSON.stringify(
      {
        scenario: { cold, clickMode, latencyMs: latency, link: linkName, runs },
        clickToCardsInDomMs: stats(results.dom),
        clickToCardsVisibleMs: stats(results.visible),
        clickToFirstCoverLoadedMs: results.cover.length ? stats(results.cover) : null,
        sameOriginRequestsAfterClick: stats(results.requestsAfterClick),
        runsThatFellBackToDocumentNavigation: results.documentNavigations,
        runsWhereTheShellWipeCoveredTheCards: results.wipeSeen,
      },
      null,
      2
    )
  );
}

/* Waits for the cover image too (up to 20s; it is a remote file), so a slow
   image shows up as a slow number rather than a missing one. */
async function readProbe(page) {
  await page
    .waitForFunction(() => window.__navProbe.hasCover === false || window.__navProbe.coverAt !== null, null, { timeout: 20_000 })
    .catch(() => {});

  return page.evaluate(() => window.__navProbe);
}

async function benchDirectVisit() {
  const browser = await chromium.launch();
  const results = { dom: [], visible: [], cover: [], responseStart: [] };

  try {
    for (let run = 0; run < runs; run += 1) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
      const page = await context.newPage();

      await page.addInitScript(installProbe, "load");
      await page.goto(`${base}/about`, { waitUntil: "networkidle" });
      await page.goto(`${base}/hackathons`, { waitUntil: "commit" });
      await page.waitForFunction(() => window.__navProbe?.visibleAt !== null && window.__navProbe?.visibleAt !== undefined, null, {
        timeout: 30_000,
      });

      const probe = await readProbe(page);

      results.dom.push(probe.domAt);
      results.visible.push(probe.visibleAt);
      if (probe.coverAt !== null) results.cover.push(probe.coverAt);
      results.responseStart.push(await page.evaluate(() => performance.getEntriesByType("navigation")[0].responseStart));

      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(
    JSON.stringify(
      {
        scenario: { directVisit: "/hackathons", warmHttpCache: true, runs },
        navigationStartToResponseStartMs: stats(results.responseStart),
        navigationStartToCardsInDomMs: stats(results.dom),
        navigationStartToCardsVisibleMs: stats(results.visible),
        navigationStartToFirstCoverLoadedMs: results.cover.length ? stats(results.cover) : null,
      },
      null,
      2
    )
  );
}

async function timeToFirstByte(path, headers = {}) {
  const started = performance.now();
  const response = await fetch(`${base}${path}`, { headers, redirect: "manual" });
  const reader = response.body.getReader();

  await reader.read();

  const elapsed = performance.now() - started;

  await reader.cancel();

  return { elapsed, status: response.status };
}

async function benchTtfb() {
  let server = null;
  const output = {};

  try {
    if (cold) {
      const samples = [];

      for (let run = 0; run < runs; run += 1) {
        await stopServer(server);
        server = await startColdServer();
        samples.push((await timeToFirstByte("/hackathons")).elapsed);
      }

      output.coldDocumentTtfbMs = stats(samples);
    } else {
      // One unmeasured request so "warm" never includes a first-hit compile.
      await timeToFirstByte("/hackathons");

      const documentSamples = [];

      for (let run = 0; run < runs; run += 1) {
        const sample = await timeToFirstByte("/hackathons");

        if (sample.status !== 200) {
          throw new Error(`/hackathons answered ${sample.status}, not 200.`);
        }

        documentSamples.push(sample.elapsed);
      }

      output.warmDocumentTtfbMs = stats(documentSamples);
    }
  } finally {
    await stopServer(server);
  }

  console.log(JSON.stringify(output, null, 2));
}

/* First-load JS: every script the server-rendered document asks for (the
   Turbopack build output no longer prints this), gzipped the way a CDN would. */
async function measureFirstLoadJs() {
  const output = {};

  for (const path of ["/", "/hackathons"]) {
    const html = await (await fetch(`${base}${path}`)).text();
    const sources = new Set(
      [...html.matchAll(/<script[^>]+src="([^"]+)"/g)].map((match) => match[1].replaceAll("&amp;", "&"))
    );
    let raw = 0;
    let gzip = 0;

    for (const source of sources) {
      const body = Buffer.from(await (await fetch(new URL(source, base))).arrayBuffer());

      raw += body.length;
      gzip += gzipSync(body).length;
    }

    output[path] = {
      scripts: sources.size,
      rawKb: Math.round((raw / 1024) * 10) / 10,
      gzipKb: Math.round((gzip / 1024) * 10) / 10,
      htmlGzipKb: Math.round((gzipSync(Buffer.from(html)).length / 1024) * 10) / 10,
    };
  }

  console.log(JSON.stringify(output, null, 2));
}

if (command === "nav") {
  await benchNavigation();
} else if (command === "direct") {
  await benchDirectVisit();
} else if (command === "ttfb") {
  await benchTtfb();
} else if (command === "js") {
  await measureFirstLoadJs();
} else {
  console.error(`Unknown command "${command}". Use nav, direct, ttfb, or js.`);
  process.exit(1);
}
