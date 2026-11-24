import { describe, expect, it } from "vitest";

import { syncedProfileChanged, type SyncedProfile } from "@/lib/profile/clerk-sync";

const stored: SyncedProfile = {
  email: "ada@example.com",
  firstName: "Ada",
  lastName: "Lovelace",
  imageUrl: "https://img.example.com/ada.png",
  role: "user",
};

describe("syncedProfileChanged", () => {
  it("reports no change when Clerk matches the stored row, so the UPDATE is skipped", () => {
    expect(syncedProfileChanged(stored, { ...stored })).toBe(false);
  });

  it.each([
    ["email", { email: "ada@new.example.com" }],
    ["firstName", { firstName: "Augusta" }],
    ["lastName", { lastName: "King" }],
    ["imageUrl", { imageUrl: "https://img.example.com/new.png" }],
    ["role", { role: "admin" as const }],
  ])("reports a change when %s differs", (_field, patch) => {
    expect(syncedProfileChanged(stored, { ...stored, ...patch })).toBe(true);
  });

  it("reports a change when a name is cleared in Clerk", () => {
    expect(syncedProfileChanged(stored, { ...stored, lastName: null })).toBe(true);
  });

  it("treats a missing value and a stored NULL as the same thing", () => {
    const unnamed = { ...stored, firstName: null, lastName: null, imageUrl: null };
    const fromClerk = { ...stored, firstName: undefined, lastName: undefined, imageUrl: undefined } as unknown as SyncedProfile;

    expect(syncedProfileChanged(unnamed, fromClerk)).toBe(false);
  });
});
