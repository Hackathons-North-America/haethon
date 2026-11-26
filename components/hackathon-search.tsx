"use client";

import dynamic from "next/dynamic";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Archive, ChevronDown, Search, X } from "lucide-react";

import { AppNavCenter } from "@/components/app-nav-slot";
import { NavUnderline } from "@/components/nav-underline";
import { HackathonCard } from "@/components/hackathon-card";
import type { HackathonCardData } from "@/components/hackathon-card";
import type { FeatureTag } from "@/components/hackathon-search-panels";
import type { ViewerCardHydration } from "@/components/use-viewer-card-hydration";
import { WatercolorBackdrop } from "@/components/watercolor-backdrop";
import type { GeoPoint } from "@/lib/geo";
import { filterLocalHackathonCatalog } from "@/lib/hackathons/local-catalog-search";
import { sortByStartDateWithLocalBoost } from "@/lib/hackathons/ranking";
import { activeRegionPreset, regionPresets } from "@/lib/hackathons/region-presets";
import type { RegionPresetId } from "@/lib/hackathons/region-presets";
import { datePeriodOptions, dateRangeForPeriod } from "@/lib/hackathons/search-filters";
import { subscribeToHackathonStatusChanges } from "@/lib/hackathons/status-events";
import { mergeViewerCardState } from "@/lib/hackathons/viewer-card-state";
import type {
  CatalogSort,
  DatePeriod,
  DistanceFilter,
  FeatureFilter,
  HackathonFormatFilter,
  HackathonSearchFilters,
} from "@/lib/hackathons/search-filters";

const locationPopoverId = "hackathon-location-popover";
const datePopoverId = "hackathon-date-popover";
const formatPopoverId = "hackathon-format-popover";
const featurePopoverId = "hackathon-feature-popover";
const sortPopoverId = "hackathon-sort-popover";
const moreFiltersId = "hackathon-more-filters";
const SEARCH_PAGE_SIZE = 30;

type OpenPopover = "location" | "date" | "format" | "features" | "sort" | null;
type LocationMode = "country" | "near_me";

/* The user's position for the distance filter (and, via countryCode, the
   grid's "push local hackathons to the top" boost). IP-based (free Vercel geo
   headers, no permission prompt) by default; "precise" comes from the browser
   geolocation API when the user asks for it — that path has no country of its
   own, so countryCode stays null and the boost no-ops. */
type UserOrigin = GeoPoint & { label: string | null; precise: boolean; countryCode?: string | null };

const formatOptions: { label: string; value: HackathonFormatFilter; detail: string }[] = [
  { label: "Any format", value: "any", detail: "Show online and in person events" },
  { label: "Online", value: "online", detail: "Remote hackathons you can join anywhere" },
  { label: "In person", value: "in_person", detail: "Venue based hackathons and local events" },
];

function hasActiveFilters({
  beginnerFriendly,
  countries,
  datePeriod,
  distanceKm,
  format,
  highSchoolersOnly,
  name,
  travelReimbursement,
}: HackathonSearchFilters) {
  return Boolean(
    name.trim() ||
      countries.length ||
      datePeriod !== "any" ||
      distanceKm !== "any" ||
      format !== "any" ||
      beginnerFriendly !== "any" ||
      highSchoolersOnly !== "any" ||
      travelReimbursement !== "any"
  );
}

function replaceSearchUrl(
  {
    beginnerFriendly,
    countries,
    datePeriod,
    distanceKm,
    format,
    highSchoolersOnly,
    name,
    travelReimbursement,
  }: HackathonSearchFilters,
  basePath: string,
  searched: boolean,
  sort: CatalogSort
) {
  const params = new URLSearchParams();

  if (name.trim()) {
    params.set("q", name.trim());
  }

  countries.forEach((country) => params.append("countries", country));

  if (datePeriod !== "any") {
    params.set("datePeriod", datePeriod);
  }

  if (distanceKm !== "any") {
    params.set("distanceKm", String(distanceKm));
  }

  if (format !== "any") {
    params.set("format", format);
  }

  if (beginnerFriendly !== "any") {
    params.set("beginnerFriendly", beginnerFriendly);
  }

  if (travelReimbursement !== "any") {
    params.set("travelReimbursement", travelReimbursement);
  }

  if (highSchoolersOnly !== "any") {
    params.set("highSchoolersOnly", highSchoolersOnly);
  }

  if (sort !== "soonest") {
    params.set("sort", sort);
  }

  if (searched) {
    params.set("search", "1");
  }

  const query = params.toString();
  window.history.replaceState(null, "", query ? `${basePath}?${query}` : basePath);
}

/* Helpers handed to a custom card renderer so it can reflect edits/removals back
   into the grid's state (used by the admin view's edit/delete controls). */
export type HackathonCardHelpers = {
  updateCard: (next: HackathonCardData) => void;
  removeCard: (id: string) => void;
};

/* Grid order, picked from the search bar's Sort segment. */
const sortOptions: { label: string; value: CatalogSort; detail: string }[] = [
  { label: "Date", value: "soonest", detail: "Next start date first" },
  { label: "Votes", value: "top", detail: "Most upvoted by hackers first" },
];

/* The dropdowns (each field's panel inside its animated popover) and the
   open-field pill live in hackathon-search-panels.tsx with the motion
   library. Nothing they render is visible until a field is opened, so they
   load after the page is interactive instead of with it, as one chunk: every
   one of them comes from that module. A field opened in the brief gap before
   the chunk lands simply shows its panel a beat later. */
