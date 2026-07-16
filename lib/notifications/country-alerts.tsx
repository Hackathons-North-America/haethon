import { createHash } from "node:crypto";

import { render } from "@react-email/render";
import * as Sentry from "@sentry/nextjs";
import { and, asc, eq, gt, inArray, isNull, lt } from "drizzle-orm";

import { CountryAlertEmail } from "@/emails/country-alert-email";
import { db } from "@/lib/db";
import { countryAlertSubscriptions, hackathonDates, hackathonLocations, hackathons, users } from "@/lib/db/schema";
import { env } from "@/lib/env";
import { formatDateRange, formatLocationParts } from "@/lib/hackathons/card-format";
import { resend } from "@/lib/notifications/resend";
import { buildUnsubscribeUrl, unsubscribeHeaders } from "@/lib/notifications/unsubscribe";

export type CountryAlertFrequency = "instant" | "daily" | "weekly";

export const countryAlertFrequencyLabels: Record<CountryAlertFrequency, string> = {
  instant: "Instant alert",
  daily: "Daily digest",
  weekly: "Weekly digest",
};

// The Resend batch API accepts at most 100 emails per call.
const RESEND_BATCH_SIZE = 100;

/* Bulk imports publish many hackathons back to back. Instant subscribers get
   one email for the first publish; anything else inside this window rides the
   next daily cron sweep instead of triggering its own send. */
const INSTANT_REPEAT_WINDOW_MS = 60 * 60 * 1000;

/* A weekly digest is due after 7 days, minus an hour of slack so a cron run
   that fires slightly early never pushes the whole cadence back a day. */
const WEEKLY_DUE_AFTER_MS = 7 * 24 * 60 * 60 * 1000 - 60 * 60 * 1000;

type DueSubscription = {
  id: string;
  country: string;
  frequency: CountryAlertFrequency;
  lastNotifiedAt: Date;
  userId: string;
  email: string;
  firstName: string | null;
};

export type CountryAlertDispatchResult = {
  eligible: number;
  sent: number;
  failed: number;
};

const emptyResult: CountryAlertDispatchResult = { eligible: 0, sent: 0, failed: 0 };

function subscriptionBaseQuery() {
  return db
    .select({
      id: countryAlertSubscriptions.id,
      country: countryAlertSubscriptions.country,
      frequency: countryAlertSubscriptions.frequency,
      lastNotifiedAt: countryAlertSubscriptions.lastNotifiedAt,
      userId: users.id,
      email: users.email,
      firstName: users.firstName,
    })
    .from(countryAlertSubscriptions)
    .innerJoin(users, eq(users.id, countryAlertSubscriptions.userId));
}

/**
 * Cron entry point: one email per subscriber covering everything published in
 * their country since their watermark. Daily and instant subscriptions are
 * swept every run (instant only as catch-up for publishes the repeat window
 * suppressed); weekly ones only once their seven days are up.
 */
export async function sendDueCountryAlerts(now: Date): Promise<CountryAlertDispatchResult> {
  const weeklyDueBefore = new Date(now.getTime() - WEEKLY_DUE_AFTER_MS);
  const subscriptions = await subscriptionBaseQuery().where(isNull(users.emailUnsubscribedAt));

  const due = subscriptions.filter(
    (subscription) => subscription.frequency !== "weekly" || subscription.lastNotifiedAt <= weeklyDueBefore
  );

  return dispatchCountryAlerts(due, now);
}

/**
 * Publish hook: email instant subscribers of the hackathon's country right
 * away, unless they already got an alert inside the repeat window (the daily
 * cron picks those hackathons up instead).
 */
export async function sendInstantCountryAlerts(hackathonId: string): Promise<CountryAlertDispatchResult> {
  const now = new Date();
  const [location] = await db
    .select({ country: hackathonLocations.country })
    .from(hackathonLocations)
    .where(eq(hackathonLocations.hackathonId, hackathonId))
    .limit(1);

  if (!location?.country) {
    return emptyResult;
  }

  const repeatWindowStart = new Date(now.getTime() - INSTANT_REPEAT_WINDOW_MS);
  const subscriptions = await subscriptionBaseQuery().where(
    and(
      eq(countryAlertSubscriptions.country, location.country),
      eq(countryAlertSubscriptions.frequency, "instant"),
      lt(countryAlertSubscriptions.lastNotifiedAt, repeatWindowStart),
      isNull(users.emailUnsubscribedAt)
    )
  );

  return dispatchCountryAlerts(subscriptions, now);
}

/** Publish hook wrapper: a broken alert send must never fail the publish itself. */
export async function sendInstantCountryAlertsSafely(hackathonId: string) {
  try {
    await sendInstantCountryAlerts(hackathonId);
  } catch (error) {
    Sentry.captureException(error, { extra: { hackathonId, stage: "instant-country-alert" } });
  }
}

