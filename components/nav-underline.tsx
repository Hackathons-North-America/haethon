/* The top nav's underline (region tabs, "Add a hackathon"): a 3px rounded bar
   just under the label, overhanging it by 5px on each side. Its parent must be
   the label's `relative` wrapper, inside a `group` that triggers the hover.
   Inactive, it sits at zero width and grows out from the center on hover;
   active, it stays full width in pine.
   The `!`s are needed: app/layout.tsx gives every element a color-only
   transition through a `[&_*]` rule that otherwise wins over these. Tailwind
   v4's scale-x-* sets the `scale` property, not `transform`. */
export function NavUnderline({ active = false }: { active?: boolean }) {
  return (
    <span
      aria-hidden="true"
      className={`absolute -inset-x-[5px] top-full mt-1.5 h-[3px] origin-center rounded-full transition-[scale,background-color]! duration-200! ease-out! motion-reduce:transition-none! ${
        active ? "scale-x-100 bg-pine" : "scale-x-0 bg-ink/15 group-hover:scale-x-100"
      }`}
    />
  );
}
