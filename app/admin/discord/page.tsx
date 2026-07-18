import { DiscordChannelManager } from "@/components/admin/discord-channel-manager";
import { listAdminDiscordOverview } from "@/lib/discord/channel-admin";

export default async function AdminDiscordPage() {
  const overview = await listAdminDiscordOverview();

  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rust">Discord</p>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="font-serif text-4xl font-semibold tracking-[-0.02em] text-navy dark:text-wheat">Channels</h1>
            <p className="mt-2 max-w-3xl text-base leading-7 text-navy/55 dark:text-wheat/55">
              Every text channel in the Discord server, grouped by category. Channels the sync manages carry their
              series and hackathon; the rest are marked untracked. Renaming a channel pins its name — the sync keeps
              filing it into the right category and updating its topic, but stops rewriting the name until the pin is
              cleared. Hackathon slugs are never affected. Deleting removes the channel from Discord too; a channel
              whose hackathon is still listed gets a fresh replacement on the next sync, and channels deleted directly
              on Discord are recreated (if still needed) or cleaned up here by the daily sync.
            </p>
          </div>
          <div className="rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-4 py-3 text-sm font-semibold text-navy dark:text-wheat">
            {overview.trackedCount} tracked · {overview.totalCount} on Discord
          </div>
        </div>
      </section>

      <DiscordChannelManager overview={overview} />
    </div>
  );
}
