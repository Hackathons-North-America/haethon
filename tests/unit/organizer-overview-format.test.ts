// @vitest-environment node
import { describe, expect, it } from "vitest";

import {
  formatDateRange,
  formatLocation,
  groupOverviewHackathons,
  hackathonPhase,
  initialsFor,
  phaseHint,
  type OverviewHackathon,
} from "@/components/organizer/overview/overview-format";

function hackathon(overrides: Partial<OverviewHackathon>): OverviewHackathon {
  return {
    id: overrides.name ?? "id",
    name: "MapleHacks",
    imageUrl: null,
    format: "in_person",
    status: "upcoming",
    city: "Toronto",
    region: "ON",
    country: "CA",
    startsAt: null,
    endsAt: null,
    ...overrides,
  } as OverviewHackathon;
}

const now = new Date("2026-09-14T15:00:00.000Z");

describe("hackathonPhase", () => {
  it("keeps a date-only event live through its final day", () => {
    const item = { startsAt: "2026-09-12T00:00:00.000Z", endsAt: "2026-09-14T00:00:00.000Z" };

    expect(hackathonPhase(item, now)).toBe("live");
    expect(hackathonPhase(item, new Date("2026-09-15T00:00:00.000Z"))).toBe("ended");
  });

  it("ends a timed event at its end time", () => {
    expect(hackathonPhase({ startsAt: "2026-09-12T16:00:00.000Z", endsAt: "2026-09-14T12:00:00.000Z" }, now)).toBe(
      "ended"
    );
  });

  it("separates upcoming and undated events", () => {
    expect(hackathonPhase({ startsAt: "2026-10-01T00:00:00.000Z", endsAt: "2026-10-02T00:00:00.000Z" }, now)).toBe(
      "upcoming"
    );
    expect(hackathonPhase({ startsAt: null, endsAt: null }, now)).toBe("tbd");
  });
});

describe("groupOverviewHackathons", () => {
  it("puts each row in the section its badge implies, in display order", () => {
    const { current, past } = groupOverviewHackathons(
      [
        hackathon({ name: "Undated" }),
        hackathon({ name: "Later", startsAt: "2026-11-01T00:00:00.000Z", endsAt: "2026-11-02T00:00:00.000Z" }),
        hackathon({ name: "Final day", startsAt: "2026-09-12T00:00:00.000Z", endsAt: "2026-09-14T00:00:00.000Z" }),
        hackathon({ name: "Old", startsAt: "2025-01-01T00:00:00.000Z", endsAt: "2025-01-02T00:00:00.000Z" }),
        hackathon({ name: "Recent", startsAt: "2026-08-01T00:00:00.000Z", endsAt: "2026-08-02T00:00:00.000Z" }),
      ],
      now
    );

    expect(current.map((item) => item.name)).toEqual(["Final day", "Later", "Undated"]);
    expect(past.map((item) => item.name)).toEqual(["Recent", "Old"]);
  });
});

describe("phaseHint", () => {
  it("counts UTC calendar days", () => {
    const live = { startsAt: "2026-09-12T00:00:00.000Z", endsAt: "2026-09-14T00:00:00.000Z" };
    const soon = { startsAt: "2026-09-15T00:00:00.000Z", endsAt: "2026-09-16T00:00:00.000Z" };
    const far = { startsAt: "2027-03-01T00:00:00.000Z", endsAt: "2027-03-02T00:00:00.000Z" };

    expect(phaseHint(live, "live", now)).toBe("Ends today");
    expect(phaseHint(soon, "upcoming", now)).toBe("Starts tomorrow");
    expect(phaseHint(far, "upcoming", now)).toBeNull();
  });
});

describe("formatDateRange", () => {
  /* Exact strings with plain ASCII spaces: the server (Node) and the browser
     must render identical text or React reports a hydration mismatch. */
  it("formats each range shape in UTC with deterministic separators", () => {
    expect(formatDateRange("2026-11-27T00:00:00.000Z", "2026-11-29T00:00:00.000Z")).toBe("Nov 27 \u2013 29, 2026");
    expect(formatDateRange("2026-11-30T00:00:00.000Z", "2026-12-02T00:00:00.000Z")).toBe(
      "Nov 30 \u2013 Dec 2, 2026"
    );
    expect(formatDateRange("2026-12-30T00:00:00.000Z", "2027-01-02T00:00:00.000Z")).toBe(
      "Dec 30, 2026 \u2013 Jan 2, 2027"
    );
    expect(formatDateRange("2026-11-27T00:00:00.000Z", null)).toBe("Nov 27, 2026");
    expect(formatDateRange("2026-11-27T00:00:00.000Z", "2026-11-27T00:00:00.000Z")).toBe("Nov 27, 2026");
  });

  it("reads timed values as UTC days", () => {
    /* 23:30 UTC is still the 27th in UTC even where it is already the 28th. */
    expect(formatDateRange("2026-11-27T23:30:00.000Z", "2026-11-28T01:00:00.000Z")).toBe("Nov 27 \u2013 28, 2026");
    /* Same UTC day, later time: a single day, not "Nov 27 – 27". */
    expect(formatDateRange("2026-11-27T09:00:00.000Z", "2026-11-27T21:00:00.000Z")).toBe("Nov 27, 2026");
  });

  it("never emits thin or narrow no-break spaces", () => {
    const outputs = [
      formatDateRange("2026-11-27T00:00:00.000Z", "2026-11-29T00:00:00.000Z"),
      formatDateRange("2026-11-30T00:00:00.000Z", "2026-12-02T00:00:00.000Z"),
      formatDateRange("2026-12-30T00:00:00.000Z", "2027-01-02T00:00:00.000Z"),
    ];

    for (const output of outputs) {
      expect(output).not.toMatch(/[\u2009\u202f\u00a0]/u);
    }
  });

  it("falls back when there is no start date", () => {
    expect(formatDateRange(null, null)).toBe("Dates TBD");
    expect(formatDateRange(null, "2026-11-29T00:00:00.000Z")).toBe("Dates TBD");
  });
});

describe("formatLocation", () => {
  it("falls back for missing data", () => {
    expect(formatLocation({ format: "online", city: null, region: null, country: null })).toBe("Online");
    expect(formatLocation({ format: "in_person", city: null, region: null, country: null })).toBe("Location TBD");
  });
});

describe("initialsFor", () => {
  it("skips numeric words such as edition numbers", () => {
    expect(initialsFor("McHacks 13")).toBe("MC");
    expect(initialsFor("Hack the North 2026")).toBe("HT");
    expect(initialsFor("Hack 2026 Toronto")).toBe("HT");
  });

  it("uses the first letters of the first two words", () => {
    expect(initialsFor("Maple Hacks")).toBe("MH");
    expect(initialsFor("  spaced   out  name ")).toBe("SO");
  });

  it("falls back to HN when nothing usable remains", () => {
    expect(initialsFor("")).toBe("HN");
    expect(initialsFor("2026")).toBe("HN");
  });
});
