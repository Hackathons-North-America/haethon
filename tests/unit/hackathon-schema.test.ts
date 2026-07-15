import { describe, expect, it } from "vitest";

import {
  adminHackathonCreateSchema,
  adminHackathonEditSchema,
  adminHackathonFixImportSchema,
  adminHackathonImportSchema,
  adminHackathonRecurringSchema,
  adminHackathonUpdateSchema,
  communitySubmissionSchema,
  hackathonSearchSchema,
  organizerSubmissionSchema,
  profileUpdateSchema,
  reviewActionSchema,
} from "@/lib/validations/hackathon";
import { normalizeSearchFilters } from "@/lib/hackathons/search-filters";
import { normalizeSubmissionPayload } from "@/lib/hackathons/utils";

describe("hackathonSearchSchema", () => {
  it("accepts a valid filter payload", () => {
    const result = hackathonSearchSchema.safeParse({
      q: "Hack the North",
      country: "C-A",
      beginnerFriendly: "true",
      travelReimbursement: "false",
      startsAfter: "2026-09-01T00:00:00.000Z",
      startsBefore: "2026-09-30T23:59:59.999Z",
      limit: "12",
    });

    expect(result.success).toBe(true);
    expect(result.data).toMatchObject({
      countries: ["Canada"],
      beginnerFriendly: true,
      travelReimbursement: false,
    });
  });

  it("accepts repeated country filter values", () => {
    const result = hackathonSearchSchema.parse({
      countries: ["Canada", "USA", "Canada"],
      limit: "12",
    });

    expect(result.countries).toEqual(["Canada", "United States"]);
  });

  it("does not expose unsupported filters", () => {
    const result = hackathonSearchSchema.parse({
      q: "Toronto",
      city: "Toronto",
      format: "in_person",
      teamSize: "4",
    });

    expect(result).toEqual({
      q: "Toronto",
      countries: [],
      format: "in_person",
      limit: 12,
      offset: 0,
    });
  });

  it("normalizes country abbreviations and filters from page search params", () => {
    const result = normalizeSearchFilters({
      country: "O-N",
      format: "online",
      beginnerFriendly: "on",
      travelReimbursement: "off",
    });

    expect(result).toMatchObject({
      countries: ["Canada"],
      format: "online",
      beginnerFriendly: "on",
      travelReimbursement: "off",
    });
  });

  it("ignores removed hybrid format filters from page search params", () => {
    const result = normalizeSearchFilters({
      format: "hybrid",
    });

    expect(result.format).toBe("any");
  });
});

