import { ComponentType } from "discord-api-types/v10";
import { describe, expect, it } from "vitest";

import {
  communitySubmissionInput,
  defaultDiscordTag,
  emptyDraft,
  organizerProgressMessage,
  organizerSubmissionInput,
  ORGANIZER_STEPS,
  validateOrganizerStep,
  type OrganizerDraft,
} from "@/lib/discord/add-hackathon-form";
import { modalResponse, modalValues, normalizeDateInput, normalizeUrlInput } from "@/lib/discord/form-fields";

const DRAFT_ID = "3f0c8a52-6a0e-4c4d-9a4f-0b9f6c1d2e3f";

const basics = {
  discordTag: "@Maple.Org",
  name: "MapleHacks 2027",
  organizationName: "Maple Org",
  shortDescription: "A weekend of building things in Toronto for students.",
  websiteUrl: "maplehacks.ca",
};
const dates = { applicationClosesAt: "2027-01-01", applicationOpensAt: "", endDate: "2027-01-17", startDate: "2027-01-16" };
const location = { city: "Toronto", country: "Canada", prizeAmountUsd: "$5,000", region: "Ontario", venue: "" };

function completeDraft(): OrganizerDraft {
  return { done: ["basics", "dates", "location"], flags: ["beginnerFriendly"], steps: { basics, dates, location } };
}

describe("the organizer form steps", () => {
  it("mirrors the web form's organizer fields, five or fewer per pop-up", () => {
    const fields = ORGANIZER_STEPS.flatMap((step) => step.fields.map((field) => field.id));

    expect(fields.sort()).toEqual(
      [
        "name",
        "organizationName",
        "websiteUrl",
        "discordTag",
        "shortDescription",
        "startDate",
        "endDate",
        "applicationOpensAt",
        "applicationClosesAt",
        "city",
        "region",
        "country",
        "venue",
        "prizeAmountUsd",
      ].sort()
    );
    ORGANIZER_STEPS.forEach((step) => expect(step.fields.length).toBeLessThanOrEqual(5));
  });

  it("validates each pop-up on its own", () => {
    expect(validateOrganizerStep("basics", basics)).toBeNull();
    expect(validateOrganizerStep("basics", { ...basics, shortDescription: "short" })).toContain("**Short description:** At least 20 characters.");
    expect(validateOrganizerStep("dates", dates)).toBeNull();
    expect(validateOrganizerStep("dates", { ...dates, startDate: "Jan 16" })).toContain("**Start date:** Use YYYY-MM-DD");
    expect(validateOrganizerStep("dates", { ...dates, endDate: "2027-01-15" })).toContain("End date must be on or after the start date.");
    expect(validateOrganizerStep("location", location)).toBeNull();
    expect(validateOrganizerStep("location", { ...location, country: "" })).toContain("**Country:**");
  });

  it("builds the same organizer submission the web form posts", () => {
    const parsed = organizerSubmissionInput(completeDraft());

    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({
      beginnerFriendly: true,
      discordTag: "maple.org",
      format: "in_person",
      highSchoolersOnly: false,
      prizeAmountUsd: 5000,
      submitterType: "organizer",
      travelReimbursement: false,
      websiteUrl: "https://maplehacks.ca",
    });
    expect(parsed.data?.applicationOpensAt).toBeUndefined();
  });

  it("builds a community tip like the web form's Community tab", () => {
    const parsed = communitySubmissionInput({ name: "Maple Hacks", websiteUrl: "www.maple.ca" });

    expect(parsed.success).toBe(true);
    expect(parsed.data).toMatchObject({ submitterType: "community", websiteUrl: "https://www.maple.ca" });
    expect(communitySubmissionInput({ name: "M", websiteUrl: "" }).success).toBe(false);
  });

  it("prefills only usernames Discord can ping", () => {
    expect(defaultDiscordTag("maple.org")).toBe("maple.org");
    expect(defaultDiscordTag("Old#1234")).toBe("");
  });
});

describe("organizerProgressMessage", () => {
  function ids(message: ReturnType<typeof organizerProgressMessage>) {
    return message.components.flatMap((row) => row.components).map((component) => ("custom_id" in component ? component.custom_id : ""));
  }

  it("points at the next pop-up while steps remain", () => {
    const draft: OrganizerDraft = { ...emptyDraft(), done: ["basics"], steps: { basics } };

    expect(ids(organizerProgressMessage(DRAFT_ID, draft))).toEqual([
      `ah:open:dates:${DRAFT_ID}`,
      `ah:open:basics:${DRAFT_ID}`,
      `ah:cancel:${DRAFT_ID}`,
    ]);
  });

  it("ends with the checkboxes and submit, keeping ticked ones ticked", () => {
    const message = organizerProgressMessage(DRAFT_ID, completeDraft());
    const select = message.components[0].components[0];

    expect(select.type).toBe(ComponentType.StringSelect);
    expect("options" in select && select.options.filter((option) => option.default).map((option) => option.value)).toEqual(["beginnerFriendly"]);
    expect(ids(message)).toContain(`ah:submit:${DRAFT_ID}`);
    expect(message.components.every((row) => row.components.length <= 5)).toBe(true);
  });

  it("shows what to fix", () => {
    expect(organizerProgressMessage(DRAFT_ID, emptyDraft(), "• **Start date:** Required.").embeds[0].description).toContain("Fix these");
  });
});

describe("form helpers", () => {
  it("normalizes dates and urls as the web form does", () => {
    expect(normalizeDateInput("2027-1-6")).toBe("2027-01-06");
    expect(normalizeDateInput("")).toBe("");
    expect(normalizeDateInput("2027-02-30")).toBeNull();
    expect(normalizeDateInput("01/02/2027")).toBeNull();
    expect(normalizeUrlInput(" example.com ")).toBe("https://example.com");
    expect(normalizeUrlInput("http://x.io")).toBe("http://x.io");
  });

  it("reads values from classic action rows and newer labels", () => {
    expect(
      modalValues([
        { components: [{ custom_id: "name", value: "Maple" }] },
        { component: { custom_id: "city", value: "Toronto" } },
      ])
    ).toEqual({ city: "Toronto", name: "Maple" });
  });

  it("refuses a pop-up with more than five inputs", () => {
    const fields = Array.from({ length: 6 }, (_, index) => ({ id: `f${index}`, label: "x" }));

    expect(() => modalResponse({ customId: "x", fields, title: "x" })).toThrow();
  });
});