const loadPanels = () => import("@/components/hackathon-search-panels");
const SegmentPill = dynamic(() => loadPanels().then((module) => module.SegmentPill), { ssr: false });
const LocationPopover = dynamic(() => loadPanels().then((module) => module.LocationPopover), { ssr: false });
const DatePopover = dynamic(() => loadPanels().then((module) => module.DatePopover), { ssr: false });
const FeaturesPopover = dynamic(() => loadPanels().then((module) => module.FeaturesPopover), { ssr: false });
const SortPopover = dynamic(() => loadPanels().then((module) => module.SortPopover), { ssr: false });
const FormatPopover = dynamic(() => loadPanels().then((module) => module.FormatPopover), { ssr: false });

/* Stand-ins for the grid while the first page is on its way (a filtered URL
   opened directly). Sized like a cover card so the page doesn't jump. */
function CatalogSkeleton() {
  return (
    <div
      aria-busy="true"
      aria-label="Loading hackathons"
      className="grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 min-[90rem]:grid-cols-3"
      role="status"
    >
      {Array.from({ length: 6 }, (_, index) => (
        <div
          aria-hidden="true"
          className="h-[21rem] rounded-[7px] border border-ink/10 bg-ink/[0.04] motion-safe:animate-pulse"
          key={index}
        />
      ))}
    </div>
  );
}

