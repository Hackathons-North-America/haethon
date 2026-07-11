export type ReminderType =
  | "application_open"
  | "application_close"
  | "acceptance_date"
  | "hackathon_start"
  | "hackathon_week_before"
  | "hackathon_day_before"
  | "check_in"
  | "submission_deadline"
  | "follow_up"
  | "add_to_profile"
  | "attendance_check"
  | "application_week_before"
  | "application_day_before";

export const selectableReminderTypes = [
  "application_week_before",
  "application_day_before",
  "hackathon_week_before",
  "hackathon_day_before",
] as const satisfies readonly ReminderType[];

export type SelectableReminderType = (typeof selectableReminderTypes)[number];

export type SelectableReminderPlanEntry = {
  type: SelectableReminderType;
  scheduledFor: Date;
};

export type HackathonDatesInput = {
  startsAt: Date | null;
  endsAt: Date | null;
  applicationOpensAt: Date | null;
  applicationClosesAt: Date | null;
  acceptanceAt: Date | null;
};

/**
 * Notification choices follow the hacker's current stage. While they are only
 * interested, reminders count down to the application opening so they don't
 * miss it; once accepted, only the event-start reminders are relevant.
 */
export function getSelectableReminderTypesForStatus(
  applicationStatus: string | null
): SelectableReminderType[] {
  if (
    applicationStatus === "applied" ||
    applicationStatus === "accepted" ||
    applicationStatus === "attending"
  ) {
    return ["hackathon_week_before", "hackathon_day_before"];
  }

  return applicationStatus === "interested" ? ["application_week_before", "application_day_before"] : [];
}

const DAY_MS = 86_400_000;

function daysBefore(date: Date, days: number) {
  return new Date(date.getTime() - days * DAY_MS);
}

/**
 * Every selectable reminder whose anchor date is known, regardless of whether
 * the send time is still upcoming. Application reminders count down to the
 * application opening; event reminders count down to the hackathon start.
 */
export function computeSelectableReminderSchedule(
  dates: HackathonDatesInput | null
): SelectableReminderPlanEntry[] {
  if (!dates) {
    return [];
  }

  const schedule: SelectableReminderPlanEntry[] = [];
  const push = (type: SelectableReminderType, scheduledFor: Date | null) => {
    if (scheduledFor) {
      schedule.push({ type, scheduledFor });
    }
  };

  if (dates.applicationOpensAt) {
    push("application_week_before", daysBefore(dates.applicationOpensAt, 7));
    push("application_day_before", daysBefore(dates.applicationOpensAt, 1));
  }

  if (dates.startsAt) {
    push("hackathon_week_before", daysBefore(dates.startsAt, 7));
    push("hackathon_day_before", daysBefore(dates.startsAt, 1));
  }

  return schedule;
}

/**
 * The subset of the schedule that can still be delivered — used to schedule
 * reminders and to decide which sends are actually upcoming.
 */
export function computeSelectableReminderPlan(
  dates: HackathonDatesInput | null,
  now = new Date()
): SelectableReminderPlanEntry[] {
  return computeSelectableReminderSchedule(dates).filter((entry) => entry.scheduledFor > now);
}
