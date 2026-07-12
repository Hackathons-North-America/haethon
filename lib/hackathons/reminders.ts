import { and, count, eq, isNull, ne, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathonDates, reminders, userHackathonNotificationPreferences, userHackathons } from "@/lib/db/schema";
import {
  computeSelectableReminderPlan,
  getSelectableReminderTypesForStatus,
  selectableReminderTypes,
  type SelectableReminderType,
} from "@/lib/hackathons/reminder-plan";

function getDefaultPreferences() {
  return new Map<SelectableReminderType, boolean>(selectableReminderTypes.map((type) => [type, true]));
}

function isSelectableReminderType(type: string): type is SelectableReminderType {
  return selectableReminderTypes.some((selectableType) => selectableType === type);
}

export async function setUserHackathonNotificationPreferences({
  userId,
  hackathonId,
  preferences,
}: {
  userId: string;
  hackathonId: string;
  preferences: { type: SelectableReminderType; enabled: boolean }[];
}) {
  if (!preferences.length) {
    return;
  }

  await db
    .insert(userHackathonNotificationPreferences)
    .values(
      preferences.map((preference) => ({
        userId,
        hackathonId,
        type: preference.type,
        channel: "email" as const,
        enabled: preference.enabled,
        updatedAt: new Date(),
      }))
    )
    .onConflictDoUpdate({
      target: [
        userHackathonNotificationPreferences.userId,
        userHackathonNotificationPreferences.hackathonId,
        userHackathonNotificationPreferences.type,
        userHackathonNotificationPreferences.channel,
      ],
      set: {
        enabled: sql`excluded.enabled`,
        updatedAt: new Date(),
      },
    });
}

/**
 * Email reminders that have not been delivered yet. Scope to one hackathon via
 * `hackathonId`, or to everything else via `excludeHackathonId` — the pair is
 * how the account-wide notification limit splits "this hackathon" from the
 * rest when deciding whether a preference change adds sends.
 */
export async function countPendingEmailReminders({
  userId,
  hackathonId,
  excludeHackathonId,
}: {
  userId: string;
  hackathonId?: string;
  excludeHackathonId?: string;
}) {
  const conditions = [eq(reminders.userId, userId), eq(reminders.channel, "email"), isNull(reminders.sentAt)];

  if (hackathonId) {
    conditions.push(eq(reminders.hackathonId, hackathonId));
  }

  if (excludeHackathonId) {
    conditions.push(ne(reminders.hackathonId, excludeHackathonId));
  }

  const [row] = await db.select({ value: count() }).from(reminders).where(and(...conditions));

  return row?.value ?? 0;
}

/**
 * How many reminders syncRemindersForUserHackathon would schedule for this
 * hackathon once the requested preference changes are applied — used to
 * enforce the notification limit before anything is written. Untracked
 * hackathons predict with the default "interested" status because the
 * notifications endpoint creates the tracking row with that default.
 */
export async function countPlannedEmailReminders({
  userId,
  hackathonId,
  preferences,
  now = new Date(),
}: {
  userId: string;
  hackathonId: string;
  preferences: { type: SelectableReminderType; enabled: boolean }[];
  now?: Date;
}) {
  const [[dates], [userHackathon]] = await Promise.all([
    db
      .select({
        startsAt: hackathonDates.startsAt,
        endsAt: hackathonDates.endsAt,
        applicationOpensAt: hackathonDates.applicationOpensAt,
        applicationClosesAt: hackathonDates.applicationClosesAt,
        acceptanceAt: hackathonDates.acceptanceAt,
      })
      .from(hackathonDates)
      .where(eq(hackathonDates.hackathonId, hackathonId))
      .limit(1),
    db
      .select({ applicationStatus: userHackathons.applicationStatus })
      .from(userHackathons)
      .where(and(eq(userHackathons.userId, userId), eq(userHackathons.hackathonId, hackathonId)))
      .limit(1),
  ]);

  const enabledByType = await getEnabledEmailReminderTypes(userId, hackathonId);

  for (const preference of preferences) {
    enabledByType.set(preference.type, preference.enabled);
  }

  const availableReminderTypes = new Set(
    getSelectableReminderTypesForStatus(userHackathon?.applicationStatus ?? "interested")
  );

  return computeSelectableReminderPlan(dates ?? null, now).filter(
    (entry) => availableReminderTypes.has(entry.type) && enabledByType.get(entry.type)
  ).length;
}

async function getEnabledEmailReminderTypes(userId: string, hackathonId: string) {
  const enabledByType = getDefaultPreferences();
  const rows = await db
    .select({
      type: userHackathonNotificationPreferences.type,
      enabled: userHackathonNotificationPreferences.enabled,
    })
    .from(userHackathonNotificationPreferences)
    .where(
      and(
        eq(userHackathonNotificationPreferences.userId, userId),
        eq(userHackathonNotificationPreferences.hackathonId, hackathonId),
        eq(userHackathonNotificationPreferences.channel, "email")
      )
    );

  for (const row of rows) {
    if (isSelectableReminderType(row.type)) {
      enabledByType.set(row.type, row.enabled);
    }
  }

  return enabledByType;
}

/**
 * Replace a user's pending reminders for a hackathon with the plan for their
 * current status. Reminders that already went out are kept as history.
 * Unsaving a hackathon clears pending reminders instead.
 */
export async function syncRemindersForUserHackathon({
  userId,
  hackathonId,
  isSaved,
  now = new Date(),
}: {
  userId: string;
  hackathonId: string;
  isSaved: boolean;
  now?: Date;
}) {
  await db
    .delete(reminders)
    .where(and(eq(reminders.userId, userId), eq(reminders.hackathonId, hackathonId), isNull(reminders.sentAt)));

  if (!isSaved) {
    return;
  }

  const [[dates], [userHackathon]] = await Promise.all([
    db
      .select({
        startsAt: hackathonDates.startsAt,
        endsAt: hackathonDates.endsAt,
        applicationOpensAt: hackathonDates.applicationOpensAt,
        applicationClosesAt: hackathonDates.applicationClosesAt,
        acceptanceAt: hackathonDates.acceptanceAt,
      })
      .from(hackathonDates)
      .where(eq(hackathonDates.hackathonId, hackathonId))
      .limit(1),
    db
      .select({ applicationStatus: userHackathons.applicationStatus })
      .from(userHackathons)
      .where(and(eq(userHackathons.userId, userId), eq(userHackathons.hackathonId, hackathonId)))
      .limit(1),
  ]);

  const enabledByType = await getEnabledEmailReminderTypes(userId, hackathonId);
  const availableReminderTypes = new Set(getSelectableReminderTypesForStatus(userHackathon?.applicationStatus ?? null));
  const plan = computeSelectableReminderPlan(dates ?? null, now).filter(
    (entry) => availableReminderTypes.has(entry.type) && enabledByType.get(entry.type)
  );

  if (!plan.length) {
    return;
  }

  await db
    .insert(reminders)
    .values(
      plan.map((entry) => ({
        userId,
        hackathonId,
        type: entry.type,
        channel: "email" as const,
        scheduledFor: entry.scheduledFor,
      }))
    )
    .onConflictDoNothing({
      target: [
        reminders.userId,
        reminders.hackathonId,
        reminders.type,
        reminders.channel,
        reminders.scheduledFor,
      ],
      where: sql`${reminders.sentAt} is null`,
    });
}