export function HackathonSearch({
  fetchOnMount = false,
  initialFilters,
  initialHasMore = false,
  initialHasSearched = false,
  initialHackathons,
  basePath = "/hackathons",
  initialSort = "soonest",
  renderCard,
  viewerCards,
}: {
  /* Load the first page from the API on mount instead of from
     initialHackathons. Used when the page was opened on a filtered URL: the
     server-rendered page is the same static one for every URL, so the
     filtered results have to be fetched here. */
  fetchOnMount?: boolean;
  initialFilters: HackathonSearchFilters;
  initialHasMore?: boolean;
  initialHasSearched?: boolean;
  initialHackathons: HackathonCardData[];
  /* Path the filter state is written back to via history.replaceState. Defaults
     to the public page; the admin view passes its own route. */
  basePath?: string;
  /* Grid order from the ?sort= URL param: soonest start, or top voted. */
  initialSort?: CatalogSort;
  /* Overrides how each grid card renders. Defaults to a plain HackathonCard; the
     admin view wraps it with edit/delete controls. */
  renderCard?: (hackathon: HackathonCardData, helpers: HackathonCardHelpers) => ReactNode;
  /* Where the viewer's own card state (pipeline stage, votes) comes from when
     cards were rendered without it: the static page's cards, or a response
     the API answered before it could see the session. Omitted, cards keep
     whatever state they arrived with. */
  viewerCards?: ViewerCardHydration;
}) {
  const [name, setName] = useState(initialFilters.name);
  const [countries, setCountries] = useState(initialFilters.countries);
  const [countryQuery, setCountryQuery] = useState("");
  const [datePeriod, setDatePeriod] = useState<DatePeriod>(initialFilters.datePeriod);
  const [distanceKm, setDistanceKm] = useState<DistanceFilter>(initialFilters.distanceKm);
  const [origin, setOrigin] = useState<UserOrigin | null>(null);
  const [locationState, setLocationState] = useState<"idle" | "locating" | "ready" | "error">("idle");
  const [format, setFormat] = useState<HackathonFormatFilter>(initialFilters.format);
  const [beginnerFriendly, setBeginnerFriendly] = useState<FeatureFilter>(initialFilters.beginnerFriendly);
  const [travelReimbursement, setTravelReimbursement] = useState<FeatureFilter>(initialFilters.travelReimbursement);
  const [highSchoolersOnly, setHighSchoolersOnly] = useState<FeatureFilter>(initialFilters.highSchoolersOnly);
  const [catalog, setCatalog] = useState(initialHackathons);
  const [appliedFilters, setAppliedFilters] = useState(initialFilters);
  const [sort, setSort] = useState<CatalogSort>(initialSort);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [hasSearched, setHasSearched] = useState(initialHasSearched);
  const [isSearching, setIsSearching] = useState(fetchOnMount);
  const [searchError, setSearchError] = useState<string | null>(null);
  const [openPopover, setOpenPopover] = useState<OpenPopover>(null);
  /* Whether the last change went straight from one field to another (morph)
     rather than opening or closing (fade). Derived during render from the
     previous value, so the newly mounted panel already knows on first paint. */
  const [previousPopover, setPreviousPopover] = useState<OpenPopover>(null);
  const [popoverSwitched, setPopoverSwitched] = useState(false);

  if (previousPopover !== openPopover) {
    setPreviousPopover(openPopover);
    setPopoverSwitched(previousPopover !== null && openPopover !== null);
  }
  /* Which sub-panel the merged Location popover shows. Resets to "country" every
     time the popover opens (see the Location button's onClick). */
  const [locationMode, setLocationMode] = useState<LocationMode>("country");
  /* Name and Format live in a secondary row that stays hidden until the
     visitor opens it. Start expanded when either arrives pre-set (from the
     URL) so the active filter is never invisible. */
  const [moreFiltersOpen, setMoreFiltersOpen] = useState(
    () => Boolean(initialFilters.name.trim()) || initialFilters.format !== "any"
  );
  const filterFormRef = useRef<HTMLFormElement>(null);
  const countrySearchRef = useRef<HTMLInputElement>(null);
  const countryRowRef = useRef<HTMLDivElement>(null);
  const [countriesOverflow, setCountriesOverflow] = useState(false);
  /* Infinite scroll: the sentinel below the grid reports when it enters the
     viewport, and an effect fetches the next page while it stays visible.
     autoLoadedOffsetRef remembers the last offset we auto-requested so a failed
     or empty page can't retry itself forever. */
  const loadMoreRef = useRef<HTMLDivElement>(null);
  const autoLoadedOffsetRef = useRef(-1);
  const searchGenerationRef = useRef(0);
  /* The request currently in flight. A newer search aborts it, so a
     superseded response is neither downloaded nor left running on the server. */
  const searchAbortRef = useRef<AbortController | null>(null);
  const [loadMoreVisible, setLoadMoreVisible] = useState(false);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!filterFormRef.current?.contains(event.target as Node)) {
        setOpenPopover(null);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpenPopover(null);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, []);

  // Leaving the page drops whatever search is still on the wire.
  useEffect(() => () => searchAbortRef.current?.abort(), []);

  useEffect(() => {
    if (openPopover === "location" && locationMode === "country") {
      countrySearchRef.current?.focus();
    }
  }, [openPopover, locationMode]);

  /* Browser geolocation — accurate but shows a permission prompt, so it is
     only used on explicit request or when the free IP lookup has nothing. */
  function locateWithBrowser() {
    if (!("geolocation" in navigator)) {
      setLocationState("error");
      return;
    }

    setLocationState("locating");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        setOrigin({
          latitude: position.coords.latitude,
          longitude: position.coords.longitude,
          label: null,
          precise: true,
        });
        setLocationState("ready");
      },
      () => setLocationState("error"),
      { maximumAge: 5 * 60 * 1000, timeout: 10_000 }
    );
  }

  /* Prompt-free: Vercel's IP geo headers via /api/geo (city-level, free).
     Returns whether a position was found, so callers can decide whether to
     escalate to the (permission-prompting) browser API. */
  async function locateViaIp() {
    try {
      const response = await fetch("/api/geo");
      const body = (await response.json()) as {
        data: { latitude: number; longitude: number; city: string | null; countryCode: string | null } | null;
      };

      if (body.data) {
        setOrigin({ ...body.data, label: body.data.city, precise: false });
        setLocationState("ready");
        return true;
      }
    } catch {
      // Fall through to the browser API.
    }

    return false;
  }

  /* Used when the visitor explicitly asks for location (a distance filter
     pick): IP lookup first, then the browser prompt if that came up empty. */
  async function locate() {
    setLocationState("locating");

    if (await locateViaIp()) {
      return;
    }

    locateWithBrowser();
  }

  useEffect(() => {
    const row = countryRowRef.current;

    if (!row) {
      return;
    }

    const checkOverflow = () => setCountriesOverflow(row.scrollWidth > row.clientWidth + 1);

    checkOverflow();

    const observer = new ResizeObserver(checkOverflow);
    observer.observe(row);

    return () => observer.disconnect();
  }, [countries]);

  const featureTags: FeatureTag[] = [
    { key: "beginnerFriendly", label: "Beginner friendly", value: beginnerFriendly, setValue: setBeginnerFriendly },
    {
      key: "travelReimbursement",
      label: "Travel reimbursements",
      value: travelReimbursement,
      setValue: setTravelReimbursement,
    },
    { key: "highSchoolersOnly", label: "High school only", value: highSchoolersOnly, setValue: setHighSchoolersOnly },
  ];

  const currentFilters = useMemo(
    () => ({
      beginnerFriendly,
      countries,
      datePeriod,
      distanceKm,
      format,
      highSchoolersOnly,
      name,
      travelReimbursement,
    }),
    [beginnerFriendly, countries, datePeriod, distanceKm, format, highSchoolersOnly, name, travelReimbursement]
  );
  const activeFilters = useMemo(() => hasActiveFilters(currentFilters), [currentFilters]);
  const filteredHackathons = useMemo(
    () => filterLocalHackathonCatalog(catalog, appliedFilters, origin),
    [appliedFilters, catalog, origin]
  );
  const originCountryCode = origin?.countryCode ?? null;
  /* "Votes" pages arrive already ranked by the server, which is the only
     place that can order across pages, so they are shown as-is. */
  const sortedHackathons = useMemo(
    () => (sort === "top" ? filteredHackathons : sortByStartDateWithLocalBoost(filteredHackathons, originCountryCode)),
    [filteredHackathons, originCountryCode, sort]
  );
  /* The catalog arrives with past (recurring) editions already ordered after
     everything upcoming; splitting on isPast keeps that order while letting the
     grid draw an explicit archive divider between the two groups. The split
     reads off the local-boosted sort rather than the raw filtered list. */
  const upcomingHackathons = useMemo(
    () => sortedHackathons.filter((hackathon) => !hackathon.isPast),
    [sortedHackathons]
  );
  const pastHackathons = useMemo(
    () => sortedHackathons.filter((hackathon) => hackathon.isPast),
    [sortedHackathons]
  );
  const selectedPreset = useMemo(() => activeRegionPreset({ countries, format }), [countries, format]);

  /* Deferred a microtask because on the first render this effect runs before
     Next's app router (a parent) patches history.replaceState, and the raw call
     would overwrite Next's history state with null. Back/Forward ignore such an
     entry, so closing a side panel opened from here (router.back()) changed the
     URL but left the panel on screen. Once patched, replaceState(null, ...)
     keeps Next's state and syncs useSearchParams. */
  useEffect(() => {
    // Skipped if this instance was replaced before the microtask ran (the
    // catalog page swaps in a URL-filtered instance right after hydration);
    // otherwise the outgoing instance would overwrite the URL's filters.
    let cancelled = false;

    queueMicrotask(() => {
      if (!cancelled) {
        replaceSearchUrl(appliedFilters, basePath, hasSearched, sort);
      }
    });

    return () => {
      cancelled = true;
    };
  }, [appliedFilters, basePath, hasSearched, sort]);

  /* Run once on mount; the filters and sort it uses are this instance's
     initial ones, which never change. */
  useEffect(() => {
    if (fetchOnMount) {
      void searchHackathons(initialFilters, 0, false, initialSort);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* The viewer's own state for cards that were rendered without it arrives
     here, after the cards are already on screen. A stage the viewer changed
     in the meantime is newer than that answer, so it is left alone. */
  const statusChangedIdsRef = useRef(new Set<string>());

  useEffect(
    () => subscribeToHackathonStatusChanges((hackathonId) => statusChangedIdsRef.current.add(hackathonId)),
    []
  );

  useEffect(
    () =>
      viewerCards?.subscribe((states) => {
        setCatalog((current) => mergeViewerCardState(current, states, statusChangedIdsRef.current));
      }),
    [viewerCards]
  );

  /* Watch the sentinel rather than the scroll position so nested scroll
     containers and the page itself both work. The margin starts the fetch a
     screen early, so the next rows are usually there before the visitor
     reaches the end of the grid. */
  useEffect(() => {
    const node = loadMoreRef.current;

    if (!node) {
      setLoadMoreVisible(false);
      return;
    }

    const observer = new IntersectionObserver(
      ([entry]) => setLoadMoreVisible(entry.isIntersecting),
      { rootMargin: "600px 0px" }
    );

    observer.observe(node);

    return () => observer.disconnect();
  }, [hasSearched, hasMore]);

  useEffect(() => {
    if (!loadMoreVisible || !hasSearched || !hasMore || isSearching) {
      return;
    }

    // The sentinel often stays visible after a page lands, which re-runs this
    // effect and chains straight into the following page. Skip the offset we
    // already asked for so a request that returns nothing can't spin.
    if (autoLoadedOffsetRef.current === catalog.length) {
      return;
    }

    autoLoadedOffsetRef.current = catalog.length;
    void searchHackathons(appliedFilters, catalog.length, true);
  }, [appliedFilters, catalog.length, hasMore, hasSearched, isSearching, loadMoreVisible]);

  const cardHelpers = useMemo<HackathonCardHelpers>(
    () => ({
      updateCard: (next) => setCatalog((current) => current.map((entry) => (entry.id === next.id ? next : entry))),
      removeCard: (id) => setCatalog((current) => current.filter((entry) => entry.id !== id)),
    }),
    []
  );
  const renderCardNode =
    renderCard ??
    ((hackathon: HackathonCardData) => (
      <HackathonCard hackathon={hackathon} showSource />
    ));

  const selectedDateLabel = datePeriodOptions.find((option) => option.value === datePeriod)?.label ?? "Any date";
  const selectedFormatLabel = formatOptions.find((option) => option.value === format)?.label ?? "Any format";
  const selectedDistanceLabel =
    distanceKm === "any"
      ? "Any distance"
      : locationState === "error"
        ? "Location unavailable"
        : `Within ${distanceKm} km`;
  const selectedSortLabel = sortOptions.find((option) => option.value === sort)?.label ?? "Date";
  const selectedFeatureLabels = featureTags.filter((tag) => tag.value === "on").map((tag) => tag.label);

  function changeSort(next: CatalogSort) {
    if (next === sort) {
      return;
    }

    setSort(next);
    // A different order means different pages, so restart from the top.
    void searchHackathons(appliedFilters, 0, false, next);
  }

  function selectCountry(country: string) {
    setCountries((selectedCountries) =>
      selectedCountries.includes(country) ? selectedCountries : [...selectedCountries, country]
    );
    setCountryQuery("");
  }

  function removeCountry(country: string) {
    setCountries((selectedCountries) => selectedCountries.filter((selectedCountry) => selectedCountry !== country));
  }

  function pickDistance(next: DistanceFilter) {
    setDistanceKm(next);

    if (next !== "any" && !origin && locationState === "idle") {
      void locate();
    }
  }

  function toggleCountry(country: string) {
    if (countries.includes(country)) {
      removeCountry(country);
      return;
    }

    selectCountry(country);
  }

  function applyRegionPreset(presetId: RegionPresetId) {
    const preset = regionPresets.find((option) => option.id === presetId);

    if (!preset) {
      return;
    }

    // A second click on the active preset clears it back to "all".
    const nextCountries = selectedPreset === presetId ? [] : [...preset.filters.countries];
    const nextFormat = selectedPreset === presetId ? "any" : preset.filters.format;
    const nextFilters = {
      ...currentFilters,
      countries: nextCountries,
      format: nextFormat,
    };

    setCountries(nextCountries);
    setCountryQuery("");
    setFormat(nextFormat);
    void searchHackathons(nextFilters);
  }

  async function searchHackathons(
    filters: HackathonSearchFilters,
    offset = 0,
    append = false,
    sortOrder: CatalogSort = sort
  ) {
    /* A new filter search supersedes any in-flight infinite-scroll request (or
       an earlier rapid preset click). Only responses from the current
       generation may update the catalog and URL. */
    const searchGeneration = append ? searchGenerationRef.current : ++searchGenerationRef.current;

    setIsSearching(true);
    setSearchError(null);
    setOpenPopover(null);

    if (!append) {
      // New result set, so the auto-load guard starts over.
      autoLoadedOffsetRef.current = -1;
      // Whatever was loading belongs to the previous result set.
      searchAbortRef.current?.abort();
    }

    const abortController = new AbortController();
    searchAbortRef.current = abortController;

    if (filters.distanceKm !== "any" && !origin && locationState !== "locating") {
      void locate();
    }

    const params = new URLSearchParams({
      limit: String(SEARCH_PAGE_SIZE),
      offset: String(offset),
    });

    if (sortOrder !== "soonest") params.set("sort", sortOrder);
    const dateRange = dateRangeForPeriod(filters.datePeriod);

    if (filters.name.trim()) params.set("q", filters.name.trim());
    filters.countries.forEach((country) => params.append("countries", country));
    if (filters.format !== "any") params.set("format", filters.format);
    if (filters.beginnerFriendly !== "any") {
      params.set("beginnerFriendly", String(filters.beginnerFriendly === "on"));
    }
    if (filters.travelReimbursement !== "any") {
      params.set("travelReimbursement", String(filters.travelReimbursement === "on"));
    }
    if (filters.highSchoolersOnly !== "any") {
      params.set("highSchoolersOnly", String(filters.highSchoolersOnly === "on"));
    }
    if (dateRange) {
      params.set("startsAfter", dateRange.startsAfter.toISOString());
      params.set("startsBefore", dateRange.startsBefore.toISOString());
    }

    try {
      const response = await fetch(`/api/hackathons?${params.toString()}`, { signal: abortController.signal });

      if (!response.ok) {
        throw new Error("Search request failed.");
      }

      const body = (await response.json()) as {
        data: HackathonCardData[];
        hasMore: boolean;
        signedIn?: boolean;
      };

      if (searchGeneration !== searchGenerationRef.current) {
        return;
      }

      // Answered without a session. If the visitor turns out to be signed in
      // (the request beat Clerk refreshing its session cookie after a hard
      // load), their state for these cards is fetched once that is known.
      if (body.signedIn === false) {
        viewerCards?.request(body.data.map((card) => card.id));
      }

      setCatalog((current) => (append ? [...current, ...body.data] : body.data));
      setHasMore(body.hasMore);
      setAppliedFilters(filters);
      setHasSearched(true);
    } catch {
      // Aborted by a newer search (or by leaving the page): not an error.
      if (abortController.signal.aborted || searchGeneration !== searchGenerationRef.current) {
        return;
      }

      setSearchError("Couldn’t load hackathons. Please try again.");
      if (append) {
        // Don't auto-retry a page that just failed; the Try again button
        // clears the guard instead.
        autoLoadedOffsetRef.current = offset;
      }
    } finally {
      if (searchGeneration === searchGenerationRef.current) {
        setIsSearching(false);
      }
    }
  }

  function clearSearch() {
    const clearedFilters: HackathonSearchFilters = {
      beginnerFriendly: "any",
      countries: [],
      datePeriod: "any",
      distanceKm: "any",
      format: "any",
      highSchoolersOnly: "any",
      name: "",
      travelReimbursement: "any",
    };

    setName("");
    setCountries([]);
    setCountryQuery("");
    setDatePeriod("any");
    setDistanceKm("any");
    setFormat("any");
    setBeginnerFriendly("any");
    setTravelReimbursement("any");
    setHighSchoolersOnly("any");
    setSearchError(null);
    void searchHackathons(clearedFilters);
  }

  return (
    <>
      {/* Continues the top nav's band. The landing page's beige watercolor
          sits behind it and reaches up behind the nav, which goes transparent
          whenever a page fills its center slot (see AppTopNav). One backdrop
          spanning both keeps the texture from restarting at the seam; it runs
          past the top of the page by a margin generous enough for the tallest
          (phone) header, and the overshoot is simply off-screen.

          Its bottom edge is the landing page's dome horizon, a bit flatter
          here (--dome about 80% of the landing's max(24px,2.6vw)) so it reads
          as a gentle bend under the search bar. The backdrop hangs --dome below
          the section, so the arc's peak sits where a straight edge would and
          its ends dip into the results section's top padding; the search bar
          above keeps its clearance and nothing below moves. */}
      <section
        aria-label="Hackathon filters"
        className="relative isolate z-30 px-5 pb-[3.375rem] pt-3 [--dome:max(20px,2.1vw)] sm:px-8 sm:pt-4 lg:px-12"
      >
        <WatercolorBackdrop
          dome
          className="absolute inset-x-0 bottom-[calc(-1*var(--dome))] -z-10 h-[calc(100%+16rem+var(--dome))]"
        />
        {/* Shared with the results grid below so the filter bar, the heading,
            and the card columns all line up on the same edges. */}
        <div className="mx-auto max-w-[1800px]">
          {/* Region tabs live in the top nav's center column (Airbnb's
              Homes / Experiences row): text label, underline when
              active. The state and handlers stay here. */}
          <AppNavCenter>
            <div
              aria-label="Region filters"
              className="flex items-stretch justify-center gap-4 sm:gap-8 lg:gap-10"
              role="group"
            >
              {regionPresets.map((preset) => {
                const active = selectedPreset === preset.id;

                return (
                  <button
                    aria-pressed={active}
                    className={`group relative inline-flex min-h-14 items-center justify-center whitespace-nowrap px-[5px] py-[7.5px] text-[13px] font-semibold transition-colors sm:text-[15px] lg:min-h-[68px] focus-visible:outline-none focus-visible:text-pine focus-visible:underline focus-visible:underline-offset-4 ${
                      active ? "text-pine" : "text-ink/55"
                    }`}
                    key={preset.id}
                    onClick={() => applyRegionPreset(preset.id)}
                    type="button"
                  >
                    {/* The underline hangs off the label, not the button, so it
                        sits just under the text however tall the nav row is. */}
                    <span className="relative">
                      {preset.label}
                      <NavUnderline active={active} />
                    </span>
                  </button>
                );
              })}
            </div>
          </AppNavCenter>

          <form
            /* Narrower than the 1800px results grid on purpose — a full-width
               pill stretches the three fields far past the text they hold.
               At md+ the form is just the 56rem card, so the card is what's
               centered; More hangs off its right edge (absolute) and doesn't
               count toward centering. The calc keeps 5rem free on each side
               so More never runs off a narrow viewport. */
            className="relative z-30 mx-auto w-full max-w-[61rem] md:flex md:w-[min(56rem,calc(100%-10rem))] md:max-w-none md:items-start"
            ref={filterFormRef}
            onSubmit={(event) => {
              event.preventDefault();
              void searchHackathons(currentFilters);
            }}
          >
            {/* One bar, two rows. The primary row (Location · Date · Features)
                is always visible; More reveals the second row *inside the same
                card* so it reads as one taller search bar rather than two. The
                pill radius only applies while collapsed — a rounded-full corner
                on a two-row card reads as a lozenge. */}
            <div
              className={`group/bar flex min-w-0 flex-col rounded-[2rem] border border-ink/12 bg-surface p-2 shadow-[0_6px_20px_-6px_rgba(29,42,68,0.18)] md:p-0 ${
                moreFiltersOpen ? "" : "md:rounded-full"
              } md:flex-1`}
            >
            <div className="flex flex-col gap-1 md:flex-row md:items-center">
            <div className="relative min-h-16 min-w-0 flex-[1.25]">
              {countries.map((country) => (
                <input key={country} name="countries" type="hidden" value={country} />
              ))}
              {distanceKm !== "any" ? <input name="distanceKm" type="hidden" value={distanceKm} /> : null}
              <SegmentPill show={openPopover === "location"} switched={popoverSwitched} />
              <button
                aria-controls={locationPopoverId}
                aria-expanded={openPopover === "location"}
                aria-label="Location"
                className={`relative flex min-h-16 w-full min-w-0 flex-col justify-center rounded-full px-7 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35 ${
                  openPopover === "location" ? "" : "hover:bg-paper"
                }`}
                onClick={() => {
                  // Always reopen on the Country panel, per the merged-tab design.
                  setLocationMode("country");
                  setOpenPopover((current) => (current === "location" ? null : "location"));
                }}
                type="button"
              >
                <span className="block text-xs font-semibold leading-4 text-ink">
                  Location
                </span>
                {countries.length ? (
                  <span className="relative mt-0.5 block min-w-0">
                    <span className="flex min-w-0 flex-nowrap gap-1.5 overflow-hidden" ref={countryRowRef}>
                      {countries.map((country) => (
                        <span
                          className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full border border-ink/10 bg-surface px-2 py-0.5 text-xs font-semibold text-ink"
                          key={country}
                        >
                          <span>{country}</span>
                        </span>
                      ))}
                    </span>
                    {countriesOverflow ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-y-0 right-0 flex items-center bg-gradient-to-l from-paper via-paper pl-6 pr-1 text-xs font-semibold text-ink/55"
                      >
                        ...
                      </span>
                    ) : null}
                  </span>
                ) : distanceKm !== "any" ? (
                  <span className="mt-0.5 block truncate text-sm leading-5 text-ink/55">
                    {locationState === "locating" ? "Finding you..." : selectedDistanceLabel}
                  </span>
                ) : (
                  <span className="mt-0.5 block truncate text-sm leading-5 text-ink/55">Country or near me</span>
                )}
              </button>
              <LocationPopover
                countries={countries}
                countryQuery={countryQuery}
                countrySearchRef={countrySearchRef}
                distanceKm={distanceKm}
                id={locationPopoverId}
                locationMode={locationMode}
                locationState={locationState}
                onCountryQueryChange={setCountryQuery}
                onDistanceChange={pickDistance}
                onLocatePrecisely={locateWithBrowser}
                onLocationModeChange={setLocationMode}
                onRemoveCountry={removeCountry}
                onToggleCountry={toggleCountry}
                origin={origin}
                show={openPopover === "location"}
                switched={popoverSwitched}
              />
            </div>

            <span aria-hidden="true" className="hidden h-8 w-px shrink-0 self-center bg-ink/10 transition-opacity duration-200 group-hover/bar:opacity-0 md:block" />

            <div className="relative min-h-16 min-w-0 flex-1">
              <input name="datePeriod" type="hidden" value={datePeriod} />
              <SegmentPill show={openPopover === "date"} switched={popoverSwitched} />
              <button
                aria-controls={datePopoverId}
                aria-expanded={openPopover === "date"}
                aria-label="Date"
                className={`relative flex min-h-16 w-full min-w-0 flex-col justify-center rounded-full px-7 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35 ${
                  openPopover === "date" ? "" : "hover:bg-paper"
                }`}
                onClick={() => setOpenPopover((current) => (current === "date" ? null : "date"))}
                type="button"
              >
                <span className="block text-xs font-semibold leading-4 text-ink">
                  Date
                </span>
                <span className="mt-0.5 block truncate text-sm leading-5 text-ink/55">{selectedDateLabel}</span>
              </button>
              <DatePopover
                datePeriod={datePeriod}
                id={datePopoverId}
                onSelect={(period) => {
                  setDatePeriod(period);
                  setOpenPopover(null);
                }}
                show={openPopover === "date"}
                switched={popoverSwitched}
              />
            </div>

            <span aria-hidden="true" className="hidden h-8 w-px shrink-0 self-center bg-ink/10 transition-opacity duration-200 group-hover/bar:opacity-0 md:block" />

            <div className="relative min-h-16 min-w-0 flex-[1.5]">
              {featureTags.map((tag) =>
                tag.value !== "any" ? <input key={tag.key} name={tag.key} type="hidden" value={tag.value} /> : null
              )}
              <SegmentPill show={openPopover === "features"} switched={popoverSwitched} />
              <button
                aria-controls={featurePopoverId}
                aria-expanded={openPopover === "features"}
                aria-labelledby="hackathon-feature-filters-label"
                className={`relative flex min-h-16 w-full min-w-0 flex-col justify-center rounded-full px-7 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35 ${
                  openPopover === "features" ? "" : "hover:bg-paper"
                }`}
                onClick={() => setOpenPopover((current) => (current === "features" ? null : "features"))}
                type="button"
              >
                <span
                  className="block text-xs font-semibold leading-4 text-ink"
                  id="hackathon-feature-filters-label"
                >
                  Features
                </span>
                <span className="mt-0.5 block truncate text-sm leading-5 text-ink/55">
                  {selectedFeatureLabels.length ? selectedFeatureLabels.join(", ") : "Add features"}
                </span>
              </button>
              <FeaturesPopover
                featureTags={featureTags}
                id={featurePopoverId}
                show={openPopover === "features"}
                switched={popoverSwitched}
              />
            </div>

            <span aria-hidden="true" className="hidden h-8 w-px shrink-0 self-center bg-ink/10 transition-opacity duration-200 group-hover/bar:opacity-0 md:block" />

            {/* Sort sits in the bar like Airbnb's "Who": the grid order is
                part of the query. Picking one re-runs the search right away
                with the filters already applied. */}
            <div className="relative min-h-16 min-w-0 flex-1">
              <SegmentPill show={openPopover === "sort"} switched={popoverSwitched} />
              <button
                aria-controls={sortPopoverId}
                aria-expanded={openPopover === "sort"}
                aria-label="Sort"
                className={`relative flex min-h-16 w-full min-w-0 flex-col justify-center rounded-full px-7 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35 ${
                  openPopover === "sort" ? "" : "hover:bg-paper"
                }`}
                onClick={() => setOpenPopover((current) => (current === "sort" ? null : "sort"))}
                type="button"
              >
                <span className="block text-xs font-semibold leading-4 text-ink">Sort</span>
                <span className="mt-0.5 block truncate text-sm leading-5 text-ink/55">{selectedSortLabel}</span>
              </button>
              <SortPopover
                id={sortPopoverId}
                onSelect={(next) => {
                  setOpenPopover(null);
                  changeSort(next);
                }}
                show={openPopover === "sort"}
                sort={sort}
                sortOptions={sortOptions}
                switched={popoverSwitched}
              />
            </div>

            <div className="flex items-center justify-end gap-1 px-1 py-1 md:py-0 md:pl-1 md:pr-2">
              {activeFilters ? (
                <button
                  aria-label="Clear hackathon search"
                  className="grid size-10 shrink-0 place-items-center rounded-full border border-ink/15 text-ink hover:border-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35"
                  onClick={clearSearch}
                  type="button"
                >
                  <X aria-hidden="true" className="size-4" />
                </button>
              ) : null}
              <button
                aria-label={isSearching ? "Searching hackathons" : "Search hackathons"}
                className="grid size-12 shrink-0 place-items-center rounded-full bg-pine text-paper shadow-[0_10px_24px_-10px_rgba(54,37,25,0.65)] transition-colors hover:bg-pine/90 disabled:cursor-wait disabled:opacity-60"
                disabled={isSearching}
                type="submit"
              >
                <Search aria-hidden="true" className="size-5" />
              </button>
            </div>
            </div>

            {/* Secondary row: search by name + format, revealed by the More
                toggle and separated by a hairline instead of a second card. */}
            {moreFiltersOpen ? (
              <>
                <span aria-hidden="true" className="mx-6 h-px bg-ink/10" />
                <div className="flex flex-col gap-1 md:flex-row md:items-center" id={moreFiltersId}>
                <label className="flex min-h-16 min-w-0 flex-1 flex-col justify-center rounded-full px-7 py-2 text-left focus-within:bg-paper hover:bg-paper">
                  <span className="block text-xs font-semibold leading-4 text-ink">
                    Name
                  </span>
                  <input
                    className="min-w-0 bg-transparent text-sm leading-5 text-ink/55 outline-none placeholder:text-ink/55"
                    name="q"
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Hackathon name"
                    type="search"
                    value={name}
                  />
                </label>

                <span aria-hidden="true" className="hidden h-8 w-px shrink-0 self-center bg-ink/10 transition-opacity duration-200 group-hover/bar:opacity-0 md:block" />

                <div className="relative min-h-16 min-w-0 flex-1">
                  <input name="format" type="hidden" value={format} />
                  <SegmentPill show={openPopover === "format"} switched={popoverSwitched} />
                  <button
                    aria-controls={formatPopoverId}
                    aria-expanded={openPopover === "format"}
                    aria-label="Format"
                    className={`relative flex min-h-16 w-full min-w-0 flex-col justify-center rounded-full px-7 py-2 text-left focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35 ${
                      openPopover === "format" ? "" : "hover:bg-paper"
                    }`}
                    onClick={() => setOpenPopover((current) => (current === "format" ? null : "format"))}
                    type="button"
                  >
                    <span className="block text-xs font-semibold leading-4 text-ink">
                      Format
                    </span>
                    <span className="mt-0.5 block truncate text-sm leading-5 text-ink/55">{selectedFormatLabel}</span>
                  </button>
                  <FormatPopover
                    format={format}
                    formatOptions={formatOptions}
                    id={formatPopoverId}
                    onSelect={(next) => {
                      setFormat(next);
                      setOpenPopover(null);
                    }}
                    show={openPopover === "format"}
                    switched={popoverSwitched}
                  />
                </div>
                </div>
              </>
            ) : null}
            </div>

            {/* At md+ More sits outside the card, just right of the Search
                button: pinned to the form's right edge so it doesn't shift
                the centered card, and as tall as the primary row (4rem + the
                card's 1px borders) so it stays level with Search even when
                the second row opens below.
                On phones the card stacks into a column, so More stays
                absolute under the bar inside the band's bottom padding.
                Muted like the inactive region tabs. */}
            <button
              aria-controls={moreFiltersId}
              aria-expanded={moreFiltersOpen}
              className="absolute left-4 top-full mt-0.5 rounded-full px-3 py-1.5 text-sm font-semibold text-ink/55 transition-colors hover:text-ink md:left-full md:top-0 md:ml-2 md:mt-0 md:flex md:h-[calc(4rem+2px)] md:min-w-[4.5rem] md:shrink-0 md:items-center md:justify-center focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35"
              onClick={() => setMoreFiltersOpen((open) => !open)}
              type="button"
            >
              {moreFiltersOpen ? "Fewer" : "More"}
            </button>
          </form>

          <div
            /* Phones: indented past the More button, on the same line as it.
               md+: More moved beside the card, so match the card's width and
               line up with the Location field's text instead. */
            className={`mx-auto max-w-[61rem] pl-24 pr-2 md:w-[min(56rem,calc(100%-10rem))] md:max-w-none md:pl-7 text-sm text-ink/55 ${
              searchError || !hasSearched ? "mt-2 min-h-6" : ""
            }`}
            role="status"
          >
            {searchError ? (
              <span className="font-semibold text-pine">{searchError}</span>
            ) : hasSearched ? null : (
              <span>Choose your filters, then press Search to load hackathons.</span>
            )}
          </div>
        </div>
      </section>

      <section className="px-5 pb-16 pt-30 sm:px-8 sm:pb-20 lg:px-12" data-catalog-results>
        {/* The inset is the space the cards gave up when the column gap went from 64px
            to 32px: one 32px gap per column boundary, split across both sides
            (2 cols → 16px a side, 3 cols → 32px a side). Card widths stay the
            same as with a 64px gap; the grid just sits closer to center. */}
        <div className="mx-auto max-w-[1800px] sm:px-4 min-[90rem]:px-8">
          <h1 className="mb-7 font-serif text-[19.5px] font-semibold tracking-[-0.02em] text-ink sm:text-[23.4px]">
            Upcoming hackathons
          </h1>

          {!activeFilters && originCountryCode && sort === "soonest" ? (
            <p className="mb-6 -mt-3 text-sm leading-5 text-ink/50">
              Hackathons near you first.
            </p>
          ) : null}

          {!hasSearched ? (
            <div className="rounded-xl border border-dashed border-ink/15 bg-paper/60 p-10 text-center">
              <Search aria-hidden="true" className="mx-auto size-6 text-ink/35" />
              <h2 className="mt-3 text-xl font-semibold text-ink">Search the hackathon catalog</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink/55">
                Results are loaded only after you press Search, keeping the full catalog out of the initial page payload.
              </p>
            </div>
          ) : isSearching && !catalog.length ? (
            <CatalogSkeleton />
          ) : searchError && !catalog.length ? (
            <div className="rounded-xl border border-ink/10 bg-paper p-8 text-center">
              <h2 className="text-xl font-semibold text-ink">Couldn’t load hackathons</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink/55">
                Something went wrong on the way. Your filters are still set.
              </p>
              <button
                className="mt-5 inline-flex min-h-11 items-center justify-center rounded-full border border-ink/15 px-6 text-sm font-semibold text-ink transition-colors hover:border-ink"
                onClick={() => void searchHackathons(appliedFilters)}
                type="button"
              >
                Try again
              </button>
            </div>
          ) : filteredHackathons.length ? (
            <>
              {upcomingHackathons.length ? (
                <div className="grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 min-[90rem]:grid-cols-3">
                  {upcomingHackathons.map((hackathon) => (
                    <Fragment key={hackathon.id}>{renderCardNode(hackathon, cardHelpers)}</Fragment>
                  ))}
                </div>
              ) : null}

              {pastHackathons.length ? (
                <details className={`group/archive ${upcomingHackathons.length ? "mt-14" : "mt-2"}`}>
                  <summary className="group/trigger flex cursor-pointer list-none items-center gap-4 rounded-full focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-pine/35 [&::-webkit-details-marker]:hidden">
                    <span aria-hidden="true" className="h-px flex-1 bg-ink/15" />
                    <span className="inline-flex min-h-11 items-center gap-2 px-4 font-mono text-[11px] font-semibold uppercase tracking-[0.16em] text-ink/75 transition-colors group-hover/trigger:text-ink">
                      <Archive aria-hidden="true" className="size-3.5" />
                      Archived hackathons
                      <ChevronDown aria-hidden="true" className="size-3.5 group-open/archive:rotate-180" />
                    </span>
                    <span aria-hidden="true" className="h-px flex-1 bg-ink/15" />
                  </summary>
                  <div className="mt-6 grid grid-cols-1 gap-x-8 gap-y-14 sm:grid-cols-2 min-[90rem]:grid-cols-3">
                    {pastHackathons.map((hackathon) => (
                      <Fragment key={hackathon.id}>{renderCardNode(hackathon, cardHelpers)}</Fragment>
                    ))}
                  </div>
                </details>
              ) : null}
            </>
          ) : (
            <div className="rounded-xl border border-ink/10 bg-paper p-8 text-center">
              <h2 className="text-xl font-semibold text-ink">No hackathons match your search</h2>
              <p className="mx-auto mt-2 max-w-xl text-sm leading-6 text-ink/55">
                Try a different name, country selection, date, or feature filter.
              </p>
            </div>
          )}

          {hasSearched && hasMore ? (
            <div className="mt-10 flex justify-center" ref={loadMoreRef}>
              {searchError ? (
                <button
                  className="inline-flex min-h-11 items-center justify-center rounded-full border border-ink/15 px-6 text-sm font-semibold text-ink transition-colors hover:border-ink disabled:cursor-wait disabled:opacity-50"
                  disabled={isSearching}
                  onClick={() => {
                    autoLoadedOffsetRef.current = -1;
                    void searchHackathons(appliedFilters, catalog.length, true);
                  }}
                  type="button"
                >
                  Try again
                </button>
              ) : (
                <span
                  aria-live="polite"
                  className="min-h-11 text-sm font-semibold text-ink/55"
                >
                  Loading more hackathons…
                </span>
              )}
            </div>
          ) : null}
        </div>
      </section>
    </>
  );
}
