import { describe, expect, it } from "vitest";

import { containsProfanity } from "@/lib/validations/profanity";

describe("containsProfanity", () => {
  it("flags plain profanity", () => {
    expect(containsProfanity("fuck")).toBe(true);
    expect(containsProfanity("SHIT")).toBe(true);
    expect(containsProfanity("bitchqueen")).toBe(true);
  });

  it("flags leetspeak evasions", () => {
    expect(containsProfanity("sh1t")).toBe(true);
    expect(containsProfanity("b1tch")).toBe(true);
    expect(containsProfanity("a$$hole")).toBe(true);
    expect(containsProfanity("n1gger")).toBe(true);
    expect(containsProfanity("b00bs")).toBe(true);
  });

  it("flags separator padding and repeats", () => {
    expect(containsProfanity("f.u.c.k")).toBe(true);
    expect(containsProfanity("f_u_c_k_88")).toBe(true);
    expect(containsProfanity("fuuuuck")).toBe(true);
    expect(containsProfanity("c-u-n-t")).toBe(true);
  });

  it("flags profanity embedded in a longer handle", () => {
    expect(containsProfanity("xX_fucklord_Xx")).toBe(true);
    expect(containsProfanity("whoremonger42")).toBe(true);
  });

  it("does not flag ordinary names (Scunthorpe cases)", () => {
    expect(containsProfanity("Scunthorpe")).toBe(false);
    expect(containsProfanity("classy")).toBe(false);
    expect(containsProfanity("bassist")).toBe(false);
    expect(containsProfanity("Hancock")).toBe(false);
    expect(containsProfanity("Dickens")).toBe(false);
    expect(containsProfanity("assistant")).toBe(false);
    expect(containsProfanity("Sexton")).toBe(false);
    expect(containsProfanity("cocktail")).toBe(false);
    expect(containsProfanity("analytics")).toBe(false);
    expect(containsProfanity("essex")).toBe(false);
    expect(containsProfanity("Titans")).toBe(false);
    expect(containsProfanity("conspicuous")).toBe(false);
    expect(containsProfanity("swanky")).toBe(false);
    expect(containsProfanity("grape-fan")).toBe(false);
  });

  it("flags word-boundary terms only as standalone tokens", () => {
    expect(containsProfanity("ass")).toBe(true);
    expect(containsProfanity("dumb ass")).toBe(true);
    expect(containsProfanity("ass_master")).toBe(true);
    expect(containsProfanity("dick4president")).toBe(true);
  });

  it("handles empty and clean input", () => {
    expect(containsProfanity("")).toBe(false);
    expect(containsProfanity("jane-doe")).toBe(false);
    expect(containsProfanity("builder_2026")).toBe(false);
  });
});
