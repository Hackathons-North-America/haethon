/* Query-level timings for the public catalog, through the app's real driver
   (Neon HTTP) and its real query code, without Next's cache in the way.

     pnpm exec tsx --env-file=.env.local scripts/perf/catalog-bench.ts
     BENCH_RUNS=30 BENCH_PRINT_PLAN=1 pnpm exec tsx --env-file=.env.local scripts/perf/catalog-bench.ts

   Read-only. Reports, over BENCH_RUNS runs (default 15):
     - the bare network round trip to the database (`select 1`)
     - loading the catalog snapshot: wall time, HTTP requests, sequential round
       trips, and the statement's own planning/execution time (EXPLAIN ANALYZE)
     - selecting a page from the loaded snapshot for each search scenario
       (pure CPU — this is all a search costs once the snapshot is cached) */
import { neon } from "@neondatabase/serverless";

import { loadCatalogSnapshot } from "@/lib/hackathons/catalog";
import { selectCatalogPage, type CatalogPageQuery } from "@/lib/hackathons/catalog-snapshot";

const RUNS = Number(process.env.BENCH_RUNS ?? 15);

type Call = { start: number; end: number; body: string };
const calls: Call[] = [];
const realFetch = globalThis.fetch;

globalThis.fetch = async (input, init) => {
  const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
  const start = performance.now();
  const response = await realFetch(input, init);

  if (url.includes("neon.tech")) {
    calls.push({ start, end: performance.now(), body: typeof init?.body === "string" ? init.body : "" });
  }

  return response;
};

function stats(values: number[], digits = 2) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p: number) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];

  return {
    median: +at(0.5).toFixed(digits),
    p95: +at(0.95).toFixed(digits),
    min: +sorted[0].toFixed(digits),
    max: +sorted[sorted.length - 1].toFixed(digits),
  };
}

/* Requests that start after an earlier one finished form a new sequential wave. */
function sequentialWaves(batch: Call[]) {
  let waves = 0;
  let waveEnd = -1;

  for (const call of [...batch].sort((a, b) => a.start - b.start)) {
    if (call.start >= waveEnd) {
      waves += 1;
      waveEnd = call.end;
    } else {
      waveEnd = Math.min(waveEnd, call.end);
    }
  }

  return waves;
}

const base: CatalogPageQuery = {
  name: "",
  countries: [],
  format: null,
  beginnerFriendly: null,
  travelReimbursement: null,
  highSchoolersOnly: null,
  startsAfter: null,
  startsBefore: null,
  limit: 30,
  offset: 0,
  sort: "soonest",
};

const scenarios: Record<string, CatalogPageQuery> = {
  unfiltered: base,
  canada: { ...base, countries: ["Canada"] },
  "united-states": { ...base, countries: ["United States"] },
  "text+country (q=hack, US)": { ...base, name: "hack", countries: ["United States"] },
  "north-america preset": { ...base, countries: ["Canada", "United States"], format: "in_person" },
  "unfiltered top-voted": { ...base, sort: "top" },
};

async function main() {
  const sql = neon(process.env.DATABASE_URL!);

  // Warm the database compute and the connection pool first.
  await sql.query("select 1");
  await sql.query("select 1");

  const pings: number[] = [];

  for (let i = 0; i < RUNS; i += 1) {
    const t = performance.now();
    await sql.query("select 1");
    pings.push(performance.now() - t);
  }

  console.log("neon http round trip (select 1), ms:", JSON.stringify(stats(pings)));

  const loadWall: number[] = [];
  let statements: { query: string; params: unknown[] }[] = [];
  let requests = 0;
  let waves = 0;
  let snapshot = await loadCatalogSnapshot();

  for (let i = 0; i < RUNS; i += 1) {
    calls.length = 0;
    const t = performance.now();
    snapshot = await loadCatalogSnapshot();
    loadWall.push(performance.now() - t);
    requests = calls.length;
    waves = sequentialWaves(calls);
    statements = calls.map((call) => JSON.parse(call.body) as { query: string; params: unknown[] });
  }

  const exec: number[] = Array.from({ length: RUNS }, () => 0);
  const plan: number[] = Array.from({ length: RUNS }, () => 0);

  for (const statement of statements) {
    for (let i = 0; i < RUNS; i += 1) {
      const rows = (await sql.query(
        `explain (analyze, buffers, format json) ${statement.query}`,
        statement.params
      )) as { "QUERY PLAN": { "Execution Time": number; "Planning Time": number }[] }[];

      exec[i] += rows[0]["QUERY PLAN"][0]["Execution Time"];
      plan[i] += rows[0]["QUERY PLAN"][0]["Planning Time"];
    }
  }

  console.log(
    JSON.stringify({
      step: "load snapshot (once per cache lifetime)",
      entries: snapshot.length,
      jsonBytes: JSON.stringify(snapshot).length,
      httpRequests: requests,
      sequentialRoundTrips: waves,
      wallMs: stats(loadWall),
      sqlExecMs: stats(exec),
      sqlPlanMs: stats(plan),
    })
  );

  if (process.env.BENCH_PRINT_PLAN) {
    for (const statement of statements) {
      const rows = (await sql.query(`explain (analyze, buffers) ${statement.query}`, statement.params)) as {
        "QUERY PLAN": string;
      }[];

      console.log(`--- statement\n${statement.query}\n--- plan\n${rows.map((row) => row["QUERY PLAN"]).join("\n")}`);
    }
  }

  // What the cache hands back is the JSON round trip of the snapshot.
  const cached = JSON.parse(JSON.stringify(snapshot)) as typeof snapshot;

  for (const [label, query] of Object.entries(scenarios)) {
    const micros: number[] = [];
    let cards = 0;

    // Enough iterations that the JIT has settled before the measured runs.
    for (let i = 0; i < 200; i += 1) {
      selectCatalogPage(cached, query, new Date());
    }

    for (let i = 0; i < Math.max(RUNS, 100); i += 1) {
      const t = performance.now();
      cards = selectCatalogPage(cached, query, new Date()).cards.length;
      micros.push((performance.now() - t) * 1000);
    }

    console.log(
      JSON.stringify({
        scenario: label,
        cards,
        httpRequests: 0,
        sequentialRoundTrips: 0,
        selectMicroseconds: stats(micros, 0),
      })
    );
  }
}

main().then(
  () => process.exit(0),
  (error) => {
    console.error(error);
    process.exit(1);
  }
);
