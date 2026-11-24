import { sql } from "drizzle-orm";
import { beforeAll, describe, expect, it } from "vitest";

import { ensureBenchCatalog, jsonRequest, measure, removeBenchRows, report, RUNS } from "./harness";
import { perfState } from "./state";

const { db } = await import("@/lib/db");
const { PUT: voteRoute, DELETE: clearVoteRoute } = await import("@/app/api/hackathons/[id]/vote/route");
const { getPublicHackathonCatalog, loadCardVotes } = await import("@/lib/hackathons/catalog");

/* Synthetic volume, far above today's production (a handful of votes), so the
   cost of aggregating on read is visible: every open hackathon gets votes from
   PERF_VOTERS_PER_HACKATHON of the seeded users. */
const VOTERS_PER_HACKATHON = Number(process.env.PERF_VOTERS_PER_HACKATHON ?? 1500);

let pageIds: string[] = [];
let voteTargetId = "";

beforeAll(async () => {
  // Same catalog every run: drop whatever the import bench left behind.
  await removeBenchRows();
  await ensureBenchCatalog();
  await db.execute(sql`delete from hackathon_votes`);
  await db.execute(sql`
    insert into hackathon_votes (user_id, hackathon_id, value)
    select u.id, h.id, case when random() < 0.8 then 1 else -1 end
    from hackathons h
    join lateral (
      select id from users where clerk_user_id like 'user_perf_%' and clerk_user_id <> 'user_perf_admin'
      order by md5(id::text || h.id::text) limit ${VOTERS_PER_HACKATHON}
    ) u on true
    where h.published_at is not null`);
  // The bulk load above is one transaction, which no real traffic resembles;
  // vacuum what it left behind so the timings below are steady-state ones.
  await db.execute(sql`vacuum (analyze) hackathon_votes`);
  await db.execute(sql`vacuum (analyze) hackathons`);
  await db.execute(sql`do $$ begin if to_regclass('hackathon_vote_totals') is not null then analyze hackathon_vote_totals; end if; end $$`);

  const page = await getPublicHackathonCatalog({});
  pageIds = page.cards.map((card) => card.id);
  voteTargetId = pageIds[0];
  expect(pageIds.length).toBeGreaterThan(20);
});

describe("votes", () => {
  it("Vote write: the up arrow, then switching to the down arrow", async () => {
    const samples = [];

    for (let run = 0; run < RUNS; run += 1) {
      const value = run % 2 === 0 ? 1 : -1;
      samples.push(
        await measure(async () => {
          const response = await voteRoute(jsonRequest(`/api/hackathons/${voteTargetId}/vote`, "PUT", { value }), {
            params: Promise.resolve({ id: voteTargetId }),
          });
          expect(response.status).toBe(200);
          const body = (await response.json()) as { data: { viewerVote: number } };
          expect(body.data.viewerVote).toBe(value);
        })
      );
    }

    report("vote write: PUT (set or switch)", samples);

    const cleared = [];

    for (let run = 0; run < RUNS; run += 1) {
      await voteRoute(jsonRequest(`/api/hackathons/${voteTargetId}/vote`, "PUT", { value: 1 }), {
        params: Promise.resolve({ id: voteTargetId }),
      });
      cleared.push(
        await measure(async () => {
          const response = await clearVoteRoute(jsonRequest(`/api/hackathons/${voteTargetId}/vote`, "DELETE"), {
            params: Promise.resolve({ id: voteTargetId }),
          });
          expect(response.status).toBe(200);
        })
      );
    }

    report("vote write: DELETE (clear)", cleared);
  });

  it("Vote totals for one catalog page (30 cards)", async () => {
    const signedOut = [];
    const signedIn = [];

    for (let run = 0; run < RUNS; run += 1) {
      signedOut.push(
        await measure(async () => {
          const votes = await loadCardVotes(pageIds, null);
          expect(votes.states.size).toBeGreaterThan(0);
        })
      );
      signedIn.push(
        await measure(async () => {
          const votes = await loadCardVotes(pageIds, perfState.session.appUserId);
          expect(votes.states.size).toBeGreaterThan(0);
        })
      );
    }

    report("vote totals for 30 cards: signed out", signedOut);
    report("vote totals for 30 cards: signed in", signedIn);
  });

  it("Catalog page sorted by Top voted (cache miss)", async () => {
    const samples = [];

    for (let run = 0; run < RUNS; run += 1) {
      samples.push(
        await measure(async () => {
          const page = await getPublicHackathonCatalog({ sort: "top" });
          expect(page.cards.length).toBeGreaterThan(20);
        })
      );
    }

    report("catalog page: sort=top, uncached", samples);
  });
});
