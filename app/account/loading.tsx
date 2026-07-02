export default function AccountLoading() {
  return (
    <main className="min-h-[calc(100vh-80px)] bg-[#EFEDEA] px-5 py-8 text-black sm:px-8 lg:px-12">
      <div className="mx-auto grid w-full max-w-7xl gap-6 lg:grid-cols-[220px_minmax(0,1fr)]">
        <aside className="rounded-lg border border-black/10 bg-white p-3 lg:sticky lg:top-28 lg:h-fit">
          <div className="space-y-2">
            {["Profile", "Saved", "Submissions", "Activity", "Settings"].map((item) => (
              <div className="h-10 rounded-lg bg-black/5" key={item} />
            ))}
          </div>
        </aside>

        <div className="space-y-6">
          <section className="rounded-lg border border-black/10 bg-white p-6">
            <div className="h-4 w-28 rounded bg-black/10" />
            <div className="mt-4 h-9 w-full max-w-md rounded bg-black/10" />
            <div className="mt-3 h-4 w-64 rounded bg-black/10" />
          </section>

          <section className="rounded-lg border border-black/10 bg-white p-6">
            <div className="h-6 w-32 rounded bg-black/10" />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="h-12 rounded bg-black/10" />
              <div className="h-12 rounded bg-black/10" />
              <div className="h-12 rounded bg-black/10" />
              <div className="h-12 rounded bg-black/10" />
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="h-64 rounded-lg border border-black/10 bg-white p-5">
              <div className="h-6 w-40 rounded bg-black/10" />
              <div className="mt-5 space-y-3">
                <div className="h-16 rounded bg-black/10" />
                <div className="h-16 rounded bg-black/10" />
              </div>
            </section>
            <section className="h-64 rounded-lg border border-black/10 bg-white p-5">
              <div className="h-6 w-36 rounded bg-black/10" />
              <div className="mt-5 space-y-3">
                <div className="h-16 rounded bg-black/10" />
                <div className="h-16 rounded bg-black/10" />
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
