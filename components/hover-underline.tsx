// A thin underline that slides in from the left when the parent link is
// hovered. Pure CSS (scale-x tween on an absolutely positioned span), so it
// works inside server components.
//
// Usage: the parent must be `relative` (for the absolute positioning) and
// carry the `group` class (so `group-hover` reaches this span). Pass the
// positional classes (`inset-x-*` / `bottom-*`) via className, matched to the
// parent's padding so the line spans the label, not the whole hit area.
export function HoverUnderline({ className }: { className?: string }) {
  return (
    <span
      aria-hidden="true"
      // The `!` suffixes let the transition beat the global 160ms
      // color-only transition applied to every element in app/layout.tsx.
      className={`pointer-events-none absolute h-[1.5px] origin-left scale-x-0 bg-moss transition-transform! duration-300! ease-out! group-hover:scale-x-100 motion-reduce:transition-none! ${className ?? ""}`}
    />
  );
}