describe("hackathon submission schemas", () => {
  it("accepts a minimal community submission of just a name and links", () => {
    const result = communitySubmissionSchema.safeParse({
      submitterType: "community",
      name: "Waterloo Build Weekend",
      websiteUrl: "https://example.com",
      sourceUrl: "https://example.com/event",
    });

    expect(result.success).toBe(true);
  });

  it("rejects a community submission without a website", () => {
    const result = communitySubmissionSchema.safeParse({
      submitterType: "community",
      name: "Waterloo Build Weekend",
      sourceUrl: "https://example.com/event",
    });

    expect(result.success).toBe(false);
  });

  it("drops hackathon detail fields from community submissions", () => {
    // Community submitters no longer send dates or location — a reviewer fills
    // those in later — so any such fields are stripped rather than persisted.
    const result = communitySubmissionSchema.parse({
      submitterType: "community",
      name: "Waterloo Build Weekend",
      websiteUrl: "https://example.com",
      sourceUrl: "https://example.com/event",
      country: "Canada",
      startDate: "2026-09-12",
      format: "in_person",
    });

    expect(result).not.toHaveProperty("country");
    expect(result).not.toHaveProperty("startDate");
    expect(result).not.toHaveProperty("format");
  });

  it("normalizes location aliases in organizer submissions", () => {
    const result = normalizeSubmissionPayload(organizerSubmissionSchema.parse({
      submitterType: "organizer",
      name: "Waterloo Build Weekend",
      organizationName: "Waterloo Builders",
      websiteUrl: "https://example.com",
      city: "toronto",
      region: "ON",
      country: "CA",
      startDate: "2026-09-12",
      endDate: "2026-09-14",
      format: "in_person",
      shortDescription: "A weekend hackathon for students building useful software.",
    }));

    expect(result.city).toBe("Toronto");
    expect(result.region).toBe("Ontario");
    expect(result.country).toBe("Canada");
  });

  it("accepts a full organizer submission", () => {
    const result = organizerSubmissionSchema.safeParse({
      submitterType: "organizer",
      name: "Waterloo Build Weekend",
      organizationName: "Waterloo Builders",
      websiteUrl: "https://example.com",
      imageUrl: "https://example.com/event-image.jpg",
      country: "Canada",
      startDate: "2026-09-12",
      endDate: "2026-09-14",
      format: "in_person",
      shortDescription: "A weekend hackathon for students building useful software.",
      applicationUrl: "https://example.com/apply",
      applicationOpensAt: "2026-07-01",
      applicationClosesAt: "2026-08-20",
      beginnerFriendly: true,
    });

    expect(result.success).toBe(true);
  });

  it("does not expose removed organizer submission fields", () => {
    const result = organizerSubmissionSchema.parse({
      submitterType: "organizer",
      name: "Waterloo Build Weekend",
      organizationName: "Waterloo Builders",
      websiteUrl: "https://example.com",
      country: "Canada",
      startDate: "2026-09-12",
      endDate: "2026-09-14",
      format: "in_person",
      shortDescription: "A weekend hackathon for students building useful software.",
      acceptanceAt: "2026-08-30",
      submissionDeadlineAt: "2026-09-14",
      discordUrl: "https://discord.gg/build",
      devpostUrl: "https://devpost.com/example",
      eligibility: "Students only.",
    });

    expect(result).toMatchObject({
      acceptanceAt: new Date("2026-08-30"),
    });
    expect(result).not.toHaveProperty("submissionDeadlineAt");
    expect(result).not.toHaveProperty("discordUrl");
    expect(result).not.toHaveProperty("devpostUrl");
    expect(result).not.toHaveProperty("eligibility");
  });

  it("rejects an end date before the start date", () => {
    const result = organizerSubmissionSchema.safeParse({
      submitterType: "organizer",
      name: "Backwards Hack",
      organizationName: "Waterloo Builders",
      websiteUrl: "https://example.com",
      country: "Canada",
      startDate: "2026-09-14",
      endDate: "2026-09-12",
      format: "online",
      shortDescription: "A weekend hackathon for students building useful software.",
    });

    expect(result.success).toBe(false);
  });

  it("rejects the removed hybrid format", () => {
    const result = organizerSubmissionSchema.safeParse({
      submitterType: "organizer",
      name: "Waterloo Build Weekend",
      organizationName: "Waterloo Builders",
      websiteUrl: "https://example.com",
      country: "Canada",
      startDate: "2026-09-12",
      endDate: "2026-09-14",
      format: "hybrid",
      shortDescription: "A weekend hackathon for students building useful software.",
    });

    expect(result.success).toBe(false);
  });
});

