import { describe, expect, it } from "vitest";

import {
  importCardPayload,
  importEventPayload,
  importKeysOf,
  isImportCardPayload,
  toImportCardView,
} from "@/lib/hackathons/import-cards";

describe("importKeysOf", () => {
  it("uses the feed ids when the row has any", () => {
    expect(importKeysOf({ name: "MapleHacks", externalId: "luma:evt-1", externalIds: ["luma:evt-1", "cerebralvalley:9"] })).toEqual([
      "luma:evt-1",
      "cerebralvalley:9",
    ]);
  });

  it("falls back to the name and start day", () => {
    expect(importKeysOf({ name: "Maple Hacks 2027", startDate: "2027-01-16" })).toEqual(["name:maple-hacks-2027|2027-01-16"]);
    // A stored card holds the date as an ISO timestamp; the key must not move.
    expect(importKeysOf({ name: "Maple Hacks 2027", startDate: "2027-01-16T00:00:00.000Z" })).toEqual([
      "name:maple-hacks-2027|2027-01-16",
    ]);
  });

  it("copes with a row that is missing what it needs", () => {
    expect(importKeysOf({})).toEqual(["name:hackathon|"]);
    expect(importKeysOf({ name: 42, startDate: "not a date", externalIds: "luma:evt-1" })).toEqual(["name:hackathon|"]);
  });
});

describe("importCardPayload", () => {
  it("adds what the queue needs and nothing a caller could smuggle in", () => {
    const stored = importCardPayload(
      { name: "MapleHacks", externalId: "luma:evt-1", importKeys: ["someone-else"], importEdited: true, importError: "old" },
      { via: "scraper" }
    );

    expect(stored).toEqual({
      name: "MapleHacks",
      externalId: "luma:evt-1",
      submitterType: "community",
      origin: "admin_import",
      importKeys: ["luma:evt-1"],
      importVia: "scraper",
    });
    expect(isImportCardPayload(stored)).toBe(true);
  });

  it("marks an edit and records a failure", () => {
    expect(importCardPayload({ name: "MapleHacks" }, { edited: true })).toMatchObject({ importEdited: true });
    expect(importCardPayload({ name: "MapleHacks" }, { error: "country: Required" })).toMatchObject({
      importError: "country: Required",
    });
  });

  it("gives back the event without the queue's keys", () => {
    expect(importEventPayload(importCardPayload({ name: "MapleHacks", country: "Canada" }, { via: "upload" }))).toEqual({
      name: "MapleHacks",
      country: "Canada",
    });
  });
});

describe("toImportCardView", () => {
  const row = {
    id: "card-1",
    payload: importCardPayload({ name: "MapleHacks" }, { error: "country: Required", via: "upload" }),
    matchedHackathonId: null,
    matchedHackathonName: null,
    duplicateScore: "0.00",
    createdAt: new Date("2026-11-26T12:00:00.000Z"),
  };

  it("shows a failed card's error and where it came from", () => {
    expect(toImportCardView(row)).toEqual({
      id: "card-1",
      payload: { name: "MapleHacks" },
      duplicate: null,
      error: "country: Required",
      via: "upload",
      createdAt: "2026-11-26T12:00:00.000Z",
    });
  });

  it("names the hackathon a card may duplicate", () => {
    expect(
      toImportCardView({ ...row, matchedHackathonId: "h-1", matchedHackathonName: "Maple Hacks", duplicateScore: "0.72" }).duplicate
    ).toEqual({ hackathonId: "h-1", name: "Maple Hacks", score: 0.72 });
  });
});
