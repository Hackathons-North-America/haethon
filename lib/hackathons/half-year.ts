/* Half-year buckets — H1 is January–June, H2 is July–December — shared by the
   Discord past-hackathon categories and the website archive so both group past
   events identically. Boundaries use UTC, matching Discord channel naming. */

export type HalfYear = { half: 1 | 2; year: number };

export function halfYearOf(date: Date): HalfYear {
  return {
    half: date.getUTCMonth() < 6 ? 1 : 2,
    year: date.getUTCFullYear(),
  };
}

export function halfYearLabel({ half, year }: HalfYear) {
  return `H${half} ${year}`;
}

export function halfYearRangeLabel({ half }: HalfYear) {
  return half === 1 ? "January – June" : "July – December";
}

/* Most recent bucket first: H2 2026, H1 2026, H2 2025, … */
export function compareHalfYearsDesc(a: HalfYear, b: HalfYear) {
  return b.year - a.year || b.half - a.half;
}
