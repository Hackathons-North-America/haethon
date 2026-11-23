import { describe, expect, it } from "vitest";

import { externalIdsOf, feedChanges } from "@/lib/hackathons/external-ids";

describe("feed identities", () => {
  it("collects externalId and externalIds once each, in order", () => {
    expect(externalIdsOf({ externalId: "mlh:1", externalIds: ["mlh:1", "devpost:2", " ", "devpost:2"] })).toEqual([
      "mlh:1",
      "devpost:2",
    ]);
    expect(externalIdsOf({})).toEqual([]);
  });

  it("caps the number of ids", () => {
    const many = Array.from({ length: 30 }, (_, index) => `luma:${index}`);
    expect(externalIdsOf({ externalIds: many })).toHaveLength(20);
  });
});

describe("feed changes", () => {
  const previous = {
    name: "HackPSU",
    startDate: "2026-11-14T00:00:00.000Z",
    endDate: "2026-11-15T00:00:00.000Z",
    venue: "ECoRE Building",
    travelReimbursement: false,
  };

  it("reports only fields the feed changed since the last import", () => {
    expect(
      feedChanges(previous, {
        ...previous,
        startDate: "2026-11-13T00:00:00.000Z",
        venue: "ECoRE Building ",
        travelReimbursement: true,
      })
    ).toEqual(["travelReimbursement", "startDate"]);
  });

  it("treats dates and their ISO strings as the same value", () => {
    expect(feedChanges(previous, { ...previous, endDate: new Date("2026-11-15T00:00:00.000Z") })).toEqual([]);
  });

  it("never treats a field the feed stopped sending as a change", () => {
    expect(feedChanges(previous, { name: "HackPSU" })).toEqual([]);
    expect(feedChanges(previous, { ...previous, venue: null })).toEqual([]);
  });

  it("ignores identity and provenance fields", () => {
    expect(feedChanges(previous, { ...previous, externalId: "devpost:9", source: "devpost", organizationName: "X" })).toEqual(
      []
    );
  });
});
