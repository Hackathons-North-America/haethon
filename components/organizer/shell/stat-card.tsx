import type { ElementType, ReactNode } from "react";

/* A console's figures as one compact row: a single bordered strip split by
   hairlines, rather than a grid of tall cards that are mostly empty space.
   Wrap StatCard items in this; it renders the <dl>. */
export function StatStrip({ children, label }: { children: ReactNode; label: string }) {
  return (
    <dl
      aria-label={label}
      className="flex divide-x divide-ink/10 overflow-hidden rounded-2xl border border-ink/10 bg-surface"
    >
      {children}
    </dl>
  );
}

/* One figure in a StatStrip. The label is the term and the number its value,
   so screen readers hear "Live now, 2"; visually the number leads (stacked
   on phones, inline from sm up). */
export function StatCard({ icon: Icon, label, value }: { icon: ElementType; label: string; value: number }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-0.5 px-3 py-2.5 sm:flex-row sm:items-center sm:gap-2 sm:px-4 sm:py-3">
      <dt className="truncate text-xs font-medium text-ink/55 sm:text-sm">{label}</dt>
      <dd className="order-first flex items-center gap-1.5 text-lg font-semibold tabular-nums tracking-tight text-ink sm:text-xl">
        <Icon aria-hidden="true" className="size-3.5 shrink-0 text-ink/45 sm:size-4" />
        {value}
      </dd>
    </div>
  );
}
