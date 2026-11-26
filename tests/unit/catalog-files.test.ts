import { beforeEach, describe, expect, it, vi } from "vitest";

import type { CatalogSnapshotEntry } from "@/lib/hackathons/catalog-snapshot";

const state = vi.hoisted(() => ({
  snapshot: [] as CatalogSnapshotEntry[],
  votes: {} as Record<string, [number, number]>,
}));

vi.mock("@/lib/hackathons/catalog", () => ({
  getPublicCatalogSnapshot: async () => state.snapshot,
  getPublicCatalogVoteTotals: async () => state.votes,
}));

const { catalogDescriptionsBody, catalogFileBody, catalogVersionsBody, catalogVotesBody } = await import(
  "@/lib/hackathons/catalog-files"
);

function entry(id: string, description: string | null): CatalogSnapshotEntry {
  return {
    card: {
      beginnerFriendly: false,
      country: "Canada",
      countryCode: "CA",
      date: "",
      description,
      discordUrl: null,
      endsAt: null,
      format: "in_person",
      hasDiscord: false,
      highSchoolersOnly: false,
      id,
      image: null,
      imageThumbLarge: null,
      imageThumbSmall: null,
      latitude: null,
      location: "",
      longitude: null,
      name: id,
      prizeAmountUsd: null,
      slug: id,
      source: null,
      startsAt: null,
      tags: [],
      travelReimbursement: false,
      websiteUrl: null,
    },
    seriesId: null,
    isRecurring: false,
    upvotes: 3,
    downvotes: 0,
  };
}

describe("catalog files", () => {
  beforeEach(() => {
    state.snapshot = [entry("a", "Alpha blurb"), entry("b", null)];
    state.votes = { a: [3, 0] };
  });

  it("splits the snapshot: cards without blurbs or totals, blurbs by id, live totals by id", async () => {
    const catalog = await catalogFileBody();

    expect(catalog.entries).toHaveLength(2);
    expect(catalog.entries?.[0]?.card).not.toHaveProperty("description");
    expect(catalog.entries?.[0]).not.toHaveProperty("upvotes");
    expect((await catalogDescriptionsBody()).descriptions).toEqual({ a: "Alpha blurb" });
    expect((await catalogVotesBody()).votes).toEqual({ a: [3, 0] });
  });

  it("lists in …/versions the very fingerprints the files carry", async () => {
    const versions = await catalogVersionsBody();

    expect(versions).toEqual({
      catalog: (await catalogFileBody()).version,
      descriptions: (await catalogDescriptionsBody()).version,
      votes: (await catalogVotesBody()).version,
    });
    expect(versions.catalog).toMatch(/^[\w-]{16}$/);
  });

  it("moves only the fingerprint of the file whose content changed", async () => {
    const before = await catalogVersionsBody();

    state.votes = { a: [4, 0] };
    const afterVote = await catalogVersionsBody();

    expect(afterVote.votes).not.toBe(before.votes);
    expect(afterVote.catalog).toBe(before.catalog);
    expect(afterVote.descriptions).toBe(before.descriptions);

    state.snapshot = [entry("a", "Alpha, edited"), entry("b", null)];
    const afterEdit = await catalogVersionsBody();

    expect(afterEdit.descriptions).not.toBe(afterVote.descriptions);
    expect(afterEdit.catalog).toBe(afterVote.catalog);
  });
});
