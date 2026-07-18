/* Half-year buckets — H1 is January–June, H2 is July–December — used by the
   Discord past-hackathon categories. Boundaries use UTC, matching Discord
   channel naming. */

export type HalfYear = { half: 1 | 2; year: number };

export function halfYearOf(date: Date): HalfYear {
  return {
    half: date.getUTCMonth() < 6 ? 1 : 2,
    year: date.getUTCFullYear(),
  };
}
