/* End-to-end timings for the catalog search API and the /hackathons page.

   Run against a production build, never `next dev`:
     pnpm build && pnpm start -p 3101
     node scripts/perf/catalog-http-bench.mjs            # BASE_URL, BENCH_RUNS optional

   Each scenario is timed two ways with `curl -w`:
     repeat — the same URL every run (the steady state once a cache is warm)
     fresh  — a filter combination the server has not seen before on every run.
              A random hour-aligned `startsAfter` far in the past changes the
              request's cache identity without changing which rows match
              (every public hackathon has dates after 1990), so this is what a
              visitor's first use of any given filter combination costs.

   The page takes its date filter as a named period, so its "fresh" row uses a
   different name search per run instead (PAGE_TERMS). Those are only fresh
   once per server cache lifetime: restart the server with an empty
   .next/cache/fetch-cache before re-running. */
import { execFileSync } from "node:child_process";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3101";
const RUNS = Number(process.env.BENCH_RUNS ?? 15);

const scenarios = [
  { label: "unfiltered", params: [] },
  { label: "canada", params: [["countries", "Canada"]] },
  { label: "united-states", params: [["countries", "United States"]] },
  { label: "text+country (q=hack, US)", params: [["q", "hack"], ["countries", "United States"]] },
  {
    label: "north-america preset",
    params: [["countries", "Canada"], ["countries", "United States"], ["format", "in_person"]],
  },
];

/* Substrings of real hackathon names, one per run. */
const PAGE_TERMS = [
  "hack", "ha", "ac", "ck", "a", "e", "i", "o", "u", "t", "n", "s", "r", "th", "on",
  "an", "in", "er", "at", "es", "un", "co", "de", "te", "ch", "ai", "la", "ni", "h", "c",
];

function curl(url) {
  const out = execFileSync(
    "curl",
    ["-s", "-o", "/dev/null", "-w", "%{http_code} %{time_starttransfer} %{time_total} %{size_download}", url],
    { encoding: "utf8" }
  );
  const [status, ttfb, total, bytes] = out.trim().split(" ");

  if (status !== "200") {
    throw new Error(`${url} -> HTTP ${status}`);
  }

  return { ttfb: Number(ttfb) * 1000, total: Number(total) * 1000, bytes: Number(bytes) };
}

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];

  return `median ${at(0.5).toFixed(1)} / p95 ${at(0.95).toFixed(1)} / min ${sorted[0].toFixed(1)} / max ${sorted.at(-1).toFixed(1)}`;
}

/* A never-before-used hour between 1900 and 1990. */
function freshStartsAfter() {
  const hour = Math.floor(Math.random() * 780_000);

  return new Date(Date.UTC(1900, 0, 1) + hour * 3_600_000).toISOString();
}

function url(path, params, fresh) {
  const search = new URLSearchParams(params);

  if (path === "/api/hackathons") {
    search.set("limit", "30");
    search.set("offset", "0");
  }

  if (fresh) {
    search.set("startsAfter", freshStartsAfter());
  }

  const query = search.toString();

  return `${BASE_URL}${path}${query ? `?${query}` : ""}`;
}

function measure(label, makeUrl, warmup = true) {
  if (warmup) {
    // One unmeasured request so route compilation / module load is excluded.
    curl(makeUrl());
  }

  const ttfb = [];
  const total = [];
  let bytes = 0;

  for (let i = 0; i < RUNS; i += 1) {
    const result = curl(makeUrl());
    ttfb.push(result.ttfb);
    total.push(result.total);
    bytes = result.bytes;
  }

  console.log(`${label.padEnd(58)} TTFB ${stats(ttfb)} | total ${stats(total)} | ${bytes} B`);
}

console.log(`base ${BASE_URL}, ${RUNS} runs each, ms\n`);

for (const scenario of scenarios) {
  measure(`API  ${scenario.label} [repeat]`, () => url("/api/hackathons", scenario.params, false));
  measure(`API  ${scenario.label} [fresh]`, () => url("/api/hackathons", scenario.params, true));
}

console.log("");

for (const scenario of scenarios) {
  measure(`PAGE ${scenario.label} [repeat]`, () => url("/hackathons", scenario.params, false));
}

let term = 0;

measure(
  "PAGE text+country (q=<new term>, CA+US) [fresh]",
  () =>
    url(
      "/hackathons",
      [["q", PAGE_TERMS[term++ % PAGE_TERMS.length]], ["countries", "Canada"], ["countries", "United States"]],
      false
    ),
  false
);
