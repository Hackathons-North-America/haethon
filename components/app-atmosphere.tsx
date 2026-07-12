/* Film grain only — keeps the flat background tactile, never smooth-plastic.
   Pure CSS, safe to render from server components. */

export function AppAtmosphere() {
  return (
    <div
      aria-hidden="true"
      className="pointer-events-none fixed inset-0 z-0 overflow-hidden"
    >
      <div className="hero-grain absolute inset-0 opacity-[0.04] mix-blend-overlay dark:opacity-[0.07]" />
    </div>
  );
}
