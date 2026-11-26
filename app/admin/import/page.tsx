import { HackathonJsonImporter } from "@/components/admin/hackathon-json-importer";
import { listChannelDecisionCards } from "@/lib/discord/channel-decisions";
import { listImportCards } from "@/lib/hackathons/import-queue";

export default async function AdminImportPage() {
  // The review queue lives in the database: whatever is still waiting is here
  // again on every visit, from any device.
  const [cards, channelCards] = await Promise.all([listImportCards(), listChannelDecisionCards()]);

  return (
    <div className="space-y-6">
      <section className="border border-ink/15 bg-paper p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pine">Admin import</p>
        <h1 className="mt-2 text-4xl font-medium tracking-tight text-ink">Review imported cards</h1>
        <p className="mt-2 max-w-3xl text-base leading-7 text-ink/55">
          Paste a JSON batch. Cards marked autoApprove are published right away; every other card is saved here until
          you choose yes or no, together with the cards the scraper could not publish on its own. Then every Canadian
          and US hackathon waiting for a Discord channel comes up for a yes or no too: no channel is made without
          one. You can leave and come back at any point.
        </p>
      </section>

      <section className="border border-ink/15 bg-paper p-6">
        <HackathonJsonImporter initialCards={cards} initialChannelCards={channelCards} />
      </section>
    </div>
  );
}
