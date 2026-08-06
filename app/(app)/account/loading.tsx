export default function AccountLoading() {
  return (
    <main className="min-h-[calc(100vh-80px)] bg-white dark:bg-white/[0.06] px-5 py-8 text-ink dark:text-paper sm:px-8 lg:px-12">
      <div className="mx-auto w-full max-w-[1120px]">
        <div className="space-y-6">
          <section className="rounded-xl border border-ink/10 dark:border-white/10 bg-paper dark:bg-white/5 p-6">
            <div className="h-4 w-28 rounded bg-ink/10 dark:bg-white/10" />
            <div className="mt-4 h-9 w-full max-w-md rounded bg-ink/10 dark:bg-white/10" />
            <div className="mt-3 h-4 w-64 rounded bg-ink/10 dark:bg-white/10" />
          </section>

          <section className="rounded-xl border border-ink/10 dark:border-white/10 bg-paper dark:bg-white/5 p-6">
            <div className="h-6 w-32 rounded bg-ink/10 dark:bg-white/10" />
            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <div className="h-12 rounded bg-ink/10 dark:bg-white/10" />
              <div className="h-12 rounded bg-ink/10 dark:bg-white/10" />
              <div className="h-12 rounded bg-ink/10 dark:bg-white/10" />
              <div className="h-12 rounded bg-ink/10 dark:bg-white/10" />
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="h-64 rounded-xl border border-ink/10 dark:border-white/10 bg-paper dark:bg-white/5 p-5">
              <div className="h-6 w-40 rounded bg-ink/10 dark:bg-white/10" />
              <div className="mt-5 space-y-3">
                <div className="h-16 rounded bg-ink/10 dark:bg-white/10" />
                <div className="h-16 rounded bg-ink/10 dark:bg-white/10" />
              </div>
            </section>
            <section className="h-64 rounded-xl border border-ink/10 dark:border-white/10 bg-paper dark:bg-white/5 p-5">
              <div className="h-6 w-36 rounded bg-ink/10 dark:bg-white/10" />
              <div className="mt-5 space-y-3">
                <div className="h-16 rounded bg-ink/10 dark:bg-white/10" />
                <div className="h-16 rounded bg-ink/10 dark:bg-white/10" />
              </div>
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}
