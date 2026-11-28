import { and, inArray, isNull, sql } from "drizzle-orm";

import { db } from "@/lib/db";
import { hackathons } from "@/lib/db/schema";

/* "Is this hackathon HNA approved?" is one answer stored in two columns:

   - hackathons.hna_approved (and hna_approved_at) keeps the cover image after
     the event and keeps the Discord channel in the archive for good;
   - hackathons.discord_channel_decision ("approved" / "denied" / null) is what
     the channel code gates on (channelDecisionBlock in lib/discord/sync.ts).
     "denied" means an admin said "not HNA approved", so it is not asked again.

   Every write goes through hnaApprovalValues so the two never disagree. For
   Canadian and US hackathons, approval also means a Discord channel. */

export function hnaApprovalValues(approved: boolean) {
  return approved
    ? {
        discordChannelDecision: "approved" as const,
        hnaApproved: true,
        // The first approval is kept: approving again doesn't move it.
        hnaApprovedAt: sql`coalesce(${hackathons.hnaApprovedAt}, now())`,
      }
    : { discordChannelDecision: "denied" as const, hnaApproved: false, hnaApprovedAt: null };
}

/* SQL for "the latest other edition of this hackathon's series that anyone
   decided on was HNA approved". Editions are ordered by start date. A series
   whose latest decided edition was declined is asked about again, because an
   event can get better. Correlated with the hackathons row being updated,
   named in full: Drizzle may print a bare column name in an UPDATE, which
   inside this subquery would mean `other`'s. */
const inheritsApproval = sql`(
    select other.discord_channel_decision
    from hackathons other
    left join hackathon_dates other_dates on other_dates.hackathon_id = other.id
    where other.series_id = "hackathons"."series_id"
      and other.id <> "hackathons"."id"
      and other.discord_channel_decision is not null
    order by other_dates.starts_at desc nulls last, other.created_at desc
    limit 1
  ) = 'approved'`;

/* Only an edition still to come inherits: an old one nobody decided on
   stays undecided rather than being approved after the fact. */
const notEnded = sql`not exists (
    select 1 from hackathon_dates own_dates
    where own_dates.hackathon_id = "hackathons"."id" and own_dates.ends_at < now()
  )`;

/**
 * Marks undecided hackathons HNA approved when the series' previous edition
 * was. This is how a returning event comes back without being asked about:
 * the import that brings it in calls this for the rows it created, and the
 * daily Discord sync calls it for everything (an admin can move a hackathon
 * into a series later). Returns the ids it approved, so the caller can queue
 * their channels.
 */
export function inheritHnaApprovalQuery(hackathonIds?: string[]) {
  return db
    .update(hackathons)
    .set(hnaApprovalValues(true))
    .where(
      and(
        isNull(hackathons.discordChannelDecision),
        sql`${hackathons.seriesId} is not null`,
        hackathonIds ? inArray(hackathons.id, hackathonIds) : undefined,
        notEnded,
        inheritsApproval
      )
    )
    .returning({ id: hackathons.id });
}

/**
 * Brings rows written before the two columns were merged into line, in the
 * daily Discord sync (like approveHackathonsWithChannelsQuery):
 * an approved channel means HNA approved, and HNA approved means the channel
 * is approved. A row with both "HNA approved" and "denied" is a contradiction
 * nobody can resolve automatically, so it is left for an admin.
 */
export function alignHnaApprovalQueries() {
  return [
    db
      .update(hackathons)
      .set({ hnaApproved: true, hnaApprovedAt: sql`coalesce(${hackathons.hnaApprovedAt}, now())` })
      .where(and(sql`${hackathons.discordChannelDecision} = 'approved'`, sql`not ${hackathons.hnaApproved}`)),
    db
      .update(hackathons)
      .set({ discordChannelDecision: "approved" })
      .where(and(isNull(hackathons.discordChannelDecision), sql`${hackathons.hnaApproved}`)),
  ] as const;
}
