import { and, eq } from "drizzle-orm";
import { NextResponse } from "next/server";

import { getCurrentUserContext } from "@/lib/auth";
import { db } from "@/lib/db";
import {
  hackathonDates,
  hackathons,
  userHackathonNotificationPreferences,
  userHackathons,
} from "@/lib/db/schema";
import { reminderTypeLabels } from "@/lib/hackathons/reminder-labels";
import {
  computeSelectableReminderOffers,
  getSelectableReminderTypesForStatus,
} from "@/lib/hackathons/reminder-plan";
import {
  computePlannedEmailReminderEntries,
  countPendingEmailReminders,
  setUserHackathonNotificationPreferences,
  syncRemindersForUserHackathon,
} from "@/lib/hackathons/reminders";
import { getCommittedEmailEvents } from "@/lib/notifications/email-budget";
import { findWeekOverEmailLimit } from "@/lib/notifications/email-week";
import { hackathonNotificationPreferencesSchema } from "@/lib/validations/hackathon";

type RouteContext = {
  params: Promise<{ id: string }>;
};

/* Mirrors the My Hackathons column headings — the reminder panel is titled by
   the stage the hacker is at, since that decides which reminders are offered. */
const statusLabels: Record<string, string> = {
  interested: "Interested",
  applied: "Applied",
  accepted: "Accepted",
  attending: "Attending",
  attended: "Attended",
  won: "Won",
};

/**
 * The reminder choices for one hackathon. Grid cards ship without reminder data
 * (it is per-user, and the catalog snapshot is shared), so the card's "Add
 * Reminder" button loads them here on first open. A hackathon the hacker has
 * not tracked yet is treated as "interested" — turning a reminder on through
 * the PATCH below is what actually puts it on their board.
 */
export async function GET(_request: Request, context: RouteContext) {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const { id } = await context.params;
  const [[hackathon], [tracked], preferenceRows] = await Promise.all([
    db
      .select({
        id: hackathons.id,
        startsAt: hackathonDates.startsAt,
        endsAt: hackathonDates.endsAt,
        applicationOpensAt: hackathonDates.applicationOpensAt,
        applicationClosesAt: hackathonDates.applicationClosesAt,
        acceptanceAt: hackathonDates.acceptanceAt,
      })
      .from(hackathons)
      .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
      .where(eq(hackathons.id, id))
      .limit(1),
    db
      .select({ applicationStatus: userHackathons.applicationStatus })
      .from(userHackathons)
      .where(and(eq(userHackathons.userId, userContext.user.id), eq(userHackathons.hackathonId, id)))
      .limit(1),
    db
      .select({
        type: userHackathonNotificationPreferences.type,
        enabled: userHackathonNotificationPreferences.enabled,
      })
      .from(userHackathonNotificationPreferences)
      .where(
        and(
          eq(userHackathonNotificationPreferences.userId, userContext.user.id),
          eq(userHackathonNotificationPreferences.hackathonId, id),
          eq(userHackathonNotificationPreferences.channel, "email")
        )
      ),
  ]);

  if (!hackathon) {
    return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
  }

  const status = tracked?.applicationStatus ?? "interested";
  const availableTypes = new Set(getSelectableReminderTypesForStatus(status));
  const enabledByType = new Map(preferenceRows.map((preference) => [preference.type, preference.enabled]));
  const options = computeSelectableReminderOffers({
    startsAt: hackathon.startsAt,
    endsAt: hackathon.endsAt,
    applicationOpensAt: hackathon.applicationOpensAt,
    applicationClosesAt: hackathon.applicationClosesAt,
    acceptanceAt: hackathon.acceptanceAt,
  })
    .filter(({ type }) => availableTypes.has(type))
    .map(({ type, scheduledFor }) => ({
      type,
      label: reminderTypeLabels[type] ?? type,
      scheduledFor: scheduledFor ? scheduledFor.toISOString() : null,
      enabled: enabledByType.get(type) ?? false,
    }));

  return NextResponse.json({
    data: {
      hackathonId: id,
      statusLabel: statusLabels[status] ?? "Interested",
      options,
    },
  });
}

export async function PATCH(request: Request, context: RouteContext) {
  const userContext = await getCurrentUserContext();

  if (!userContext) {
    return NextResponse.json({ error: "Unauthenticated" }, { status: 401 });
  }

  const parsed = hackathonNotificationPreferencesSchema.safeParse(await request.json());

  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { id } = await context.params;
  const [hackathon] = await db.select({ id: hackathons.id }).from(hackathons).where(eq(hackathons.id, id)).limit(1);

  if (!hackathon) {
    return NextResponse.json({ error: "Hackathon not found." }, { status: 404 });
  }

  const [plannedEntries, currentCount, committed] = await Promise.all([
    computePlannedEmailReminderEntries({
      userId: userContext.user.id,
      hackathonId: id,
      preferences: parsed.data.preferences,
    }),
    countPendingEmailReminders({ userId: userContext.user.id, hackathonId: id }),
    getCommittedEmailEvents({ userId: userContext.user.id, excludeHackathonId: id }),
  ]);

  // Only changes that add sends are refused, so anyone already past the cap
  // can still turn reminders off. The check books this hackathon's new plan
  // against everything else already promised, week by calendar week.
  if (plannedEntries.length > currentCount) {
    const bookedEvents = [
      ...committed.events,
      ...plannedEntries.map((entry) => ({ type: entry.type, occursAt: entry.scheduledFor })),
    ];

    if (findWeekOverEmailLimit(bookedEvents, committed.hasCountryAlert)) {
      return NextResponse.json(
        { code: "notification_limit", error: "For now, you're limited to five emails per week." },
        { status: 409 }
      );
    }
  }

  const [tracked] = await db
    .insert(userHackathons)
    .values({
      userId: userContext.user.id,
      hackathonId: id,
      isSaved: true,
    })
    .onConflictDoUpdate({
      target: [userHackathons.userId, userHackathons.hackathonId],
      set: {
        isSaved: true,
        updatedAt: new Date(),
      },
    })
    .returning({
      isSaved: userHackathons.isSaved,
    });

  await setUserHackathonNotificationPreferences({
    userId: userContext.user.id,
    hackathonId: id,
    preferences: parsed.data.preferences,
  });

  await syncRemindersForUserHackathon({
    userId: userContext.user.id,
    hackathonId: id,
    isSaved: tracked.isSaved,
  });

  return NextResponse.json({ data: { preferences: parsed.data.preferences } });
}