describe("adminHackathonImportSchema", () => {
  const payload = {
    name: "Waterloo Build Weekend",
    organizationName: "Waterloo Builders",
    websiteUrl: "https://example.com",
    country: "Canada",
    startDate: "2026-09-12",
    endDate: "2026-09-14",
    format: "in_person",
  };

  it("accepts a pasted array of hackathons", () => {
    const result = adminHackathonImportSchema.safeParse([payload]);

    expect(result.success).toBe(true);
  });

  it("accepts an optional recurring flag on imported hackathons", () => {
    const result = adminHackathonImportSchema.parse([{ ...payload, recurring: true }]);

    expect(result.hackathons[0].recurring).toBe(true);
  });

  it("imports the scraper's high-school-only classification", () => {
    const result = adminHackathonImportSchema.parse([{ ...payload, highSchoolersOnly: true }]);

    expect(result.hackathons[0].highSchoolersOnly).toBe(true);
  });

  it("treats older imports without a high-school classification as false", () => {
    const result = adminHackathonImportSchema.parse([payload]);

    expect(result.hackathons[0].highSchoolersOnly).toBe(false);
  });

  it("accepts a wrapped hackathons array", () => {
    const result = adminHackathonImportSchema.safeParse({ hackathons: [payload] });

    expect(result.success).toBe(true);
  });

  it("accepts scraped import batches larger than 100 items", () => {
    const result = adminHackathonImportSchema.safeParse({
      hackathons: Array.from({ length: 101 }, (_, index) => ({
        ...payload,
        name: `Waterloo Build Weekend ${index}`,
      })),
    });

    expect(result.success).toBe(true);
  });

  it("ignores unknown fields in uploaded hackathon JSON", () => {
    const result = adminHackathonImportSchema.parse({
      ignoredBatchField: "not persisted",
      hackathons: [{ ...payload, ignoredPayloadField: "not persisted" }],
    });

    expect(result).not.toHaveProperty("ignoredBatchField");
    expect(result.hackathons[0]).not.toHaveProperty("ignoredPayloadField");
  });

  it("rejects an invalid image URL", () => {
    const result = adminHackathonImportSchema.safeParse({ hackathons: [{ ...payload, imageUrl: "not-a-url" }] });

    expect(result.success).toBe(false);
  });

  it("normalizes location aliases in imports", () => {
    const result = adminHackathonImportSchema.parse({
      hackathons: [{ ...payload, city: "new york", region: "NY", country: "USA" }],
    });
    const [normalized] = result.hackathons;

    expect(normalized.city).toBe("New York");
    expect(normalized.region).toBe("New York");
    expect(normalized.country).toBe("United States");
  });
});

describe("adminHackathonFixImportSchema", () => {
  it("ignores unknown fields in uploaded fix JSON", () => {
    const result = adminHackathonFixImportSchema.parse({
      ignoredBatchField: "not persisted",
      items: [
        {
          reason: "Needs manual review",
          raw: { name: "Imported Hackathon" },
          ignoredItemField: "not persisted",
        },
      ],
    });

    expect(result).not.toHaveProperty("ignoredBatchField");
    expect(result.items[0]).not.toHaveProperty("ignoredItemField");
  });
});

describe("reviewActionSchema", () => {
  it("requires a rejection reason", () => {
    const result = reviewActionSchema.safeParse({
      action: "reject",
      rejectionReason: "",
    });

    expect(result.success).toBe(false);
  });

  it("accepts rejection without an approval payload", () => {
    const result = reviewActionSchema.safeParse({
      action: "reject",
      rejectionReason: "The submission is not a hackathon.",
    });

    expect(result.success).toBe(true);
  });

  it("carries the recurring toggle inside the normalized payload, defaulting off", () => {
    const normalizedPayload = {
      name: "Hack the North",
      websiteUrl: "https://example.com",
      country: "Canada",
      startDate: "2026-09-12",
      endDate: "2026-09-14",
      format: "in_person",
    };

    const withToggle = reviewActionSchema.parse({
      action: "approve_new",
      normalizedPayload: { ...normalizedPayload, recurring: true },
    });
    const withoutToggle = reviewActionSchema.parse({
      action: "approve_new",
      normalizedPayload,
    });

    expect(withToggle).toMatchObject({ normalizedPayload: { recurring: true } });
    expect(withoutToggle).toMatchObject({ normalizedPayload: { recurring: false } });
  });
});

