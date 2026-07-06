import { normalizeCountrySelections } from "@/lib/hackathons/countries";

export type DatePeriod =
  | "any"
  | "next-7-days"
  | "next-30-days"
  | "next-90-days"
  | "next-6-months"
  | "this-year"
  | "next-year";

export type FeatureFilter = "any" | "on" | "off";
export type HackathonFormatFilter = "any" | "online" | "in_person";

export type HackathonSearchFilters = {
  beginnerFriendly: FeatureFilter;
  countries: string[];
  datePeriod: DatePeriod;
  format: HackathonFormatFilter;
  name: string;
  travelReimbursement: FeatureFilter;
};

export const datePeriodOptions: { label: string; value: DatePeriod }[] = [
  { label: "Any date", value: "any" },
  { label: "Next 7 days", value: "next-7-days" },
  { label: "Next 30 days", value: "next-30-days" },
  { label: "Next 90 days", value: "next-90-days" },
  { label: "Next 6 months", value: "next-6-months" },
  { label: "This year", value: "this-year" },
  { label: "Next year", value: "next-year" },
];

const datePeriodValues = new Set<DatePeriod>(datePeriodOptions.map((option) => option.value));
const featureFilterValues = new Set<FeatureFilter>(["any", "on", "off"]);
const hackathonFormatFilterValues = new Set<HackathonFormatFilter>(["any", "online", "in_person"]);

function addDays(date: Date, days: number) {
  const nextDate = new Date(date);
  nextDate.setDate(nextDate.getDate() + days);
  return nextDate;
}

function addMonths(date: Date, months: number) {
  const nextDate = new Date(date);
  nextDate.setMonth(nextDate.getMonth() + months);
  return nextDate;
}

export function isDatePeriod(value: string): value is DatePeriod {
  return datePeriodValues.has(value as DatePeriod);
}

export function isFeatureFilter(value: string): value is FeatureFilter {
  return featureFilterValues.has(value as FeatureFilter);
}

export function isHackathonFormatFilter(value: string): value is HackathonFormatFilter {
  return hackathonFormatFilterValues.has(value as HackathonFormatFilter);
}

function firstParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function allParams(value: string | string[] | undefined) {
  return Array.isArray(value) ? value : value ? [value] : [];
}

function splitCountryParam(value: string) {
  return value
    .split(",")
    .map((country) => country.trim())
    .filter(Boolean);
}

export function normalizeSearchFilters(searchParams: Record<string, string | string[] | undefined>): HackathonSearchFilters {
  const rawName = firstParam(searchParams.q);
  const datePeriodValue = firstParam(searchParams.datePeriod);
  const formatValue = firstParam(searchParams.format);
  const beginnerFriendlyValue = firstParam(searchParams.beginnerFriendly);
  const travelReimbursementValue = firstParam(searchParams.travelReimbursement);
  const countries = normalizeCountrySelections(
    [...allParams(searchParams.countries), ...allParams(searchParams.country)].flatMap(splitCountryParam)
  );

  return {
    beginnerFriendly:
      beginnerFriendlyValue && isFeatureFilter(beginnerFriendlyValue) ? beginnerFriendlyValue : "any",
    countries,
    datePeriod: datePeriodValue && isDatePeriod(datePeriodValue) ? datePeriodValue : "any",
    format: formatValue && isHackathonFormatFilter(formatValue) ? formatValue : "any",
    name: rawName?.trim() ?? "",
    travelReimbursement:
      travelReimbursementValue && isFeatureFilter(travelReimbursementValue) ? travelReimbursementValue : "any",
  };
}

export function dateRangeForPeriod(period: DatePeriod) {
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());

  if (period === "any") {
    return null;
  }

  if (period === "this-year") {
    return {
      startsAfter: new Date(now.getFullYear(), 0, 1),
      startsBefore: new Date(now.getFullYear(), 11, 31, 23, 59, 59, 999),
    };
  }

  if (period === "next-year") {
    return {
      startsAfter: new Date(now.getFullYear() + 1, 0, 1),
      startsBefore: new Date(now.getFullYear() + 1, 11, 31, 23, 59, 59, 999),
    };
  }

  const periodEndDates: Record<Exclude<DatePeriod, "any" | "this-year" | "next-year">, Date> = {
    "next-7-days": addDays(startOfToday, 7),
    "next-30-days": addDays(startOfToday, 30),
    "next-90-days": addDays(startOfToday, 90),
    "next-6-months": addMonths(startOfToday, 6),
  };

  return {
    startsAfter: startOfToday,
    startsBefore: periodEndDates[period],
  };
}
