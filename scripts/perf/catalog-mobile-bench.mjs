#!/usr/bin/env node
/* Measures how much JavaScript /hackathons (and /) make a phone download and
   run before the page is interactive. Results back docs/perf/6-js-bundle.md.

   Usage (production build, Node 24 like Vercel):
     pnpm build
     npx -y node@24 node_modules/next/dist/bin/next start -p 3122 &
     node scripts/perf/catalog-mobile-bench.mjs js
     node scripts/perf/catalog-mobile-bench.mjs mobile --runs 10
     node scripts/perf/catalog-mobile-bench.mjs tap --at 6000 --runs 10

   `js` counts the scripts the served HTML asks for (every <script src> except
   the nomodule polyfill, plus <link rel="preload" as="script">), gzipped
   the way a CDN would, split into this app's chunks and third-party files.

   `mobile` loads /hackathons in a fresh browser context per run (empty HTTP
   cache) with a phone viewport, 4× CPU throttling and Lighthouse's "Slow 4G"
   network (150 ms RTT, 1.6 Mbps down, 750 Kbps up), and reports:
   - FCP, LCP (on a phone this is normally the first card's cover), the load
     event, and "cards visible": the first card is on screen, fully opaque and
     no longer under the app shell's entrance wipe (same probe as
     hackathons-nav-bench.mjs).
   - Hydrated: the filter bar's form has React props attached, i.e. a tap on
     it would be handled.
   - TBT: sum of (long task − 50 ms) between FCP and TTI. TTI is the end of the
     last long task before a 5 s window with none, as Lighthouse defines it
     (without its network-quiet condition).
   - JS downloaded before TTI, and in total by the time the page went quiet,
     by origin.

   `tap` uses the same phone, CPU and network, taps the search bar's Date
   field --at milliseconds after navigation start, and times the tap → the
   Date dropdown fully shown (opacity ≥ 0.95). That is the first-open delay
   when the dropdowns' lazy chunk is not loaded yet. */
import { gzipSync } from "node:zlib";

import { chromium } from "@playwright/test";

const [command = "mobile", ...rest] = process.argv.slice(2);

function option(name, fallback) {
  const index = rest.indexOf(`--${name}`);

  if (index === -1) {
    return fallback;
  }

  const value = rest[index + 1];

  return value === undefined || value.startsWith("--") ? true : value;
}

const base = option("base", "http://localhost:3122");
const runs = Number(option("runs", 10));
const path = option("path", "/hackathons");
const cpuRate = Number(option("cpu", 4));
const tapAt = Number(option("at", 6000));
const QUIET_WINDOW_MS = 5000;
const MAX_WAIT_MS = 30_000;

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

const kb = (bytes) => Math.round((bytes / 1024) * 10) / 10;

/* ---------- js ---------- */

async function measureServedJs() {
  const output = {};

  for (const route of ["/", "/hackathons"]) {
    const html = await (await fetch(`${base}${route}`)).text();
    const scripts = [...html.matchAll(/<script\b[^>]*>/g)]
      .map((match) => match[0])
      .filter((tag) => /\bsrc="/.test(tag) && !/noModule|nomodule/.test(tag))
      .map((tag) => tag.match(/\bsrc="([^"]+)"/)[1]);
    const preloads = [...html.matchAll(/<link\b[^>]*rel="preload"[^>]*>/g)]
      .map((match) => match[0])
      .filter((tag) => /as="script"/.test(tag))
      .map((tag) => tag.match(/\bhref="([^"]+)"/)[1]);
    const sources = [...new Set([...scripts, ...preloads].map((source) => source.replaceAll("&amp;", "&")))];
    const groups = { app: { files: 0, raw: 0, gzip: 0 }, thirdParty: {} };

    for (const source of sources) {
      const url = new URL(source, base);
      const body = Buffer.from(await (await fetch(url, { redirect: "follow" })).arrayBuffer());
      const gzip = gzipSync(body).length;

      if (url.origin === new URL(base).origin) {
        groups.app.files += 1;
        groups.app.raw += body.length;
        groups.app.gzip += gzip;
      } else {
        const name = url.pathname.split("/").pop();

        groups.thirdParty[`${url.hostname}/…/${name}${preloads.includes(source) ? " (preload)" : ""}`] = {
          rawKb: kb(body.length),
          gzipKb: kb(gzip),
        };
      }
    }

    const thirdPartyGzip = Object.values(groups.thirdParty).reduce((sum, entry) => sum + entry.gzipKb, 0);

    output[route] = {
      app: { scripts: groups.app.files, rawKb: kb(groups.app.raw), gzipKb: kb(groups.app.gzip) },
      thirdParty: groups.thirdParty,
      totalGzipKb: Math.round((kb(groups.app.gzip) + thirdPartyGzip) * 10) / 10,
    };
  }

  console.log(JSON.stringify(output, null, 2));
}

/* ---------- mobile ---------- */

/* Runs in the page before any of its scripts. */
function installProbe() {
  const probe = { fcp: null, lcp: null, visibleAt: null, hydratedAt: null, longTasks: [] };

  window.__mobileProbe = probe;

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      probe.longTasks.push({ start: entry.startTime, duration: entry.duration });
    }
  }).observe({ type: "longtask", buffered: true });

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      if (entry.name === "first-contentful-paint") {
        probe.fcp = entry.startTime;
      }
    }
  }).observe({ type: "paint", buffered: true });

  new PerformanceObserver((list) => {
    for (const entry of list.getEntries()) {
      probe.lcp = entry.startTime;
    }
  }).observe({ type: "largest-contentful-paint", buffered: true });

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

    if (card && probe.visibleAt === null) {
      const rect = card.getBoundingClientRect();
      const onScreen = rect.width > 0 && rect.height > 0 && rect.top < innerHeight && rect.bottom > 0;

      if (onScreen && cumulativeOpacity(card) >= 0.95 && !coveredByWipe(rect)) {
        probe.visibleAt = now;
      }
    }

    const form = document.querySelector('section[aria-label="Hackathon filters"] form');

    if (form && probe.hydratedAt === null && Object.keys(form).some((key) => key.startsWith("__reactProps"))) {
      probe.hydratedAt = now;
    }

    if (probe.visibleAt === null || probe.hydratedAt === null) {
      requestAnimationFrame(check);
    }
  }

  requestAnimationFrame(check);
}

