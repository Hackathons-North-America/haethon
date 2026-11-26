"use client";

import { useMemo } from "react";
import type { Ref } from "react";
import { Check, Globe2, LocateFixed, Navigation, Search, X } from "lucide-react";

import { SearchPopover } from "@/components/hackathon-search-popover";
import { filterCountryOptions } from "@/lib/hackathons/countries";
import { datePeriodOptions, distanceOptions } from "@/lib/hackathons/search-filters";
import type {
  CatalogSort,
  DatePeriod,
  DistanceFilter,
  FeatureFilter,
  HackathonFormatFilter,
} from "@/lib/hackathons/search-filters";

/* The search bar's dropdowns: each field's panel inside its animated
   SearchPopover. Only an open field's panel is ever on screen, so
   hackathon-search.tsx loads this module, and the animation library it pulls
   in, after the page's first cards instead of with them. Everything here is
   presentational: the filter state, and what a pick does to it, stay in
   hackathon-search.tsx and arrive as props. Closed panels are never built,
   so the country list (about 200 rows) is no longer rendered into a hidden
   popover on every render of the search bar. */

export { SegmentPill } from "@/components/hackathon-search-popover";

const countryListboxId = "hackathon-country-options";

type PopoverProps = {
  id: string;
  show: boolean;
  switched: boolean;
};

export type SearchOption<Value> = { label: string; value: Value; detail: string };

export type FeatureTag = {
  key: string;
  label: string;
  value: FeatureFilter;
  setValue: (next: FeatureFilter) => void;
};

function countryDetail(country: string) {
  if (country === "Canada" || country === "United States" || country === "Mexico") {
    return "North America";
  }

  if (country === "United Kingdom" || country === "Ireland" || country === "France" || country === "Germany") {
    return "Frequent hackathon market";
  }

  return "International destination";
}

