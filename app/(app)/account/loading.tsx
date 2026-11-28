const block = "rounded bg-ink/10";

/* Mirrors the résumé layout in page.tsx: header with owner actions, the
   stats strip, then Pinned, Skills, Activity and Hackathons attended. */
export default function AccountLoading() {
  return (
    <main
      aria-busy="true"
      aria-label="Loading your profile"
      className="min-h-[calc(100vh-80px)] px-4 pb-16 pt-8 sm:px-8 sm:pt-12 lg:px-12"
    >
      <div className="mx-auto w-full max-w-[760px] animate-pulse space-y-10 motion-reduce:animate-none">
        <div className="space-y-6">
          <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto] md:gap-x-6">
            <div className="flex items-center gap-4 sm:gap-5 md:col-start-1 md:row-start-1">
              <div className="size-16 shrink-0 rounded-full bg-ink/10 sm:size-20" />
              <div className="min-w-0 flex-1 space-y-2">
                <div className={`${block} h-7 w-48 max-w-full sm:h-8`} />
                <div className={`${block} h-4 w-40 max-w-full`} />
              </div>
            </div>
            <div className="space-y-2 sm:pl-[6.25rem] md:col-span-2 md:row-start-2">
              <div className={`${block} h-4 w-full max-w-prose`} />
              <div className={`${block} h-4 w-3/4`} />
            </div>
            <div className="flex gap-2 sm:pl-[6.25rem] md:col-start-2 md:row-start-1 md:pl-0">
              <div className="h-11 flex-1 rounded-full bg-ink/10 md:w-32 md:flex-none" />
              <div className="h-11 flex-1 rounded-full bg-ink/10 md:w-32 md:flex-none" />
              <div className="size-11 shrink-0 rounded-full bg-ink/10" />
            </div>
          </div>

          <div className="grid grid-cols-3 divide-x divide-ink/10 rounded-2xl border border-ink/10 bg-surface">
            {[0, 1, 2].map((item) => (
              <div className="space-y-2 px-3 py-4 sm:px-5" key={item}>
                <div className={`${block} h-7 w-10`} />
                <div className={`${block} h-3 w-20 max-w-full`} />
              </div>
            ))}
          </div>
        </div>

        <section className="space-y-3">
          <div className={`${block} h-6 w-24`} />
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="h-28 rounded-2xl border border-ink/10 bg-surface" />
            <div className="h-28 rounded-2xl border border-ink/10 bg-surface" />
          </div>
        </section>

        <section className="space-y-3">
          <div className={`${block} h-6 w-16`} />
          <div className="flex flex-wrap gap-2">
            {["w-16", "w-24", "w-20", "w-28", "w-14"].map((width) => (
              <div className={`h-8 rounded-full bg-ink/10 ${width}`} key={width} />
            ))}
          </div>
        </section>

        <section className="space-y-3">
          <div className={`${block} h-6 w-20`} />
          <div className="h-32 rounded-2xl border border-ink/10 bg-surface" />
        </section>

        <section className="space-y-3">
          <div className="flex items-center justify-between gap-4">
            <div className={`${block} h-6 w-44`} />
            <div className="h-11 w-40 rounded-full bg-ink/10" />
          </div>
          <div className="divide-y divide-ink/10 rounded-2xl border border-ink/10 bg-surface">
            {[0, 1, 2].map((item) => (
              <div className="flex min-h-14 items-center gap-3 px-4 py-3 sm:px-5" key={item}>
                <div className={`${block} h-4 w-1/2`} />
                <div className={`${block} ml-auto h-4 w-16`} />
              </div>
            ))}
          </div>
        </section>
      </div>
    </main>
  );
}
