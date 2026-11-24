import { sql } from "drizzle-orm";

import type { HackathonVoteState, VoteValue } from "@/lib/hackathons/vote-state";

/* Per-hackathon extras as correlated subqueries, so a page that already
   selects hackathon rows gets its Discord link and vote state in that same
   statement instead of collecting ids and going back for a second round of
   queries. Each one is a single index probe per row, which is the right trade
   for the small row counts these are used with (one hackathon on the detail
   view, a user's own pipeline on /my). The catalog's 50-row pages keep their
   batched lookups in lib/hackathons/catalog.ts.

   Everything refers to the outer row as "hackathons", spelled out rather than
   interpolated: Drizzle drops the table qualifier from interpolated columns in
   a single-table SELECT, which inside a subquery would silently rebind
   "id" to the subquery's own table. So these only work in a query whose FROM
   or JOIN includes the unaliased hackathons table. */

/**
 * Deep link to the hackathon's Discord channel. Channels belong to a series
 * and are recycled across its events, so a hackathon resolves through its own
 * channel first and falls back to its series' channel — the same preference
 * as getDiscordLinksByHackathon(). A series can hold one channel per guild;
 * the oldest wins so the choice is stable from one request to the next.
 */
export const discordLinkSql = sql<string | null>`(
  select 'https://discord.com/channels/' || dg.guild_snowflake || '/' || dc.channel_snowflake
  from discord_channels dc
  inner join discord_guilds dg on dg.id = dc.guild_id
  where dc.hackathon_id = "hackathons"."id" or dc.series_id = "hackathons"."series_id"
  order by (dc.hackathon_id is not distinct from "hackathons"."id") desc, dc.created_at, dc.id
  limit 1
)`;

/* Counted over hackathon_votes_hackathon_value_idx (hackathon_id, value). */
const upvotesSql = sql<number>`(
  select count(*) from hackathon_votes hv where hv.hackathon_id = "hackathons"."id" and hv.value = 1
)`.mapWith(Number);

const downvotesSql = sql<number>`(
  select count(*) from hackathon_votes hv where hv.hackathon_id = "hackathons"."id" and hv.value = -1
)`.mapWith(Number);

/**
 * Select fields for a hackathon's live vote totals plus the viewer's own vote
 * (always null when signed out). Spread into a select() and turn the row back
 * into a HackathonVoteState with voteStateFromRow().
 */
export function voteFieldsSql(userId: string | null | undefined) {
  return {
    upvotes: upvotesSql,
    downvotes: downvotesSql,
    /* (user_id, hackathon_id) is the table's primary key: at most one row. */
    viewerVote: userId
      ? sql<number | null>`(
          select hv.value from hackathon_votes hv
          where hv.hackathon_id = "hackathons"."id" and hv.user_id = ${userId}
        )`
      : sql<null>`null`,
  };
}

export function voteStateFromRow(row: {
  upvotes: number;
  downvotes: number;
  viewerVote: number | null;
}): HackathonVoteState {
  const viewerVote = Number(row.viewerVote);

  return {
    upvotes: row.upvotes,
    downvotes: row.downvotes,
    viewerVote: viewerVote === 1 || viewerVote === -1 ? (viewerVote as VoteValue) : null,
  };
}

/**
 * The signed-in user's pipeline stage for the hackathon, or null when they are
 * signed out or not tracking it.
 */
export function trackedStatusSql(userId: string | null | undefined) {
  return userId
    ? sql<string | null>`(
        select uh.application_status from user_hackathons uh
        where uh.hackathon_id = "hackathons"."id" and uh.user_id = ${userId}
      )`
    : sql<null>`null`;
}
