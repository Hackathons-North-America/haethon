import { describe, expect, it } from "vitest";

import { getInitials } from "@/components/profile/profile-primitives";

describe("getInitials", () => {
  it("takes the first letter of the first two words", () => {
    expect(getInitials("Ada Lovelace")).toBe("AL");
    expect(getInitials("hack the north")).toBe("HT");
  });

  it("skips purely numeric words", () => {
    expect(getInitials("McHacks 13")).toBe("M");
    expect(getInitials("2026 HackMIT Fall")).toBe("HF");
  });

  it("skips leading punctuation inside a word", () => {
    expect(getInitials("#1 (Hack) Night")).toBe("HN");
  });

  it("returns an empty string when there is nothing to use", () => {
    expect(getInitials("  ")).toBe("");
    expect(getInitials("13")).toBe("");
  });
});