function timeToInteractive(fcp, longTasks, now) {
  let tti = fcp;

  for (const task of [...longTasks].sort((a, b) => a.start - b.start)) {
    if (task.start < fcp) {
      tti = Math.max(tti, task.start + task.duration);
      continue;
    }

    if (task.start - tti >= QUIET_WINDOW_MS) {
      break;
    }

    tti = task.start + task.duration;
  }

  // Not settled yet if the page hasn't been quiet for the window.
  return now - tti >= QUIET_WINDOW_MS ? tti : null;
}

function totalBlockingTime(fcp, tti, longTasks) {
  return longTasks
    .filter((task) => task.start >= fcp && task.start + task.duration <= tti + 1)
    .reduce((sum, task) => sum + Math.max(0, task.duration - 50), 0);
}

async function newPhonePage(browser) {
  const context = await browser.newContext({
    viewport: { width: 412, height: 915 },
    deviceScaleFactor: 2.625,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36",
  });
  const page = await context.newPage();
  const session = await context.newCDPSession(page);

  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 150,
    downloadThroughput: (1.6 * 1024 * 1024) / 8,
    uploadThroughput: (750 * 1024) / 8,
  });
  await session.send("Emulation.setCPUThrottlingRate", { rate: cpuRate });

  return { context, page, session };
}

