import { cardClassName } from "@/components/organizer/detail/shared";

const block = "rounded bg-ink/10";

/* Mirrors the workspace: back link, header (thumbnail, name, meta, actions),
   the tab row, then the Details tab's form and preview columns. */
export default function OrganizerHackathonLoading() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading hackathon"
      className="space-y-6 motion-safe:animate-pulse sm:space-y-8"
      role="status"
    >
      <div className="space-y-4">
        <div className={`${block} h-4 w-32`} />
        <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex min-w-0 items-center gap-4">
            <div className="size-14 shrink-0 rounded-2xl bg-ink/10 sm:size-16" />
            <div className="min-w-0 flex-1 space-y-2">
              <div className={`${block} h-7 w-56 max-w-full sm:h-8`} />
              <div className={`${block} h-4 w-64 max-w-full`} />
            </div>
          </div>
          <div className="h-11 w-44 shrink-0 rounded-full bg-ink/10" />
        </div>
      </div>

      <div className="flex h-11 items-center gap-6 border-b border-ink/10 px-3">
        <div className={`${block} h-4 w-16`} />
        <div className={`${block} h-4 w-20`} />
        <div className={`${block} h-4 w-20`} />
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_20rem] xl:grid-cols-[minmax(0,1fr)_22rem]">
        <div className={`${cardClassName} space-y-5 p-5 sm:p-6`}>
          {["w-24", "w-32", "w-28", "w-20"].map((width) => (
            <div className="space-y-2" key={width}>
              <div className={`${block} h-3.5 ${width}`} />
              <div className="h-10 rounded-xl bg-ink/[0.06]" />
            </div>
          ))}
        </div>
        <div className={`${cardClassName} hidden h-80 lg:block`} />
      </div>
      <span className="sr-only">Loading hackathon…</span>
    </div>
  );
}
