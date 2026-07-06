import { describe, expect, it } from "vitest";

import {
  adminHackathonFixImportSchema,
  adminHackathonImportSchema,
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
  it("accepts a minimal community submission", () => {
    const result = communitySubmissionSchema.safeParse({
      submitterType: "community",
      name: "Waterloo Build Weekend",
      sourceUrl: "https://example.com/event",
      websiteUrl: "https://example.com",
      country: "Canada",
      startDate: "2026-09-12",
      endDate: "2026-09-14",
      format: "in_person",
    });

    expect(result.success).toBe(true);
  });

  it("normalizes location aliases in community submissions", () => {
    const result = normalizeSubmissionPayload(communitySubmissionSchema.parse({
      submitterType: "community",
      name: "Waterloo Build Weekend",
      sourceUrl: "https://example.com/event",
      websiteUrl: "https://example.com",
      city: "toronto",
      region: "ON",
      country: "CA",
      startDate: "2026-09-12",
      endDate: "2026-09-14",
      format: "in_person",
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
    const result = communitySubmissionSchema.safeParse({
      submitterType: "community",
      name: "Backwards Hack",
      sourceUrl: "https://example.com/event",
      websiteUrl: "https://example.com",
      country: "Canada",
      startDate: "2026-09-14",
      endDate: "2026-09-12",
      format: "online",
    });

    expect(result.success).toBe(false);
  });

  it("rejects the removed hybrid format", () => {
    const result = communitySubmissionSchema.safeParse({
      submitterType: "community",
      name: "Waterloo Build Weekend",
      sourceUrl: "https://example.com/event",
      websiteUrl: "https://example.com",
      country: "Canada",
      startDate: "2026-09-12",
      endDate: "2026-09-14",
      format: "hybrid",
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
});