async function benchTap() {
  const browser = await chromium.launch();
  const delays = [];

  try {
    for (let run = 0; run < runs; run += 1) {
      const { context, page } = await newPhonePage(browser);

      await page.goto(`${base}${path}`, { waitUntil: "commit", timeout: 120_000 });

      const field = page.getByRole("button", { name: "Date", exact: true });

      // Hydrated, so the tap is handled rather than lost.
      await field.evaluate(
        (node) =>
          new Promise((resolve) => {
            const poll = () =>
              Object.keys(node).some((key) => key.startsWith("__reactProps")) ? resolve() : requestAnimationFrame(poll);

            poll();
          })
      );

      const now = await page.evaluate(() => performance.now());

      if (now < tapAt) {
        await page.waitForTimeout(tapAt - now);
      }

      await page.evaluate(() => {
        window.__tapProbe = { tapAt: null, shownAt: null };
        document.addEventListener("pointerdown", () => (window.__tapProbe.tapAt ??= performance.now()), {
          capture: true,
          once: true,
        });

        function check() {
          const panel = document.getElementById("hackathon-date-popover");

          if (panel && window.__tapProbe.tapAt !== null) {
            let opacity = 1;

            for (let node = panel; node instanceof Element; node = node.parentElement) {
              opacity *= Number(getComputedStyle(node).opacity);
            }

            const contents = panel.firstElementChild;

            if (opacity >= 0.95 && contents && Number(getComputedStyle(contents).opacity) >= 0.95) {
              window.__tapProbe.shownAt = performance.now();
              return;
            }
          }

          requestAnimationFrame(check);
        }

        requestAnimationFrame(check);
      });
      await field.tap();
      await page.waitForFunction(() => window.__tapProbe.shownAt !== null, null, { timeout: 60_000 });

      const probe = await page.evaluate(() => window.__tapProbe);

      delays.push(probe.shownAt - probe.tapAt);
      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(
    JSON.stringify(
      {
        scenario: { path, runs, tapAtMs: tapAt, cpuThrottling: cpuRate, network: "150 ms RTT, 1.6 Mbps down, 750 Kbps up" },
        tapToDateDropdownShownMs: stats(delays),
      },
      null,
      2
    )
  );
}

async function benchMobile() {
  const browser = await chromium.launch();
  const results = {
    fcp: [],
    lcp: [],
    load: [],
    visible: [],
    hydrated: [],
    tti: [],
    tbt: [],
    longTaskCount: [],
    appJsBeforeTtiKb: [],
    thirdPartyJsBeforeTtiKb: [],
    appJsTotalKb: [],
    thirdPartyJsTotalKb: [],
  };

  try {
    for (let run = 0; run < runs; run += 1) {
      const { context, page, session } = await newPhonePage(browser);

      /* Encoded (over-the-wire) bytes of every script response, and when it
         finished relative to navigation start. */
      const scripts = new Map();
      let navigationStartWallMs = null;

      session.on("Network.responseReceived", (event) => {
        if (event.type === "Script") {
          scripts.set(event.requestId, { url: event.response.url, bytes: 0, finishedAt: null });
        }
      });
      session.on("Network.loadingFinished", (event) => {
        const script = scripts.get(event.requestId);

        if (script) {
          script.bytes = event.encodedDataLength;
          script.finishedAt = event.timestamp * 1000;
        }
      });
      session.on("Network.requestWillBeSent", (event) => {
        if (event.type === "Document" && navigationStartWallMs === null) {
          navigationStartWallMs = event.timestamp * 1000;
        }
      });

      await page.addInitScript(installProbe);
      await page.goto(`${base}${path}`, { waitUntil: "load", timeout: 120_000 });

      const started = Date.now();
      let probe = null;
      let tti = null;

      while (Date.now() - started < MAX_WAIT_MS) {
        await page.waitForTimeout(500);
        probe = await page.evaluate(() => ({
          ...window.__mobileProbe,
          load: performance.getEntriesByType("navigation")[0]?.loadEventStart ?? null,
          now: performance.now(),
        }));

        if (probe.fcp !== null && probe.visibleAt !== null && probe.hydratedAt !== null) {
          tti = timeToInteractive(probe.fcp, probe.longTasks, probe.now);

          if (tti !== null) {
            break;
          }
        }
      }

      if (tti === null) {
        throw new Error(`Run ${run + 1}: page never went quiet for ${QUIET_WINDOW_MS} ms.`);
      }

      let appBefore = 0;
      let thirdBefore = 0;
      let appTotal = 0;
      let thirdTotal = 0;

      for (const script of scripts.values()) {
        const sameOrigin = new URL(script.url).origin === new URL(base).origin;
        const at = script.finishedAt !== null && navigationStartWallMs !== null ? script.finishedAt - navigationStartWallMs : Infinity;

        if (sameOrigin) {
          appTotal += script.bytes;
          if (at <= tti) appBefore += script.bytes;
        } else {
          thirdTotal += script.bytes;
          if (at <= tti) thirdBefore += script.bytes;
        }
      }

      results.fcp.push(probe.fcp);
      if (probe.lcp !== null) results.lcp.push(probe.lcp);
      results.load.push(probe.load);
      results.visible.push(probe.visibleAt);
      results.hydrated.push(probe.hydratedAt);
      results.tti.push(tti);
      results.tbt.push(totalBlockingTime(probe.fcp, tti, probe.longTasks));
      results.longTaskCount.push(probe.longTasks.filter((task) => task.start + task.duration <= tti + 1).length);
      results.appJsBeforeTtiKb.push(kb(appBefore));
      results.thirdPartyJsBeforeTtiKb.push(kb(thirdBefore));
      results.appJsTotalKb.push(kb(appTotal));
      results.thirdPartyJsTotalKb.push(kb(thirdTotal));

      await context.close();
    }
  } finally {
    await browser.close();
  }

  console.log(
    JSON.stringify(
      {
        scenario: { path, runs, cpuThrottling: cpuRate, network: "150 ms RTT, 1.6 Mbps down, 750 Kbps up" },
        fcpMs: stats(results.fcp),
        lcpMs: stats(results.lcp),
        loadEventMs: stats(results.load),
        cardsVisibleMs: stats(results.visible),
        hydratedMs: stats(results.hydrated),
        ttiMs: stats(results.tti),
        tbtMs: stats(results.tbt),
        longTasksBeforeTti: stats(results.longTaskCount),
        appJsBeforeTtiKb: stats(results.appJsBeforeTtiKb),
        thirdPartyJsBeforeTtiKb: stats(results.thirdPartyJsBeforeTtiKb),
        appJsTotalKb: stats(results.appJsTotalKb),
        thirdPartyJsTotalKb: stats(results.thirdPartyJsTotalKb),
      },
      null,
      2
    )
  );
}

if (command === "js") {
  await measureServedJs();
} else if (command === "mobile") {
  await benchMobile();
} else if (command === "tap") {
  await benchTap();
} else {
  console.error(`Unknown command "${command}". Use js, mobile or tap.`);
  process.exit(1);
}
