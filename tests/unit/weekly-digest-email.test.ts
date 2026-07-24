import { describe, expect, it } from "vitest";

import { buildWeeklyDigestEmail } from "@/lib/notifications/weekly-digest-email";

const base = {
  firstName: "Ada",
  appUrl: "https://haethon.dev",
  unsubscribeUrl: "https://haethon.dev/api/email/unsubscribe?token=signed-token",
};

const reminderRow = {
  type: "hackathon_week_before",
  scheduledFor: new Date("2026-09-05T15:00:00Z"),
  hackathonName: "HackNight 2026",
  hackathonSlug: "hacknight-2026",
};

const countryItem = {
  name: "Maple Hacks",
  location: "Toronto, ON",
  dateRange: "Oct 3–5, 2026",
  detailUrl: "https://haethon.dev/hackathons/maple-hacks",
};

describe("buildWeeklyDigestEmail", () => {
  it("renders reminder items with the event's actual date, a week after scheduledFor", async () => {
    const email = await buildWeeklyDigestEmail({
      ...base,
      reminderRows: [reminderRow],
      country: null,
      countryItems: [],
    });

    expect(email.subject).toBe("Coming up · HackNight 2026");
    expect(email.text).toContain("Hey Ada,");
    expect(email.text).toContain("Starts Sep 12, 2026");
    expect(email.html).toContain("https://haethon.dev/hackathons/hacknight-2026");
    expect(email.html).toContain("Unsubscribe from all emails");
    expect(email.html).toContain("#007354");
    expect(email.html).toContain("#FBF7F0");
    expect(email.html).not.toContain("#660000");
  });

  it("renders application reminders with application copy", async () => {
    const email = await buildWeeklyDigestEmail({
      ...base,
      reminderRows: [{ ...reminderRow, type: "application_week_before" }],
      country: null,
      countryItems: [],
    });

    expect(email.text).toContain("Applications open Sep 12, 2026");
  });

  it("combines reminders and country alerts into one email", async () => {
    const email = await buildWeeklyDigestEmail({
      ...base,
      reminderRows: [reminderRow, { ...reminderRow, hackathonName: "Other Hack", hackathonSlug: "other-hack" }],
      country: "Canada",
      countryItems: [countryItem],
    });

    expect(email.subject).toBe("Your week ahead · 3 updates");
    expect(email.text).toContain("Coming up");
    expect(email.text).toContain("New in Canada");
    expect(email.text).toContain("Maple Hacks");
    expect(email.text).toContain("Toronto, ON");
  });

  it("keeps the country-alert subject when there are no reminders", async () => {
    const email = await buildWeeklyDigestEmail({
      ...base,
      firstName: null,
      reminderRows: [],
      country: "Canada",
      countryItems: [countryItem],
    });

    expect(email.subject).toBe("New hackathon in Canada: Maple Hacks");
    expect(email.text).toContain("Hey hacker,");
    expect(email.html).toContain("Browse the Hackathons DB");
  });
});
