/* Browser-side timings for filtering the catalog: from the click (or Enter) to
   the moment the grid has re-rendered with the new results.

   Run against a production build:
     pnpm build && pnpm start -p 3101
     node scripts/perf/catalog-click-bench.mjs      # BASE_URL, BENCH_RUNS optional

   repeat — toggling the "North America" tab on and off (Canada + United States,
            in person). The same two requests alternate, so after the first
            pass this is the warm steady state.
   fresh  — with North America active, a different name search on every run:
            a text + country combination the server has not served before. */
import { chromium } from "@playwright/test";

const BASE_URL = process.env.BASE_URL ?? "http://localhost:3101";
const RUNS = Number(process.env.BENCH_RUNS ?? 15);
/* Substrings of real hackathon names, one per run, never reused. */
const TERMS = [
  "hack", "ha", "ac", "ck", "a", "e", "i", "o", "u", "t", "n", "s", "r", "th", "on",
  "an", "in", "er", "at", "es", "un", "co", "de", "te", "ch", "ai", "la", "ni", "h", "c",
];

function stats(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const at = (p) => sorted[Math.min(sorted.length - 1, Math.ceil(p * sorted.length) - 1)];

  return `median ${at(0.5).toFixed(1)} / p95 ${at(0.95).toFixed(1)} / min ${sorted[0].toFixed(1)} / max ${sorted.at(-1).toFixed(1)}`;
}

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });

await page.goto(`${BASE_URL}/hackathons`, { waitUntil: "networkidle" });
await page.locator("article").first().waitFor();

/* Times one search: the action fires, the API responds, and the Search button
   leaves its busy state (React has committed the new grid). Timestamps are
   taken inside the page so driver overhead is excluded. */
async function timeSearch(action) {
  await page.evaluate(() => {
    window.__benchStart = null;
    window.__benchApiMs = null;

    const originalFetch = window.__benchFetch ?? window.fetch;
    window.__benchFetch = originalFetch;
    window.fetch = async (...args) => {
      const isSearch = String(args[0]).includes("/api/hackathons?");
      const start = performance.now();

      if (isSearch && window.__benchStart === null) {
        window.__benchStart = start;
      }

      const response = await originalFetch(...args);

      if (isSearch) {
        // Body included: the app cannot render until the JSON has arrived.
        await response.clone().arrayBuffer();
        window.__benchApiMs = performance.now() - start;
      }

      return response;
    };
  });

  await action();
  await page.waitForFunction(() => window.__benchApiMs !== null);
  await page.getByRole("button", { name: "Search hackathons", exact: true }).waitFor();

  return page.evaluate(
    () =>
      new Promise((resolve) => {
        requestAnimationFrame(() =>
          resolve({ api: window.__benchApiMs, rendered: performance.now() - window.__benchStart })
        );
      })
  );
}

const northAmerica = page
  .getByRole("group", { name: "Region filters" })
  .getByRole("button", { name: "North America" });

// Unmeasured pass so both alternating requests have been served once.
await timeSearch(() => northAmerica.click());
await timeSearch(() => northAmerica.click());

const repeat = { api: [], rendered: [] };

for (let i = 0; i < RUNS; i += 1) {
  const result = await timeSearch(() => northAmerica.click());
  repeat.api.push(result.api);
  repeat.rendered.push(result.rendered);
}

// Leave the preset active for the text searches.
if ((await northAmerica.getAttribute("aria-pressed")) !== "true") {
  await timeSearch(() => northAmerica.click());
}

await page.getByRole("button", { name: "More", exact: true }).click();
const nameField = page.getByLabel("Name");
const fresh = { api: [], rendered: [] };

for (let i = 0; i < Math.min(RUNS, TERMS.length); i += 1) {
  await nameField.fill(TERMS[i]);
  const result = await timeSearch(() => nameField.press("Enter"));
  fresh.api.push(result.api);
  fresh.rendered.push(result.rendered);
}

console.log(`base ${BASE_URL}, ${RUNS} runs each, ms`);
console.log(`north-america tab [repeat]        fetch ${stats(repeat.api)} | request→rendered ${stats(repeat.rendered)}`);
console.log(`name search + north-america [fresh] fetch ${stats(fresh.api)} | request→rendered ${stats(fresh.rendered)}`);

await browser.close();
