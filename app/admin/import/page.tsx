import { HackathonJsonImporter } from "@/components/admin/hackathon-json-importer";

export default function AdminImportPage() {
  return (
    <div className="space-y-6">
      <section className="border border-ink/15 bg-paper p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-pine">Admin import</p>
        <h1 className="mt-2 text-4xl font-medium tracking-tight text-ink">Review imported cards</h1>
        <p className="mt-2 max-w-3xl text-base leading-7 text-ink/55">
          Paste a JSON batch. Cards marked autoApprove are imported right away, with their Discord channel made or
          reused. Review each remaining card, then choose yes to import it or no to skip it.
        </p>
      </section>

      <section className="border border-ink/15 bg-paper p-6">
        <HackathonJsonImporter />
      </section>
    </div>
  );
}
