import { beforeEach, describe, expect, it, vi } from "vitest";

import { captureAnalyticsEvent, registerAnalyticsClient, resetAnalyticsClientForTests } from "@/lib/analytics/client";
import { trackEvent } from "@/lib/analytics/events";

describe("analytics client handle", () => {
  beforeEach(() => {
    resetAnalyticsClientForTests();
  });

  it("holds events tracked before the SDK loads and delivers them, in order, on registration", () => {
    const capture = vi.fn();

    captureAnalyticsEvent("first", { n: 1 });
    captureAnalyticsEvent("second");
    expect(capture).not.toHaveBeenCalled();

    registerAnalyticsClient({ capture });

    expect(capture.mock.calls).toEqual([
      ["first", { n: 1 }],
      ["second", undefined],
    ]);
  });

  it("sends straight through once the SDK is registered", () => {
    const capture = vi.fn();
    registerAnalyticsClient({ capture });

    captureAnalyticsEvent("live", { ok: true });

    expect(capture).toHaveBeenCalledExactlyOnceWith("live", { ok: true });
  });

  it("does not replay already-delivered events to a later registration", () => {
    const first = vi.fn();
    const second = vi.fn();

    captureAnalyticsEvent("queued");
    registerAnalyticsClient({ capture: first });
    registerAnalyticsClient({ capture: second });

    expect(first).toHaveBeenCalledTimes(1);
    expect(second).not.toHaveBeenCalled();
  });

  it("caps what it holds when the SDK never loads (analytics disabled)", () => {
    for (let index = 0; index < 500; index++) {
      captureAnalyticsEvent("spam", { index });
    }

    const capture = vi.fn();
    registerAnalyticsClient({ capture });

    expect(capture).toHaveBeenCalledTimes(50);
    expect(capture.mock.calls[0]).toEqual(["spam", { index: 0 }]);
  });

  it("routes trackEvent through the handle with the event's name and properties", () => {
    const capture = vi.fn();
    registerAnalyticsClient({ capture });

    trackEvent("organizer_checkin_code_generated", { hackathon_id: "h1" });

    expect(capture).toHaveBeenCalledExactlyOnceWith("organizer_checkin_code_generated", { hackathon_id: "h1" });
  });
});
