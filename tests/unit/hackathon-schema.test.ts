import { describe, expect, it } from "vitest";

import {
  communitySubmissionSchema,
  hackathonSearchSchema,
  organizerSubmissionSchema,
  profileUpdateSchema,
  reviewActionSchema,
} from "@/lib/validations/hackathon";

describe("hackathonSearchSchema", () => {
  it("accepts a valid filter payload", () => {
    const result = hackathonSearchSchema.safeParse({
      q: "Toronto",
      city: "Toronto",
      format: "in_person",
      limit: "12",
    });

    expect(result.success).toBe(true);
  });
});

describe("hackathon submission schemas", () => {
  it("accepts a minimal community submission", () => {
    const result = communitySubmissionSchema.safeParse({
      submitterType: "community",
      name: "Waterloo Build Weekend",
      sourceUrl: "https://example.com/event",
      country: "Canada",
      startDate: "2026-09-12",
      endDate: "2026-09-14",
      format: "in_person",
    });

    expect(result.success).toBe(true);
  });

  it("accepts a full organizer submission", () => {
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
      applicationUrl: "https://example.com/apply",
      applicationOpensAt: "2026-07-01",
      applicationClosesAt: "2026-08-20",
      discordUrl: "https://discord.gg/build",
      devpostUrl: "https://devpost.com/example",
      beginnerFriendly: true,
    });

    expect(result.success).toBe(true);
  });

  it("rejects an end date before the start date", () => {
    const result = communitySubmissionSchema.safeParse({
      submitterType: "community",
      name: "Backwards Hack",
      sourceUrl: "https://example.com/event",
      country: "Canada",
      startDate: "2026-09-14",
      endDate: "2026-09-12",
      format: "online",
    });

    expect(result.success).toBe(false);
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
