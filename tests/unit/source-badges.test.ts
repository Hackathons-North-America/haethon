import { describe, expect, it } from "vitest";

import {
  COMMUNITY_FORM_SOURCE_URL,
  deriveSourceType,
  HACKATHON_SOURCES,
  sourceBadge,
} from "@/lib/hackathons/source-provenance";

describe("hackathon source badges", () => {
  it("identifies supported websites and reserves Community for the approved form", () => {
    expect(deriveSourceType("https://events.mlh.io/events/123")).toBe("mlh");
    expect(deriveSourceType("https://mlh.com/events/123")).toBe("mlh");
    expect(deriveSourceType("https://events.majorleaguehacking.com/example")).toBe("mlh");
    expect(deriveSourceType("https://lu.ma/example")).toBe("luma");
    expect(deriveSourceType("https://events.luma.com/example")).toBe("luma");
    expect(deriveSourceType("https://cerebralvalley.ai/events/example")).toBe("cerebral_valley");
    expect(deriveSourceType("https://events.cerebralvalley.ai/example")).toBe("cerebral_valley");
    expect(deriveSourceType("https://devpost.com/hackathons/example")).toBe("devpost");
    expect(deriveSourceType("https://example-hackathon.devpost.com")).toBe("devpost");
    expect(deriveSourceType("https://example.edu/events/hackathon")).toBe("other");
    expect(deriveSourceType(COMMUNITY_FORM_SOURCE_URL)).toBe("manual");
  });

  it("falls back through URLs until one derives a source", () => {
    expect(deriveSourceType(null, "https://devpost.com/hackathons/example")).toBe("devpost");
    expect(deriveSourceType(undefined, undefined)).toBe("other");
  });

  it("keeps URL derivation separate from importer-provided provenance", () => {
    // The import service can persist `source: \"mlh\"` for an MLH feed item
    // even when the event itself links to Devpost.
    expect(deriveSourceType("https://devpost.com/hackathons/example")).toBe("devpost");
  });

  it("labels every storable source without needing a URL", () => {
    expect(HACKATHON_SOURCES.map(sourceBadge)).toEqual([
      { type: "mlh", label: "MLH" },
      { type: "luma", label: "Luma" },
      { type: "cerebral_valley", label: "Cerebral Valley" },
      { type: "devpost", label: "Devpost" },
      { type: "organizer_site", label: "Organizer" },
      { type: "manual", label: "Community" },
      { type: "other", label: "Website" },
    ]);
  });
});