async function dispatchCountryAlerts(
  subscriptions: DueSubscription[],
  now: Date
): Promise<CountryAlertDispatchResult> {
  if (!subscriptions.length || !resend || !env.RESEND_AUDIENCE_FROM) {
    return emptyResult;
  }

  const countries = [...new Set(subscriptions.map((subscription) => subscription.country))];
  const oldestWatermark = new Date(
    Math.min(...subscriptions.map((subscription) => subscription.lastNotifiedAt.getTime()))
  );

  // One query covers every subscriber; each one is then narrowed to their own
  // watermark in memory. Past or archived entries (bulk imports include them)
  // never alert anyone.
  const published = await db
    .select({
      name: hackathons.name,
      slug: hackathons.slug,
      format: hackathons.format,
      venue: hackathons.venue,
      publishedAt: hackathons.publishedAt,
      city: hackathonLocations.city,
      region: hackathonLocations.region,
      country: hackathonLocations.country,
      startsAt: hackathonDates.startsAt,
      endsAt: hackathonDates.endsAt,
    })
    .from(hackathons)
    .innerJoin(hackathonLocations, eq(hackathonLocations.hackathonId, hackathons.id))
    .leftJoin(hackathonDates, eq(hackathonDates.hackathonId, hackathons.id))
    .where(
      and(
        inArray(hackathonLocations.country, countries),
        gt(hackathons.publishedAt, oldestWatermark),
        inArray(hackathons.status, ["upcoming", "live"])
      )
    )
    .orderBy(asc(hackathons.publishedAt));

  const byCountry = new Map<string, typeof published>();
  for (const hackathon of published) {
    const list = byCountry.get(hackathon.country) ?? [];
    list.push(hackathon);
    byCountry.set(hackathon.country, list);
  }

  const deliveries = subscriptions.flatMap((subscription) => {
    const fresh = (byCountry.get(subscription.country) ?? []).filter(
      (hackathon) => hackathon.publishedAt && hackathon.publishedAt > subscription.lastNotifiedAt
    );

    if (!fresh.length) {
      return [];
    }

    // Advancing the watermark to the newest included publish (not `now`)
    // means anything published while this dispatch runs is still caught by
    // the next one.
    const nextWatermark = new Date(Math.max(...fresh.map((hackathon) => hackathon.publishedAt!.getTime())));

    return [{ subscription, hackathons: fresh, nextWatermark }];
  });

  if (!deliveries.length) {
    return { eligible: 0, sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  for (let offset = 0; offset < deliveries.length; offset += RESEND_BATCH_SIZE) {
    const chunk = deliveries.slice(offset, offset + RESEND_BATCH_SIZE);

    const emails = await Promise.all(
      chunk.map(async ({ subscription, hackathons: fresh }) => {
        const element = (
          <CountryAlertEmail
            browseUrl={`${env.NEXT_PUBLIC_APP_URL}/hackathons`}
            country={subscription.country}
            frequencyLabel={countryAlertFrequencyLabels[subscription.frequency]}
            greetingName={subscription.firstName ?? "hacker"}
            hackathons={fresh.map((hackathon) => ({
              name: hackathon.name,
              location: formatLocationParts(hackathon).locality ?? "Location TBA",
              dateRange: formatDateRange(hackathon.startsAt, hackathon.endsAt),
              detailUrl: `${env.NEXT_PUBLIC_APP_URL}/hackathons/${hackathon.slug}`,
            }))}
            manageUrl={`${env.NEXT_PUBLIC_APP_URL}/my`}
            unsubscribeUrl={buildUnsubscribeUrl(subscription.userId)}
          />
        );

        const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);

        return {
          from: env.RESEND_AUDIENCE_FROM as string,
          to: subscription.email,
          subject:
            fresh.length === 1
              ? `New hackathon in ${subscription.country}: ${fresh[0].name}`
              : `${fresh.length} new hackathons in ${subscription.country}`,
          html,
          text,
          headers: unsubscribeHeaders(subscription.userId),
        };
      })
    );

    // Stable per-chunk idempotency key (subscription ids + watermarks) so a
    // retried dispatch of the same due set is deduplicated by Resend.
    const idempotencyKey = `country-alerts:${createHash("sha256")
      .update(
        chunk
          .map(({ subscription }) => `${subscription.id}:${subscription.lastNotifiedAt.toISOString()}`)
          .join(",")
      )
      .digest("hex")}`;

    const { data, error } = await resend.batch.send(emails, {
      idempotencyKey,
      // Permissive validation sends the valid emails and reports the rest in
      // `errors` instead of rejecting the whole chunk over one bad address.
      batchValidation: "permissive",
    });

    if (error) {
      Sentry.captureException(new Error(`Country alert batch send failed: ${error.message}`), {
        extra: { chunkSize: chunk.length, idempotencyKey },
      });
      failed += chunk.length;
      continue;
    }

    const failedIndices = new Set((data && "errors" in data ? (data.errors ?? []) : []).map((entry) => entry.index));

    if (failedIndices.size) {
      Sentry.captureMessage("Some country alert emails were rejected by Resend.", {
        level: "warning",
        extra: { chunkSize: chunk.length, failed: failedIndices.size },
      });
    }

    const delivered = chunk.filter((_, index) => !failedIndices.has(index));

    // Only delivered subscribers advance their watermark; rejected ones retry
    // on the next cron run.
    await Promise.all(
      delivered.map(({ subscription, nextWatermark }) =>
        db
          .update(countryAlertSubscriptions)
          .set({ lastNotifiedAt: nextWatermark, updatedAt: now })
          .where(eq(countryAlertSubscriptions.id, subscription.id))
      )
    );

    sent += delivered.length;
    failed += failedIndices.size;
  }

  return { eligible: deliveries.length, sent, failed };
}
