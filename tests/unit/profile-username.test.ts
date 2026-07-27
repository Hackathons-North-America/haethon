import { describe, expect, it } from "vitest";

import {
  createPermanentProfileUsername,
  isProfileUsername,
  normalizeProfileUsername,
  profileShareUrl,
} from "@/lib/profile/username";

describe("profile usernames", () => {
  it("normalizes a username for a public URL", () => {
    expect(normalizeProfileUsername(" James.Caõ! ")).toBe("james-cao");
  });

  it("keeps a Clerk username when one exists", () => {
    expect(
      createPermanentProfileUsername({
        clerkUsername: "James_Cao",
        email: "other@example.com",
        clerkUserId: "user_123",
      })
    ).toBe("james_cao");
  });

  it("creates the same fallback for the same account", () => {
    const input = {
      clerkUsername: null,
      email: "james.cao@example.com",
      clerkUserId: "user_123",
    };

    expect(createPermanentProfileUsername(input)).toBe(createPermanentProfileUsername(input));
    expect(createPermanentProfileUsername(input)).toBe("james-cao-user_123");
  });

  it("validates paths and builds the permanent share URL", () => {
    expect(isProfileUsername("james_cao")).toBe(true);
    expect(isProfileUsername("James Cao")).toBe(false);
    expect(profileShareUrl("https://hna.example/", "james_cao")).toBe("https://hna.example/p/james_cao");
  });
});
