import { HackathonCreateForm } from "@/components/admin/hackathon-create-form";

export default function AdminAddHackathonPage() {
  return (
    <div className="space-y-6">
      <section className="rounded-xl border border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] p-6">
        <p className="text-sm font-semibold uppercase tracking-[0.2em] text-rust">Instant add</p>
        <h1 className="mt-2 font-serif text-4xl font-semibold tracking-[-0.02em] text-navy dark:text-wheat">
          Add a hackathon
        </h1>
        <p className="mt-2 max-w-3xl text-base leading-7 text-navy/55 dark:text-wheat/55">
          Publishes straight to the public catalog — no review queue. Status comes from the dates, so an event with
          last year&apos;s dates is recorded as a past hackathon; tick &ldquo;Repeats yearly&rdquo; to keep it visible to
          users as an event that will return.
        </p>
      </section>

      <HackathonCreateForm />
    </div>
  );
}
