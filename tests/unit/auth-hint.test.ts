import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import {
  AUTH_HINT_STORAGE_KEY,
  parseAuthHint,
  readStoredAuthHint,
  serializeAuthHint,
  writeStoredAuthHint,
} from "@/lib/auth-hint";
import { isAdminRole, isOrganizerRole, parseAppRole, roleFromSessionClaims } from "@/lib/auth-role";

describe("auth hint", () => {
  /* The test environment's document has no origin, so it has no storage of
     its own; a Map stands in for it. */
  beforeEach(() => {
    const entries = new Map<string, string>();

    vi.stubGlobal("localStorage", {
      getItem: (key: string) => entries.get(key) ?? null,
      setItem: (key: string, value: string) => void entries.set(key, value),
    });
  });

  afterEach(() => vi.unstubAllGlobals());

  it("round-trips the sign-in state and role", () => {
    for (const hint of [
      { isSignedIn: true, role: "admin" },
      { isSignedIn: true, role: "user" },
      { isSignedIn: false, role: "user" },
    ] as const) {
      expect(parseAuthHint(serializeAuthHint(hint))).toEqual(hint);
    }
  });

  it("does not remember a role for a signed-out visitor", () => {
    expect(serializeAuthHint({ isSignedIn: false, role: "admin" })).toBe("out");
  });

  it("treats anything unrecognized as no hint, and an unknown role as a plain user", () => {
    expect(parseAuthHint(null)).toBeNull();
    expect(parseAuthHint("")).toBeNull();
    expect(parseAuthHint("yes")).toBeNull();
    expect(parseAuthHint("in:superuser")).toEqual({ isSignedIn: true, role: "user" });
  });

  it("stores the hint under its key", () => {
    expect(readStoredAuthHint()).toBeNull();

    writeStoredAuthHint({ isSignedIn: true, role: "organizer" });

    expect(window.localStorage.getItem(AUTH_HINT_STORAGE_KEY)).toBe("in:organizer");
    expect(parseAuthHint(readStoredAuthHint())).toEqual({ isSignedIn: true, role: "organizer" });
  });
});

describe("role helpers", () => {
  it("reads the role from session claims and defaults to user", () => {
    expect(roleFromSessionClaims({ metadata: { role: "admin" } })).toBe("admin");
    expect(roleFromSessionClaims({ metadata: {} })).toBe("user");
    expect(roleFromSessionClaims(null)).toBe("user");
  });

  it("only lets known role names through parseAppRole", () => {
    expect(parseAppRole("organizer")).toBe("organizer");
    expect(parseAppRole("root")).toBe("user");
    expect(parseAppRole(undefined)).toBe("user");
  });

  it("keeps admin a superset of organizer", () => {
    expect(isAdminRole("admin")).toBe(true);
    expect(isAdminRole("organizer")).toBe(false);
    expect(isOrganizerRole("admin")).toBe(true);
    expect(isOrganizerRole("organizer")).toBe(true);
    expect(isOrganizerRole("user")).toBe(false);
  });
});

describe("auth hint without storage", () => {
  it("reads as no hint and ignores writes instead of throwing", () => {
    vi.stubGlobal("localStorage", {
      getItem: () => {
        throw new Error("blocked");
      },
      setItem: () => {
        throw new Error("blocked");
      },
    });

    expect(readStoredAuthHint()).toBeNull();
    expect(() => writeStoredAuthHint({ isSignedIn: true, role: "user" })).not.toThrow();

    vi.unstubAllGlobals();
  });
});
