import { describe, expect, it, vi } from "vitest";

vi.mock("@/lib/env", () => ({ env: {} }));

const { MAX_RATE_LIMIT_WAIT_MS, shouldRejectRateLimit } = await import("@/lib/discord/rest");

/* The bot runs inside 60-second functions. A Discord wait longer than a few
   seconds must fail the request (and requeue its job), not sleep. */
describe("shouldRejectRateLimit", () => {
  it("waits out a short limit", () => {
    expect(shouldRejectRateLimit({ retryAfter: 1_200, sublimitTimeout: 0 })).toBe(false);
    expect(shouldRejectRateLimit({ retryAfter: MAX_RATE_LIMIT_WAIT_MS, sublimitTimeout: 0 })).toBe(false);
  });

  it("gives up on a long one", () => {
    // A channel rename's sublimit: two per ten minutes.
    expect(shouldRejectRateLimit({ retryAfter: 900, sublimitTimeout: 540_000 })).toBe(true);
    expect(shouldRejectRateLimit({ retryAfter: 60_000, sublimitTimeout: 0 })).toBe(true);
  });
});
