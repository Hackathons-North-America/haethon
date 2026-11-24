import { afterEach, describe, expect, it, vi } from "vitest";

import { getResolvedTheme, parseTheme, setTheme, THEME_BOOT_SCRIPT, THEME_COOKIE } from "@/lib/theme";

function clearThemeCookie() {
  document.cookie = `${THEME_COOKIE}=; Path=/; Max-Age=0`;
}

function mockOsPrefersDark(matches: boolean) {
  // jsdom has no matchMedia, so stub it rather than spy on it.
  vi.stubGlobal("matchMedia", () => ({ matches }) as MediaQueryList);
}

function runBootScript() {
  new Function(THEME_BOOT_SCRIPT)();
}

afterEach(() => {
  clearThemeCookie();
  delete document.documentElement.dataset.theme;
  vi.unstubAllGlobals();
});

describe("parseTheme", () => {
  it("accepts only light and dark", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
    expect(parseTheme("system")).toBeNull();
    expect(parseTheme(undefined)).toBeNull();
  });
});

describe("THEME_BOOT_SCRIPT", () => {
  it("applies a saved choice from the cookie", () => {
    document.cookie = `${THEME_COOKIE}=dark; Path=/`;
    runBootScript();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("leaves the OS in charge when nothing is saved", () => {
    runBootScript();
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });

  it("ignores unknown values and look-alike cookie names", () => {
    document.cookie = `${THEME_COOKIE}=sepia; Path=/`;
    document.cookie = `x${THEME_COOKIE}=dark; Path=/`;
    runBootScript();
    expect(document.documentElement.dataset.theme).toBeUndefined();
    document.cookie = `x${THEME_COOKIE}=; Path=/; Max-Age=0`;
  });
});

describe("getResolvedTheme", () => {
  it("follows the OS without a saved choice", () => {
    mockOsPrefersDark(true);
    expect(getResolvedTheme()).toBe("dark");
  });

  it("prefers the saved choice over the OS", () => {
    mockOsPrefersDark(true);
    setTheme("light");
    expect(getResolvedTheme()).toBe("light");
  });
});

describe("setTheme", () => {
  it("updates <html> and persists the choice for the boot script", () => {
    setTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.cookie).toContain(`${THEME_COOKIE}=dark`);

    delete document.documentElement.dataset.theme;
    runBootScript();
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});
