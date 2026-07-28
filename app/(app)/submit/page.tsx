import { HackathonSubmissionForm } from "@/components/forms/hackathon-submission-form";

export default function SubmitPage() {
  return (
    <div className="min-h-screen">
      <main className="px-5 pb-20 pt-14 sm:px-8 sm:pt-20 lg:px-12">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-12">
          <div className="max-w-3xl">
            <h1 className="text-4xl font-semibold tracking-tight leading-[1.05] text-ink sm:text-5xl">
              Submit a hackathon
            </h1>
            <p className="mt-6 text-base leading-7 text-ink/70">
              Register your own event, or just point us to one you saw — a name and link is enough.
              Our team fills in the rest, and every community submission is reviewed before going public.
            </p>
          </div>
          <HackathonSubmissionForm />
        </div>
      </main>
    </div>
  );
}