export function LocationPopover({
  countries,
  countryQuery,
  countrySearchRef,
  distanceKm,
  id,
  locationMode,
  locationState,
  onCountryQueryChange,
  onDistanceChange,
  onLocatePrecisely,
  onLocationModeChange,
  onRemoveCountry,
  onToggleCountry,
  origin,
  show,
  switched,
}: PopoverProps & {
  countries: string[];
  countryQuery: string;
  /* hackathon-search.tsx focuses it whenever the Country panel opens. */
  countrySearchRef: Ref<HTMLInputElement>;
  distanceKm: DistanceFilter;
  locationMode: "country" | "near_me";
  locationState: "idle" | "locating" | "ready" | "error";
  onCountryQueryChange: (query: string) => void;
  onDistanceChange: (distance: DistanceFilter) => void;
  onLocatePrecisely: () => void;
  onLocationModeChange: (mode: "country" | "near_me") => void;
  onRemoveCountry: (country: string) => void;
  onToggleCountry: (country: string) => void;
  origin: { label: string | null; precise: boolean } | null;
}) {
  const filteredCountries = useMemo(() => filterCountryOptions(countryQuery), [countryQuery]);

  return (
    <SearchPopover
      className="absolute left-0 right-0 top-[calc(100%+0.75rem)] z-50 overflow-hidden border border-ink/10 bg-surface p-4 md:left-[-1rem] md:right-auto md:w-[34rem]"
      id={id}
      show={show}
      switched={switched}
    >
      {/* Segmented toggle picks which filter this tab edits. Both panels
          keep the exact UI they had as standalone tabs. */}
      {/* Bleeds past the popover's p-4 so the tabs sit flush with its
          top and sides like a nav bar; the popover's rounded corners and
          overflow-hidden clip the top edge. */}
      <div
        aria-label="Location filter type"
        className="-mx-4 -mt-4 mb-4 grid grid-cols-2 border-b border-ink/10"
        role="tablist"
      >
        {(
          [
            { mode: "country", label: "Country", icon: Globe2 },
            { mode: "near_me", label: "Near me", icon: Navigation },
          ] as const
        ).map(({ mode, label, icon: Icon }) => {
          const active = locationMode === mode;

          return (
            <button
              aria-selected={active}
              className={`relative inline-flex min-h-12 items-center justify-center gap-1.5 px-4 text-sm font-semibold transition-colors after:absolute after:inset-x-6 after:bottom-[-1px] after:h-0.5 after:rounded-full after:transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-pine/35 ${
                active
                  ? "text-ink after:bg-pine"
                  : "text-ink/55 after:bg-transparent hover:text-ink"
              }`}
              key={mode}
              onClick={() => onLocationModeChange(mode)}
              role="tab"
              type="button"
            >
              <Icon aria-hidden="true" className="size-4" />
              {label}
            </button>
          );
        })}
      </div>

      {locationMode === "country" ? (
        <>
          <div className="flex items-center gap-2 rounded-full border border-ink/10 bg-paper px-4 py-3">
            <Search aria-hidden="true" className="size-4 text-ink/55" />
            <input
              aria-autocomplete="list"
              aria-controls={countryListboxId}
              aria-expanded="true"
              aria-label="Search countries"
              className="min-w-0 flex-1 bg-transparent text-sm leading-5 text-ink outline-none placeholder:text-ink/55"
              onChange={(event) => onCountryQueryChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && filteredCountries[0]) {
                  event.preventDefault();
                  onToggleCountry(filteredCountries[0]);
                }
              }}
              placeholder="Search countries"
              ref={countrySearchRef}
              role="combobox"
              type="search"
              value={countryQuery}
            />
          </div>
          {countries.length ? (
            <div className="mt-3 flex flex-wrap gap-2">
              {countries.map((country) => (
                <button
                  aria-label={`Remove ${country}`}
                  className="inline-flex items-center gap-1.5 rounded-full border border-ink/10 bg-surface px-3 py-1.5 text-xs font-semibold text-ink hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35"
                  key={country}
                  onClick={() => onRemoveCountry(country)}
                  type="button"
                >
                  {country}
                  <X aria-hidden="true" className="size-3.5" />
                </button>
              ))}
            </div>
          ) : null}
          <div
            className="mt-4 grid max-h-[22rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2"
            id={countryListboxId}
            role="listbox"
          >
            {filteredCountries.map((country) => {
              const selected = countries.includes(country);

              return (
                <button
                  aria-selected={selected}
                  className={`flex min-h-[4.25rem] items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35 ${
                    selected
                      ? "border-pine/35 bg-pine/5"
                      : "border-transparent bg-surface hover:bg-paper"
                  }`}
                  key={country}
                  onClick={() => onToggleCountry(country)}
                  role="option"
                  type="button"
                >
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-semibold text-ink">{country}</span>
                    <span className="mt-0.5 block truncate text-xs text-ink/55">{countryDetail(country)}</span>
                  </span>
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                      selected ? "border-pine bg-pine text-paper" : "border-ink/15 text-transparent"
                    }`}
                  >
                    <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                  </span>
                </button>
              );
            })}
            {!filteredCountries.length ? (
              <div className="col-span-full rounded-xl border border-ink/10 bg-paper px-4 py-5 text-sm font-semibold text-ink/55">
                No countries match that search.
              </div>
            ) : null}
          </div>
        </>
      ) : (
        <>
          <div className="grid gap-2">
            {distanceOptions.map((option) => {
              const selected = distanceKm === option.value;

              return (
                <button
                  aria-pressed={selected}
                  className={`flex min-h-[3.5rem] items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35 ${
                    selected
                      ? "border-pine/35 bg-pine/5"
                      : "border-transparent bg-surface hover:bg-paper"
                  }`}
                  key={option.value}
                  onClick={() => onDistanceChange(option.value)}
                  type="button"
                >
                  <span className="text-sm font-semibold text-ink">{option.label}</span>
                  <span
                    className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                      selected ? "border-pine bg-pine text-paper" : "border-ink/15 text-transparent"
                    }`}
                  >
                    <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
                  </span>
                </button>
              );
            })}
          </div>
          <div className="mt-3 border-t border-ink/10 pt-3">
            {locationState === "error" ? (
              <p className="mb-2 text-xs leading-5 text-pine">
                We couldn&apos;t find your location. Allow location access in your browser and try again.
              </p>
            ) : origin ? (
              <p className="mb-2 text-xs leading-5 text-ink/55">
                {origin.precise
                  ? "Using your precise location."
                  : `Using your approximate location${origin.label ? ` near ${origin.label}` : ""}.`}
              </p>
            ) : null}
            {!origin?.precise ? (
              <button
                className="inline-flex min-h-9 items-center gap-2 rounded-full border border-ink/15 px-4 text-xs font-semibold text-ink transition-colors hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35 disabled:opacity-50"
                disabled={locationState === "locating"}
                onClick={onLocatePrecisely}
                type="button"
              >
                <LocateFixed aria-hidden="true" className="size-3.5" />
                {locationState === "locating" ? "Locating..." : "Use precise location"}
              </button>
            ) : null}
          </div>
        </>
      )}
    </SearchPopover>
  );
}

export function DatePopover({
  datePeriod,
  id,
  onSelect,
  show,
  switched,
}: PopoverProps & { datePeriod: DatePeriod; onSelect: (period: DatePeriod) => void }) {
  return (
    <SearchPopover
      className="absolute left-0 top-[calc(100%+0.75rem)] z-50 w-full min-w-[18rem] border border-ink/10 bg-surface px-6 py-2 md:w-[24rem]"
      id={id}
      show={show}
      switched={switched}
    >
      {/* Flat rows split by hairlines inset to the popover's
          padding, like Airbnb's guest picker; only the selected
          row gets a check. Sort below uses the same list. */}
      <div className="divide-y divide-ink/10">
        {datePeriodOptions.map((option) => {
          const selected = datePeriod === option.value;

          return (
            <button
              aria-pressed={selected}
              className={`flex min-h-[3.5rem] w-full items-center justify-between gap-3 py-3 text-left transition-colors focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35 ${
                selected ? "text-ink" : "text-ink/70 hover:text-ink"
              }`}
              key={option.value}
              onClick={() => onSelect(option.value)}
              type="button"
            >
              <span className={`text-sm ${selected ? "font-semibold" : "font-medium"}`}>{option.label}</span>
              {selected ? (
                <Check aria-hidden="true" className="size-5 shrink-0 text-pine" strokeWidth={2.5} />
              ) : null}
            </button>
          );
        })}
      </div>
    </SearchPopover>
  );
}