describe("adminHackathonUpdateSchema", () => {
  it("strips the recurring flag so full-payload edits cannot change it", () => {
    const result = adminHackathonUpdateSchema.parse({
      name: "Hack the North",
      websiteUrl: "https://example.com",
      country: "Canada",
      startDate: "2026-09-12",
      endDate: "2026-09-14",
      format: "in_person",
      recurring: true,
    });

    expect(result).not.toHaveProperty("recurring");
  });
});

describe("adminHackathonEditSchema", () => {
  const payload = {
    name: "Hack the North",
    websiteUrl: "https://example.com",
    country: "Canada",
    startDate: "2026-09-12",
    endDate: "2026-09-14",
    format: "in_person",
  };

  it("accepts a Discord channel snowflake for admin edits", () => {
    expect(
      adminHackathonEditSchema.parse({ ...payload, discordChannelId: "123456789012345678" })
        .discordChannelId
    ).toBe("123456789012345678");
  });

  it("rejects malformed Discord channel IDs", () => {
    expect(adminHackathonEditSchema.safeParse({ ...payload, discordChannelId: "not-an-id" }).success).toBe(false);
  });
});

describe("adminHackathonCreateSchema", () => {
  it("accepts past dates and keeps the recurring flag for one-shot publishing", () => {
    const result = adminHackathonCreateSchema.parse({
      name: "Hack the North",
      websiteUrl: "https://example.com",
      country: "Canada",
      startDate: "2025-09-12",
      endDate: "2025-09-14",
      format: "in_person",
      recurring: true,
    });

    expect(result.recurring).toBe(true);
    expect(result.createDiscordChannel).toBe(false);
  });

  it("rejects an end date before the start date", () => {
    expect(
      adminHackathonCreateSchema.safeParse({
        name: "Hack the North",
        websiteUrl: "https://example.com",
        country: "Canada",
        startDate: "2025-09-14",
        endDate: "2025-09-12",
        format: "in_person",
      }).success
    ).toBe(false);
  });

  it("accepts an existing Discord channel ID instead of creating one", () => {
    const result = adminHackathonCreateSchema.parse({
      name: "Hack the North",
      websiteUrl: "https://example.com",
      country: "Canada",
      startDate: "2026-09-12",
      endDate: "2026-09-14",
      format: "in_person",
      discordChannelId: "123456789012345678",
    });

    expect(result.discordChannelId).toBe("123456789012345678");
  });

  it("does not allow adopting and creating a Discord channel together", () => {
    expect(
      adminHackathonCreateSchema.safeParse({
        name: "Hack the North",
        websiteUrl: "https://example.com",
        country: "Canada",
        startDate: "2026-09-12",
        endDate: "2026-09-14",
        format: "in_person",
        createDiscordChannel: true,
        discordChannelId: "123456789012345678",
      }).success
    ).toBe(false);
  });
});

describe("adminHackathonRecurringSchema", () => {
  it("requires an explicit boolean", () => {
    expect(adminHackathonRecurringSchema.safeParse({ isRecurring: true }).success).toBe(true);
    expect(adminHackathonRecurringSchema.safeParse({ isRecurring: "yes" }).success).toBe(false);
    expect(adminHackathonRecurringSchema.safeParse({}).success).toBe(false);
  });
});

describe("profileUpdateSchema", () => {
  it("accepts the requested social links", () => {
    const result = profileUpdateSchema.safeParse({
      linkedinUrl: "https://linkedin.com/in/example",
      instagramUrl: "https://instagram.com/example",
      xUrl: "https://x.com/example",
      devpostUrl: "https://devpost.com/example",
    });

    expect(result.success).toBe(true);
  });

  it("keeps only known skills, deduped and in canonical order", () => {
    const result = profileUpdateSchema.parse({
      // Out of order, with a duplicate and an unknown token mixed in.
      skills: ["Django", "not-a-real-skill", "Python", "Django"],
    });

    expect(result.skills).toEqual(["Python", "Django"]);
  });
});
