import { ButtonStyle } from "discord-api-types/v10";
import { describe, expect, it } from "vitest";

import { parseReviewCustomId, renderReviewMessage, reviewCustomId, type ReviewItemView } from "@/lib/discord/review-messages";

const ITEM_ID = "3f0c8a52-6a0e-4c4d-9a4f-0b9f6c1d2e3f";
const APP = "https://haethon.test";

function submissionItem(overrides: Partial<ReviewItemView> = {}, submission: Partial<NonNullable<ReviewItemView["submission"]>> = {}): ReviewItemView {
  return {
    hackathon: null,
    id: ITEM_ID,
    kind: "submission",
    outcome: null,
    payload: null,
    resolvedBy: null,
    status: "pending",
    submission: {
      duplicateScore: "0.00",
      id: "sub-1",
      matchedHackathonId: null,
      matchedHackathonName: null,
      matchedHackathonSlug: null,
      normalizedName: "MapleHacks 2027",
      organizationName: null,
      payload: { name: "MapleHacks 2027", submitterType: "community", discordSubmitter: { id: "1", username: "maple" } },
      submitterEmail: "discord-bot@haethon.invalid",
      submitterType: "community",
      websiteUrl: "https://maplehacks.ca",
      ...submission,
    },
    ...overrides,
  };
}

function buttons(body: ReturnType<typeof renderReviewMessage>) {
  return body.components.flatMap((row) => row.components) as Array<{ custom_id?: string; label?: string; style: number; url?: string }>;
}

describe("review custom ids", () => {
  it("round-trips an action and item id", () => {
    expect(parseReviewCustomId(reviewCustomId("approve", ITEM_ID))).toEqual({ action: "approve", itemId: ITEM_ID });
  });

  it("rejects unknown actions, other prefixes and malformed ids", () => {
    expect(parseReviewCustomId(`rv:explode:${ITEM_ID}`)).toBeNull();
    expect(parseReviewCustomId(`ah:approve:${ITEM_ID}`)).toBeNull();
    expect(parseReviewCustomId("rv:approve:not-a-uuid")).toBeNull();
    expect(parseReviewCustomId(`rv:approve:${ITEM_ID}:extra`)).toBeNull();
  });
});

