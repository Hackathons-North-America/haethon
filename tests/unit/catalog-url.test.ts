import { describe, expect, it } from "vitest";

import {
  CATALOG_URL_BOOT_SCRIPT,
  DEFAULT_SEARCH_FILTERS,
  catalogRequestFromSearch,
} from "@/lib/hackathons/catalog-url";
import { CATALOG_SNAPSHOT_URL, EARLY_CATALOG_GLOBAL } from "@/lib/hackathons/catalog-client";

/* The boot script is a string that runs before React; evaluate it against a
   stand-in location and document the way the browser would. */
function runBootScript(search: string) {
  const attributes: Record<string, string> = {};
  const fetched: string[] = [];
  const fakeWindow: Record<string, unknown> = {};
  const run = new Function("location", "document", "window", "fetch", CATALOG_URL_BOOT_SCRIPT);

  run(
    { search },
    { documentElement: { setAttribute: (name: string, value: string) => (attributes[name] = value) } },
    fakeWindow,
    (url: string) => {
      fetched.push(url);
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ entries: [] }) });
    }
  );

  return { marked: attributes["data-catalog-url"] === "filtered", fetched, early: fakeWindow[EARLY_CATALOG_GLOBAL] };
}

function bootScriptMarks(search: string) {
  return runBootScript(search).marked;
}

describe("catalogRequestFromSearch", () => {
  it("treats a bare URL and the page's own search=1 marker as the static catalog", () => {
    for (const search of ["", "?search=1", "?utm_source=discord&search=1"]) {
      expect(catalogRequestFromSearch(search)).toEqual({
        filters: DEFAULT_SEARCH_FILTERS,
        sort: "soonest",
        isDefault: true,
      });
    }
  });

  it("reads filters the way the server-rendered page used to", () => {
    const request = catalogRequestFromSearch(
      "?q=%20Hack%20the%20North%20&countries=Canada&countries=United%20States&datePeriod=next-30-days&format=in_person&beginnerFriendly=on&search=1"
    );

    expect(request.isDefault).toBe(false);
    expect(request.sort).toBe("soonest");
    expect(request.filters).toEqual({
      ...DEFAULT_SEARCH_FILTERS,
      beginnerFriendly: "on",
      countries: ["Canada", "United States"],
      datePeriod: "next-30-days",
      format: "in_person",
      name: "Hack the North",
    });
  });

  it("counts a non-default sort as a different view even without filters", () => {
    const request = catalogRequestFromSearch("?sort=top");

    expect(request.isDefault).toBe(false);
    expect(request.sort).toBe("top");
    expect(request.filters).toEqual(DEFAULT_SEARCH_FILTERS);
  });

  it("falls back to the static catalog when every parameter is invalid", () => {
    expect(catalogRequestFromSearch("?format=hybrid&datePeriod=someday&sort=random").isDefault).toBe(true);
  });
});

describe("CATALOG_URL_BOOT_SCRIPT", () => {
  it("leaves the static cards visible on the plain catalog", () => {
    expect(bootScriptMarks("")).toBe(false);
    expect(bootScriptMarks("?search=1")).toBe(false);
    expect(bootScriptMarks("?research=1&unsorted=top")).toBe(false);
  });

  it("hides them on any URL that asks for a filtered or re-sorted view", () => {
    expect(bootScriptMarks("?countries=Canada&search=1")).toBe(true);
    expect(bootScriptMarks("?search=1&sort=top")).toBe(true);
    expect(bootScriptMarks("?q=hack")).toBe(true);
  });

  it("starts downloading the catalog file on a filtered URL, and only there", async () => {
    const filtered = runBootScript("?countries=Canada&search=1");

    expect(filtered.fetched).toEqual([CATALOG_SNAPSHOT_URL]);
    await expect(filtered.early).resolves.toEqual({ entries: [] });

    const plain = runBootScript("?search=1");

    expect(plain.fetched).toEqual([]);
    expect(plain.early).toBeUndefined();
  });

  it("agrees with catalogRequestFromSearch on every URL the page itself writes", () => {
    for (const search of [
      "?countries=Canada&search=1",
      "?datePeriod=next-7-days&search=1",
      "?distanceKm=100&search=1",
      "?format=online&search=1",
      "?beginnerFriendly=on&search=1",
      "?travelReimbursement=on&search=1",
      "?highSchoolersOnly=on&search=1",
      "?sort=top&search=1",
      "?search=1",
    ]) {
      expect(bootScriptMarks(search)).toBe(!catalogRequestFromSearch(search).isDefault);
    }
  });
});