export function FeaturesPopover({ featureTags, id, show, switched }: PopoverProps & { featureTags: FeatureTag[] }) {
  return (
    <SearchPopover
      className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-full min-w-[20rem] border border-ink/10 bg-surface p-5 md:w-[27rem]"
      id={id}
      show={show}
      switched={switched}
    >
      <div className="flex flex-wrap gap-3">
        {featureTags.map((tag) => {
          const active = tag.value === "on";

          return (
            <button
              aria-pressed={active}
              className={`inline-flex min-h-12 items-center gap-2 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35 ${
                active
                  ? "border-pine bg-pine text-paper hover:bg-pine/90"
                  : "border-ink/15 bg-surface text-ink hover:border-ink"
              }`}
              key={tag.key}
              onClick={() => tag.setValue(active ? "any" : "on")}
              type="button"
            >
              <span
                className={`grid size-5 place-items-center rounded-full border ${
                  active ? "border-paper text-paper" : "border-ink/15 text-transparent"
                }`}
              >
                <Check aria-hidden="true" className="size-3" strokeWidth={3} />
              </span>
              {tag.label}
            </button>
          );
        })}
      </div>
    </SearchPopover>
  );
}

export function SortPopover({
  id,
  onSelect,
  show,
  sort,
  sortOptions,
  switched,
}: PopoverProps & {
  onSelect: (sort: CatalogSort) => void;
  sort: CatalogSort;
  sortOptions: SearchOption<CatalogSort>[];
}) {
  return (
    <SearchPopover
      className="absolute right-0 top-[calc(100%+0.75rem)] z-50 w-full min-w-[17rem] border border-ink/10 bg-surface px-6 py-2 md:w-[20rem]"
      id={id}
      show={show}
      switched={switched}
    >
      <div className="divide-y divide-ink/10">
        {sortOptions.map((option) => {
          const selected = sort === option.value;

          return (
            <button
              aria-pressed={selected}
              className={`flex min-h-[3.5rem] w-full items-center justify-between gap-3 py-3 text-left transition-colors focus-visible:rounded-lg focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35 ${
                selected ? "text-ink" : "text-ink/70 hover:text-ink"
              }`}
              key={option.value}
              onClick={() => onSelect(option.value)}
              type="button"
            >
              <span className="min-w-0">
                <span className={`block truncate text-sm ${selected ? "font-semibold" : "font-medium"}`}>{option.label}</span>
                <span className="mt-0.5 block truncate text-xs text-ink/55">{option.detail}</span>
              </span>
              {selected ? (
                <Check aria-hidden="true" className="size-5 shrink-0 text-pine" strokeWidth={2.5} />
              ) : null}
            </button>
          );
        })}
      </div>
    </SearchPopover>
  );
}

export function FormatPopover({
  format,
  formatOptions,
  id,
  onSelect,
  show,
  switched,
}: PopoverProps & {
  format: HackathonFormatFilter;
  formatOptions: SearchOption<HackathonFormatFilter>[];
  onSelect: (format: HackathonFormatFilter) => void;
}) {
  return (
    <SearchPopover
      className="absolute left-0 top-[calc(100%+0.75rem)] z-50 w-full min-w-[19rem] border border-ink/10 bg-surface p-4 md:w-[24rem]"
      id={id}
      show={show}
      switched={switched}
    >
      <div className="grid gap-2">
        {formatOptions.map((option) => {
          const selected = format === option.value;

          return (
            <button
              aria-pressed={selected}
              className={`flex min-h-[4.25rem] items-center justify-between gap-3 rounded-xl border px-4 py-3 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35 ${
                selected
                  ? "border-pine/35 bg-pine/5"
                  : "border-ink/10 bg-surface hover:border-ink/20 hover:bg-paper"
              }`}
              key={option.value}
              onClick={() => onSelect(option.value)}
              type="button"
            >
              <span className="min-w-0">
                <span className="block truncate text-sm font-semibold text-ink">{option.label}</span>
                <span className="mt-0.5 block truncate text-xs text-ink/55">{option.detail}</span>
              </span>
              <span
                className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                  selected ? "border-pine bg-pine text-paper" : "border-ink/15 text-transparent"
                }`}
              >
                <Check aria-hidden="true" className="size-3.5" strokeWidth={3} />
              </span>
            </button>
          );
        })}
      </div>
    </SearchPopover>
  );
}