describe("renderReviewMessage", () => {
  it("counts what waits behind a card and offers to skip it, on a row of its own", () => {
    const body = renderReviewMessage(submissionItem(), APP, { waiting: 3 });

    expect(body.embeds[0].footer?.text).toBe("3 more waiting after this one");
    expect(body.components).toHaveLength(2);
    expect(body.components[1].components).toEqual([expect.objectContaining({ custom_id: `rv:later:${ITEM_ID}`, label: "Skip for now" })]);
    expect(parseReviewCustomId(`rv:later:${ITEM_ID}`)).toEqual({ action: "later", itemId: ITEM_ID });
  });

  it("offers no skip when nothing else is waiting, and no count once decided", () => {
    const last = renderReviewMessage(submissionItem(), APP, { waiting: 0 });

    expect(last.embeds[0].footer?.text).toBe("Nothing else waiting");
    expect(buttons(last).map((button) => button.label)).not.toContain("Skip for now");

    const decided = renderReviewMessage(submissionItem({ outcome: "Approved", resolvedBy: "@james", status: "resolved" }), APP, { waiting: 3 });

    expect(decided.embeds[0].footer?.text).toBe("Approved · by @james");
    expect(buttons(decided).map((button) => button.label)).not.toContain("Skip for now");
  });

  it("gives a pending submission approve and reject buttons, and names the Discord submitter", () => {
    const body = renderReviewMessage(submissionItem(), APP);

    expect(buttons(body).map((button) => button.label)).toEqual(["Approve", "Reject", "Open queue"]);
    expect(buttons(body)[0].custom_id).toBe(`rv:approve:${ITEM_ID}`);
    expect(body.embeds[0].fields).toContainEqual(expect.objectContaining({ name: "Submitted by", value: "@maple (Discord)" }));
    expect(body.allowed_mentions).toEqual({ parse: [] });
  });

  it("adds merge and replace buttons and the match when a duplicate was found", () => {
    const body = renderReviewMessage(
      submissionItem({}, { duplicateScore: "0.81", matchedHackathonId: "h1", matchedHackathonName: "MapleHacks", matchedHackathonSlug: "maplehacks" }),
      APP
    );

    expect(buttons(body).map((button) => button.label)).toEqual(["Approve", "Reject", "Merge into match", "Replace match", "Open queue"]);
    expect(body.embeds[0].fields).toContainEqual(
      expect.objectContaining({ value: `[MapleHacks](${APP}/hackathons/maplehacks) · match 0.81` })
    );
  });

  it("offers an import card's own choices and links its queue", () => {
    const card = { name: "MapleHacks 2027", origin: "admin_import", importVia: "scraper", submitterType: "community" };
    const plain = renderReviewMessage(submissionItem({}, { payload: card }), APP);
    const flagged = renderReviewMessage(
      submissionItem({}, { matchedHackathonId: "h1", matchedHackathonName: "MapleHacks", matchedHackathonSlug: "maplehacks", payload: card }),
      APP
    );

    expect(buttons(plain).map((button) => button.label)).toEqual(["Approve", "Reject", "Open queue"]);
    // Decided as on /admin/import: merge or import as new, never replace.
    expect(buttons(flagged).map((button) => button.label)).toEqual(["Approve", "Reject", "Merge into match", "Import as new", "Open queue"]);
    expect(buttons(flagged)[3].custom_id).toBe(`rv:new:${ITEM_ID}`);
    expect(buttons(flagged).at(-1)?.url).toBe(`${APP}/admin/import`);
  });

  it("links broken imports to their own queue", () => {
    const body = renderReviewMessage(submissionItem({}, { payload: { needsFix: true } }), APP);

    expect(buttons(body).at(-1)?.url).toBe(`${APP}/admin/broken`);
  });

  it("drops the action buttons once resolved and says who did what", () => {
    const body = renderReviewMessage(
      submissionItem({ hackathon: { name: "MapleHacks 2027", slug: "maplehacks-2027" }, outcome: "Approved", resolvedBy: "@james", status: "resolved" }),
      APP
    );

    expect(buttons(body)).toEqual([expect.objectContaining({ style: ButtonStyle.Link, url: `${APP}/hackathons/maplehacks-2027` })]);
    expect(body.embeds[0].footer?.text).toBe("Approved · by @james");
  });

  it("shows no link while a click is still in progress", () => {
    const body = renderReviewMessage(
      submissionItem({ hackathon: { name: "X", slug: "x" }, outcome: "In progress", status: "resolved" }),
      APP
    );

    expect(body.components).toEqual([]);
  });

  it("asks whether a hackathon is HNA approved, with a channel for yes", () => {
    const body = renderReviewMessage(
      {
        hackathon: { name: "MapleHacks", slug: "maplehacks" },
        id: ITEM_ID,
        kind: "channel_decision",
        outcome: null,
        payload: { country: "Canada", discord: { action: "create", categoryName: "Canada", name: "maplehacks-2027" }, name: "MapleHacks", startDate: "2027-01-16T00:00:00.000Z" },
        resolvedBy: null,
        status: "pending",
        submission: null,
      },
      APP
    );

    expect(buttons(body).map((button) => button.custom_id ?? button.url)).toEqual([
      `rv:channel:${ITEM_ID}`,
      `rv:nochannel:${ITEM_ID}`,
      `${APP}/hackathons/maplehacks`,
    ]);
    expect(body.embeds[0].title).toBe("Is MapleHacks HNA approved?");
    expect(body.embeds[0].description).toContain("Approving creates **#maplehacks-2027** in Canada");
    expect(buttons(body).map((button) => button.label)).toEqual(["HNA approved", "Not HNA approved", "View hackathon"]);
  });

  it("offers new / merge / skip for a duplicate, without merge once the match is gone", () => {
    const pending: ReviewItemView = {
      hackathon: { name: "MapleHacks", slug: "maplehacks" },
      id: ITEM_ID,
      kind: "import_duplicate",
      outcome: null,
      payload: { duplicateScore: 0.7, name: "Maple Hacks" },
      resolvedBy: null,
      status: "pending",
      submission: null,
    };

    expect(buttons(renderReviewMessage(pending, APP)).map((button) => button.label)).toEqual([
      "Import as new",
      "Merge into match",
      "Skip",
      "View match",
    ]);
    expect(buttons(renderReviewMessage({ ...pending, hackathon: null }, APP)).map((button) => button.label)).toEqual(["Import as new", "Skip"]);
  });
});
