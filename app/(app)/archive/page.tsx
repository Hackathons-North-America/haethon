import type { Metadata } from "next";
import Link from "next/link";

import { HackathonCard } from "@/components/hackathon-card";
import { getCurrentUserRecord } from "@/lib/auth";
import { getHackathonArchive } from "@/lib/hackathons/archive";
import { applyUserCardState } from "@/lib/hackathons/catalog";

export const metadata: Metadata = {
  title: "Archive | Hackathons North America",
  description: "Past hackathons across North America, filed by half-year back to the beginning.",
};

/* The archive mirrors the Discord server's layout: one section per half-year
   (H1 = January–June, H2 = July–December), newest first. */
export default async function ArchivePage() {
  const [groups, user] = await Promise.all([getHackathonArchive(), getCurrentUserRecord()]);

  const cardsWithState = await applyUserCardState(
    groups.flatMap((group) => group.cards),
    user?.id
  );
  const cardStateById = new Map(cardsWithState.map((card) => [card.id, card]));

  return (
    <main className="min-h-screen px-5 pb-20 pt-14 text-navy dark:text-wheat sm:px-8 sm:pt-16 lg:px-12">
      <div className="mx-auto w-full max-w-[1400px]">
        <header>
          <h1 className="font-serif text-3xl font-semibold sm:text-4xl">Archive</h1>
          <p className="mt-2 max-w-xl text-sm text-navy/55 dark:text-wheat/55">
            Every hackathon we&apos;ve tracked, filed by half-year. H1 runs January through June, H2 July through
            December.
          </p>
        </header>

        {groups.length === 0 ? (
          <div className="mx-auto mt-10 w-full max-w-[980px] rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 p-8 text-center">
            <p className="text-base font-semibold text-navy dark:text-wheat">Nothing archived yet.</p>
            <p className="mt-2 text-sm text-navy/55 dark:text-wheat/55">
              Once a hackathon wraps up it moves here automatically.
            </p>
            <Link
              className="mt-6 inline-flex rounded-full min-h-10 items-center justify-center border border-cabernet dark:border-[#e4a3ab]/50 px-5 text-sm font-semibold text-cabernet dark:text-[#e4a3ab] transition-colors hover:bg-cabernet hover:text-wheat"
              href="/hackathons"
            >
              Browse the Hackathons DB
            </Link>
          </div>
        ) : (
          groups.map((group) => (
            <section
              className="mt-12 w-full border-t border-navy/10 dark:border-white/10 pt-8"
              id={group.key}
              key={group.key}
            >
              <div className="flex items-baseline gap-3">
                <h2 className="text-sm font-semibold uppercase tracking-[0.2em] text-navy/55 dark:text-wheat/55">
                  {group.label}
                </h2>
                <span className="text-xs text-navy/40 dark:text-wheat/40">{group.range}</span>
              </div>
              <div className="mt-4 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
                {group.cards.map((card) => {
                  const state = cardStateById.get(card.id);

                  return (
                    <HackathonCard
                      hackathon={{
                        ...card,
                        isSaved: state?.isSaved ?? false,
                        userVote: state?.userVote ?? 0,
                      }}
                      key={card.id}
                    />
                  );
                })}
              </div>
            </section>
          ))
        )}
      </div>
    </main>
  );
}
