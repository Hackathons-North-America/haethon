import { describe, expect, it } from "vitest";

import {
  computeSelectableReminderPlan,
  computeSelectableReminderSchedule,
  getSelectableReminderTypesForStatus,
} from "@/lib/hackathons/reminder-plan";

const now = new Date("2026-07-01T00:00:00Z");

const dates = {
  startsAt: new Date("2026-09-12T15:00:00Z"),
  endsAt: new Date("2026-09-14T20:00:00Z"),
  applicationOpensAt: new Date("2026-07-15T00:00:00Z"),
  applicationClosesAt: new Date("2026-08-20T00:00:00Z"),
  acceptanceAt: new Date("2026-08-28T00:00:00Z"),
};

function types(plan: ReturnType<typeof computeSelectableReminderPlan>) {
  return plan.map((entry) => entry.type);
}

describe("computeSelectableReminderPlan", () => {
  it("offers accepted hackers the two event-start reminders", () => {
    expect(getSelectableReminderTypesForStatus("accepted")).toEqual([
      "hackathon_week_before",
      "hackathon_day_before",
    ]);
  });

  it("offers interested hackers the two application-open reminders", () => {
    expect(getSelectableReminderTypesForStatus("interested")).toEqual([
      "application_week_before",
      "application_day_before",
    ]);
  });

  it("offers applied hackers the event-start reminders too", () => {
    expect(getSelectableReminderTypesForStatus("applied")).toEqual([
      "hackathon_week_before",
      "hackathon_day_before",
    ]);
  });

  it("keeps past-dated reminders in the schedule so the control still renders", () => {
    const alreadyStarted = { ...dates, startsAt: new Date("2020-01-08T00:00:00Z") };
    const schedule = computeSelectableReminderSchedule(alreadyStarted);

    expect(types(schedule)).toEqual([
      "application_week_before",
      "application_day_before",
      "hackathon_week_before",
      "hackathon_day_before",
    ]);
    // Event reminders stay anchored to the (past) start date rather than dropping out.
    expect(schedule[2].scheduledFor).toEqual(new Date("2020-01-01T00:00:00Z"));
    // The deliverable plan still filters those past sends out.
    expect(types(computeSelectableReminderPlan(alreadyStarted, now))).toEqual([
      "application_week_before",
      "application_day_before",
    ]);
  });

  it("returns nothing without dates", () => {
    expect(computeSelectableReminderPlan(null, now)).toEqual([]);
  });

  it("schedules the four selectable email reminders", () => {
    const plan = computeSelectableReminderPlan(dates, now);

    expect(types(plan)).toEqual([
      "application_week_before",
      "application_day_before",
      "hackathon_week_before",
      "hackathon_day_before",
    ]);
    expect(plan[0].scheduledFor).toEqual(new Date("2026-07-08T00:00:00Z"));
    expect(plan[1].scheduledFor).toEqual(new Date("2026-07-14T00:00:00Z"));
    expect(plan[2].scheduledFor).toEqual(new Date("2026-09-05T15:00:00Z"));
    expect(plan[3].scheduledFor).toEqual(new Date("2026-09-11T15:00:00Z"));
  });

  it("bases the event reminders on the event start, not an application date", () => {
    const plan = computeSelectableReminderPlan(
      {
        ...dates,
        applicationOpensAt: new Date("2026-09-10T00:00:00Z"),
      },
      now
    );

    expect(plan.find((entry) => entry.type === "hackathon_week_before")?.scheduledFor).toEqual(
      new Date("2026-09-05T15:00:00Z")
    );
    expect(plan.find((entry) => entry.type === "hackathon_day_before")?.scheduledFor).toEqual(
      new Date("2026-09-11T15:00:00Z")
    );
  });

  it("omits the start-relative reminders when there is no start date", () => {
    const plan = computeSelectableReminderPlan({ ...dates, startsAt: null }, now);

    expect(types(plan)).toEqual(["application_week_before", "application_day_before"]);
  });

  it("drops reminders that are already in the past", () => {
    const afterEverything = new Date("2026-10-01T00:00:00Z");

    expect(computeSelectableReminderPlan(dates, afterEverything)).toEqual([]);
  });

  it("keeps only future-dated entries once the window is partway open", () => {
    const midway = new Date("2026-09-06T00:00:00Z");

    expect(types(computeSelectableReminderPlan(dates, midway))).toEqual(["hackathon_day_before"]);
  });
});
