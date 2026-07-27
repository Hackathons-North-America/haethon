import { describe, expect, it } from "vitest";

import {
  countryOptions,
  filterCountryOptions,
  pinnedCountryOptions,
} from "@/lib/hackathons/countries";

describe("country options", () => {
  it("pins the primary markets before the alphabetical country list", () => {
    const options = filterCountryOptions("");

    expect(options.slice(0, pinnedCountryOptions.length)).toEqual(pinnedCountryOptions);
    expect(new Set(options).size).toBe(countryOptions.length);
    expect(options).toHaveLength(countryOptions.length);
    expect(options[pinnedCountryOptions.length]).toBe("Afghanistan");
  });

  it("keeps typed search results alphabetical", () => {
    expect(filterCountryOptions("united")).toEqual([
      "United Arab Emirates",
      "United Kingdom",
      "United States",
    ]);
  });
});
