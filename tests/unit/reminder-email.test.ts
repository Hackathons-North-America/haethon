import { describe, expect, it } from "vitest";

import { buildReminderEmail } from "@/lib/notifications/reminder-email";

describe("buildReminderEmail", () => {
  it("renders the subject, html, and text for a selectable reminder", async () => {
    const email = await buildReminderEmail({
      type: "hackathon_week_before",
      firstName: "Ada",
      hackathonName: "HackNight 2026",
      hackathonSlug: "hacknight-2026",
      scheduledFor: new Date("2026-09-05T15:00:00Z"),
      appUrl: "https://haethon.dev",
      unsubscribeUrl: "https://haethon.dev/api/email/unsubscribe?token=signed-token",
    });

    expect(email.subject).toBe("1 week before the hackathon · HackNight 2026");
    expect(email.html).toContain("HackNight 2026");
    expect(email.html).toContain("https://haethon.dev/hackathons/hacknight-2026");
    expect(email.html).toContain("https://haethon.dev/my");
    expect(email.html).toContain("https://haethon.dev/api/email/unsubscribe?token=signed-token");
    expect(email.html).toContain("Unsubscribe from all emails");
    expect(email.html).toContain("#007354");
    expect(email.html).toContain("#FBF7F0");
    expect(email.html).not.toContain("#660000");
    expect(email.text).toContain("Hey Ada,");
    expect(email.text).toContain("The event starts in a week");
    expect(email.text).toContain("Unsubscribe from all emails");
  });

  it("renders the application-open reminder copy", async () => {
    const email = await buildReminderEmail({
      type: "application_week_before",
      firstName: "Ada",
      hackathonName: "HackNight 2026",
      hackathonSlug: "hacknight-2026",
      scheduledFor: new Date("2026-07-08T00:00:00Z"),
      appUrl: "https://haethon.dev",
      unsubscribeUrl: "https://haethon.dev/api/email/unsubscribe?token=signed-token",
    });

    expect(email.subject).toBe("1 week before applications open · HackNight 2026");
    expect(email.text).toContain("Applications open in a week");
  });

  it("renders the applications-are-open announcement copy", async () => {
    const email = await buildReminderEmail({
      type: "application_open",
      firstName: "Ada",
      hackathonName: "HackNight 2026",
      hackathonSlug: "hacknight-2026",
      scheduledFor: new Date("2026-07-15T00:00:00Z"),
      appUrl: "https://haethon.dev",
      unsubscribeUrl: "https://haethon.dev/api/email/unsubscribe?token=signed-token",
    });

    expect(email.subject).toBe("Applications open · HackNight 2026");
    expect(email.text).toContain("Applications are open");
  });

  it("falls back to a generic greeting and the label when copy is missing", async () => {
    const email = await buildReminderEmail({
      type: "add_to_profile",
      firstName: null,
      hackathonName: "HackNight 2026",
      hackathonSlug: "hacknight-2026",
      scheduledFor: new Date("2026-09-16T00:00:00Z"),
      appUrl: "https://haethon.dev",
      unsubscribeUrl: "https://haethon.dev/api/email/unsubscribe?token=signed-token",
    });

    expect(email.subject).toBe("Add to profile · HackNight 2026");
    expect(email.text).toContain("Hey hacker,");
  });
});
