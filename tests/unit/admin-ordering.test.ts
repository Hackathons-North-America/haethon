import { describe, expect, it } from "vitest";

import { orderAdminHackathonRows, projectedNextStartsAt } from "@/lib/hackathons/admin-ordering";

const now = new Date("2026-07-14T12:00:00.000Z");

function row(name: string, startsAt: string | null, endsAt: string | null) {
  return {
    name,
    startsAt: startsAt ? new Date(startsAt) : null,
    endsAt: endsAt ? new Date(endsAt) : null,
  };
}

describe("projectedNextStartsAt", () => {
  it("assumes the event repeats on the same day next year", () => {
    expect(projectedNextStartsAt(new Date("2025-09-25T00:00:00.000Z"), now)).toEqual(
      new Date("2026-09-25T00:00:00.000Z")
    );
  });

  it("advances multi-year-old editions to the nearest upcoming anniversary", () => {
    expect(projectedNextStartsAt(new Date("2023-09-25T00:00:00.000Z"), now)).toEqual(
      new Date("2026-09-25T00:00:00.000Z")
    );
  });
});

describe("orderAdminHackathonRows", () => {
  it("keeps upcoming events first and sinks past events to the bottom", () => {
    const past = row("Past", "2025-09-25T00:00:00.000Z", "2025-09-27T00:00:00.000Z");
    const upcomingLate = row("Upcoming late", "2026-11-01T00:00:00.000Z", "2026-11-02T00:00:00.000Z");
    const upcomingSoon = row("Upcoming soon", "2026-08-01T00:00:00.000Z", "2026-08-02T00:00:00.000Z");

    expect(orderAdminHackathonRows([past, upcomingLate, upcomingSoon], now)).toEqual([
      upcomingSoon,
      upcomingLate,
      past,
    ]);
  });

  it("orders the past group by projected next occurrence, not by when it last ran", () => {
    // May 2026 already happened, so its next assumed run (May 2027) comes
    // after September 2025's assumed run (September 2026).
    const pastMay = row("May event", "2026-05-01T00:00:00.000Z", "2026-05-02T00:00:00.000Z");
    const pastSeptember = row("September event", "2025-09-25T00:00:00.000Z", "2025-09-27T00:00:00.000Z");

    expect(orderAdminHackathonRows([pastMay, pastSeptember], now)).toEqual([pastSeptember, pastMay]);
  });

  it("keeps events with unknown dates at the end of the upcoming group", () => {
    const noDates = row("Dates TBA", null, null);
    const upcoming = row("Upcoming", "2026-08-01T00:00:00.000Z", "2026-08-02T00:00:00.000Z");
    const past = row("Past", "2025-09-25T00:00:00.000Z", "2025-09-27T00:00:00.000Z");

    expect(orderAdminHackathonRows([noDates, past, upcoming], now)).toEqual([upcoming, noDates, past]);
  });
});
