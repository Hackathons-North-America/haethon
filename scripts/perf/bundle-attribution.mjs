#!/usr/bin/env node
/* What a route's first-load JavaScript is made of, by package and by app file.
   Results back docs/perf/6-js-bundle.md.

   Uses Next's own bundle analyzer (Turbopack only), which records every
   module in every output chunk with its gzipped size, and which chunks a route
   loads before it renders (bootstrap and render-dependent groups) versus
   later (async groups: next/dynamic, import()).

   Usage:
     npx -y node@24 node_modules/next/dist/bin/next analyze -o --snapshot after
     node scripts/perf/bundle-attribution.mjs --snapshot after --route /hackathons

   Sizes are each module gzipped on its own, so the totals run a little above
   the gzip of the real chunks (one stream compresses better than many small
   ones). Use them to rank contributors; take served byte counts from
   catalog-mobile-bench.mjs js. */
import { execFileSync } from "node:child_process";

const args = process.argv.slice(2);

function option(name, fallback) {
  const index = args.indexOf(`--${name}`);

  return index === -1 ? fallback : args[index + 1];
}

const snapshot = option("snapshot", undefined);
const route = option("route", "/hackathons");
const top = Number(option("top", 15));

const lines = execFileSync(
  "node_modules/.bin/next",
  ["analyze", "export", "--route", route, ...(snapshot ? ["--snapshot", snapshot] : [])],
  { encoding: "utf8", maxBuffer: 1024 * 1024 * 1024 }
).split("\n");

const groups = [];
const partsByFile = new Map();

for (const line of lines) {
  if (!line.trim()) {
    continue;
  }

  const record = JSON.parse(line);

  if (record.type === "group") {
    groups.push(record);
  } else if (record.type === "part") {
    if (!partsByFile.has(record.filename)) {
      partsByFile.set(record.filename, []);
    }

    partsByFile.get(record.filename).push(record);
  }
}

const isClientJs = (file) => file.startsWith("[client-fs]") && file.endsWith(".js");
const initialFiles = new Set(
  groups.filter((group) => group.kind === "bootstrap" || group.kind === "render_dependent").flatMap((group) => group.outputs.filter(isClientJs))
);

function contributor(source) {
  if (source.includes("/node_modules/next/")) {
    return /compiled\/(react|react-dom|scheduler|react-server-dom)/.test(source) ? "React + React DOM" : "Next.js runtime";
  }

  if (/@clerk|@tanstack/.test(source)) {
    return "Clerk SDK (+ TanStack Query)";
  }

  const pkg = source.match(/node_modules\/(?:\.pnpm\/[^/]+\/node_modules\/)?((?:@[^/]+\/)?[^/]+)/);

  if (pkg) {
    return pkg[1];
  }

  return source.startsWith("[turbopack]") ? "Turbopack runtime" : `app: ${source.replace("[project]/", "")}`;
}

function tally(files) {
  const totals = new Map();

  for (const file of files) {
    for (const part of partsByFile.get(file) ?? []) {
      const key = contributor(part.source_path);
      const entry = totals.get(key) ?? { gzip: 0, raw: 0 };

      entry.gzip += part.compressed_size;
      entry.raw += part.size;
      totals.set(key, entry);
    }
  }

  return [...totals.entries()].sort((a, b) => b[1].gzip - a[1].gzip);
}

const kb = (bytes) => (bytes / 1024).toFixed(1).padStart(7);
const initial = tally(initialFiles);
const appTotal = initial.filter(([key]) => key.startsWith("app: ")).reduce((sum, [, entry]) => sum + entry.gzip, 0);

console.log(`${route}: first-load JS (${initialFiles.size} chunks)`);
console.log(`  ${kb(initial.reduce((sum, [, entry]) => sum + entry.gzip, 0))} KB gzip total, of which app code ${kb(appTotal).trim()} KB`);

for (const [key, entry] of initial.slice(0, top)) {
  console.log(`  ${kb(entry.gzip)} KB gz ${kb(entry.raw)} KB raw  ${key}`);
}

console.log("\nLoaded later (async chunks), by what triggers them:");

for (const group of groups.filter((entry) => entry.kind === "async")) {
  const files = group.outputs.filter(isClientJs);

  if (!files.length) {
    continue;
  }

  const contents = tally(files);
  const total = contents.reduce((sum, [, entry]) => sum + entry.gzip, 0);
  const trigger = group.trigger_module_ident.split(" [")[0].replace("[project]/", "").split("node_modules/").pop();

  console.log(`  ${kb(total)} KB gz  ${trigger}: ${contents.slice(0, 3).map(([key]) => key).join(", ")}`);
}
