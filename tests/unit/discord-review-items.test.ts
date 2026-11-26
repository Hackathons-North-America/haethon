import { describe, expect, it } from "vitest";

import { approvalCandidate, duplicateDedupeKey, scraperImportReviewItems } from "@/lib/discord/review-items";

const payload = {
  name: "MapleHacks 2027",
  websiteUrl: "https://maplehacks.ca",
  country: "Canada",
  startDate: new Date("2027-01-16T00:00:00Z"),
  endDate: new Date("2027-01-17T00:00:00Z"),
  format: "in_person",
};

describe("scraperImportReviewItems", () => {
  it("keeps a flagged duplicate's payload and queues channel decisions for new Canadian/US events", () => {
    const items = scraperImportReviewItems(
      [{ ...payload, externalId: "luma:1" }, payload, payload, payload],
      [
        { duplicateScore: 0.7, index: 0, matchedHackathonId: "match", matchedName: "Maple", status: "duplicate_flagged" },
        { discord: { eligible: true }, duplicateScore: 0, hackathonId: "h1", index: 1, status: "imported" },
        { autoApprove: true, discord: { eligible: true }, duplicateScore: 0, hackathonId: "h2", index: 2, status: "imported" },
        { discord: { eligible: false }, duplicateScore: 0, hackathonId: "h3", index: 3, status: "imported" },
      ]
    );

    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({
      dedupeKey: "feed:luma:1",
      hackathonId: "match",
      kind: "import_duplicate",
      payload: { duplicateScore: 0.7, matchedName: "Maple", name: "MapleHacks 2027", startDate: "2027-01-16T00:00:00.000Z" },
    });
    expect(items[1]).toMatchObject({ dedupeKey: "h1", hackathonId: "h1", kind: "channel_decision" });
  });

  it("ignores updates and auto-merges", () => {
    expect(
      scraperImportReviewItems([payload], [{ duplicateScore: 1, hackathonId: "h", index: 0, status: "updated" }])
    ).toEqual([]);
  });
});

describe("duplicateDedupeKey", () => {
  it("prefers the feed id, then name, start day and match", () => {
    expect(duplicateDedupeKey({ externalIds: ["devpost:9"] }, "m")).toBe("feed:devpost:9");
    expect(duplicateDedupeKey({ name: " MapleHacks ", startDate: "2027-01-16T05:00:00Z" }, "m")).toBe("name|maplehacks|2027-01-16|m");
  });
});

describe("approvalCandidate", () => {
  const communityTip = {
    normalizedName: "MapleHacks 2027",
    organizationName: null,
    payload: { name: "MapleHacks 2027", submitterType: "community", websiteUrl: "https://maplehacks.ca" },
    sourceUrl: "https://haethon.local/submissions/community-form",
    websiteUrl: "https://maplehacks.ca",
  };

  it("fails for a community tip until dates and country are filled in", () => {
    const missing = approvalCandidate(communityTip);

    expect(missing.success).toBe(false);

    const filled = approvalCandidate(communityTip, { city: "Toronto", country: "Canada", endDate: "2027-1-17", region: "", startDate: "2027-01-16" });

    expect(filled.success).toBe(true);
    expect(filled.data).toMatchObject({ city: "Toronto", country: "Canada", format: "in_person", name: "MapleHacks 2027" });
    expect(filled.data?.endDate.toISOString()).toBe("2027-01-17T00:00:00.000Z");
    expect(filled.data?.region).toBeUndefined();
  });

  it("rejects a date typed in another shape and an end before the start", () => {
    expect(approvalCandidate(communityTip, { country: "Canada", endDate: "2027-01-17", startDate: "01/16/2027" }).success).toBe(false);
    expect(approvalCandidate(communityTip, { country: "Canada", endDate: "2027-01-15", startDate: "2027-01-16" }).success).toBe(false);
  });
});
