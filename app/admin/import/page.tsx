import { HackathonJsonImporter } from "@/components/admin/hackathon-json-importer";

export default function AdminImportPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-lg border border-black/10 bg-white p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-[#660000]">Admin import</p>
        <h1 className="mt-2 text-4xl font-semibold text-black">Review imported cards</h1>
        <p className="mt-2 max-w-3xl text-base leading-7 text-[#706F6B]">
          Paste a JSON batch, review each generated website card, then choose yes to import it or no to skip it.
        </p>
      </section>

      <section className="rounded-lg border border-black/10 bg-white p-6">
        <HackathonJsonImporter />
      </section>
    </div>
  );
}
