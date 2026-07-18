import { describe, expect, it } from "vitest";

import { halfYearOf } from "@/lib/hackathons/half-year";

describe("half-year buckets", () => {
  it("puts January through June in H1 and July through December in H2 (UTC)", () => {
    expect(halfYearOf(new Date("2026-01-01T00:00:00.000Z"))).toEqual({ half: 1, year: 2026 });
    expect(halfYearOf(new Date("2026-06-30T23:59:59.000Z"))).toEqual({ half: 1, year: 2026 });
    expect(halfYearOf(new Date("2026-07-01T00:00:00.000Z"))).toEqual({ half: 2, year: 2026 });
    expect(halfYearOf(new Date("2026-12-31T23:59:59.000Z"))).toEqual({ half: 2, year: 2026 });
  });
});
