"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BellPlus, Check, ChevronDown, Globe2, Search, Trash2 } from "lucide-react";

import { filterCountryOptions } from "@/lib/hackathons/countries";

export type CountryAlertSubscription = {
  country: string;
};

function handleUnauthenticated() {
  window.location.href = "/sign-in";
}

/* Country alert bar at the top of the My Hackathons board. One alert per
   account: pick a country, and new hackathons published there show up in the
   Monday weekly digest email. Mirrors the search bar's pill styling and the
   countries popover from the Hackathons DB page. */
export function CountryAlertSection({ subscription }: { subscription: CountryAlertSubscription | null }) {
  const router = useRouter();
  const [saved, setSaved] = useState(subscription);
  const [open, setOpen] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [countryQuery, setCountryQuery] = useState("");
  const [draftCountry, setDraftCountry] = useState<string | null>(subscription?.country ?? null);
  const rootRef = useRef<HTMLDivElement>(null);
  const countrySearchRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!open) {
      return;
    }

    countrySearchRef.current?.focus();

    function handlePointerDown(event: PointerEvent) {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  const filteredCountries = useMemo(() => filterCountryOptions(countryQuery), [countryQuery]);

  function toggleOpen() {
    setOpen((current) => {
      if (!current) {
        setDraftCountry(saved?.country ?? null);
        setCountryQuery("");
        setError(null);
      }

      return !current;
    });
  }

  async function save() {
    if (!draftCountry || pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/account/country-alert", {
        body: JSON.stringify({ country: draftCountry }),
        headers: { "Content-Type": "application/json" },
        method: "PUT",
      });

      if (response.status === 401) {
        handleUnauthenticated();
        return;
      }

      // The server refuses a new subscription when a week is already fully
      // booked against the five-email weekly limit.
      if (response.status === 409) {
        setError("For now, you're limited to five emails per week.");
        return;
      }

      if (!response.ok) {
        throw new Error("Could not save the alert.");
      }

      setSaved({ country: draftCountry });
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not save the alert. Try again.");
    } finally {
      setPending(false);
    }
  }

  async function remove() {
    if (pending) {
      return;
    }

    setPending(true);
    setError(null);

    try {
      const response = await fetch("/api/account/country-alert", { method: "DELETE" });

      if (response.status === 401) {
        handleUnauthenticated();
        return;
      }

      if (!response.ok) {
        throw new Error("Could not remove the alert.");
      }

      setSaved(null);
      setDraftCountry(null);
      setOpen(false);
      router.refresh();
    } catch {
      setError("Could not remove the alert. Try again.");
    } finally {
      setPending(false);
    }
  }

  return (
    <section aria-label="Country alerts" className="relative z-30 mb-10">
      <div
        className="relative flex flex-col gap-2 rounded-[2.35rem] border border-navy/10 dark:border-white/10 bg-white dark:bg-[#1b1b1b] p-2 shadow-[0_10px_36px_rgba(0,0,0,0.14)] md:flex-row md:items-center"
        ref={rootRef}
      >
        <div className="flex min-h-[4.2rem] min-w-0 flex-1 flex-col justify-center rounded-[2rem] px-6 py-3">
          <span className="flex items-center gap-1.5 text-xs font-semibold leading-5 text-navy dark:text-wheat">
            <Globe2 aria-hidden="true" className="size-3.5" />
            Country Alerts
          </span>
          <span className="mt-1 text-sm leading-5 text-navy/55 dark:text-wheat/55">
            {saved
              ? `New hackathons in ${saved.country} land in your Monday digest email`
              : "New hackathons in a country you pick, in one weekly digest email."}
          </span>
        </div>

        <div className="flex items-center gap-2 px-4 pb-2 md:px-0 md:pb-0 md:pr-4">
          {saved ? (
            <button
              aria-label="Remove country alert"
              className="grid size-10 place-items-center rounded-full text-navy/55 transition-colors hover:bg-navy/[0.05] hover:text-navy dark:text-wheat/55 dark:hover:bg-white/5 dark:hover:text-wheat focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35 dark:focus-visible:outline-wheat/40"
              disabled={pending}
              onClick={remove}
              type="button"
            >
              <Trash2 aria-hidden="true" className="size-4" />
            </button>
          ) : null}
          <button
            aria-expanded={open}
            className={`inline-flex min-h-10 items-center gap-1.5 rounded-full border px-4 text-sm font-semibold transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35 dark:focus-visible:outline-wheat/40 ${
              open
                ? "border-pine bg-pine text-wheat dark:border-moss/50 dark:bg-moss/15 dark:text-moss"
                : "border-pine text-pine hover:bg-pine hover:text-wheat dark:border-moss/50 dark:text-moss dark:hover:bg-moss/10"
            }`}
            onClick={toggleOpen}
            type="button"
          >
            <BellPlus aria-hidden="true" className="size-3.5" />
            {saved ? "Edit Reminder" : "Add Reminder"}
            <ChevronDown aria-hidden="true" className={`size-3.5 transition-transform ${open ? "rotate-180" : ""}`} />
          </button>
        </div>

        {open ? (
          <div className="absolute left-0 right-0 top-[calc(100%+0.9rem)] z-50 overflow-hidden rounded-[1.75rem] border border-navy/10 dark:border-white/10 bg-white dark:bg-[#1b1b1b] p-4 shadow-[0_22px_55px_rgba(0,0,0,0.2)] md:left-auto md:right-0 md:w-[34rem]">
            <div className="flex items-center gap-2 rounded-full border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-4 py-3">
              <Search aria-hidden="true" className="size-4 text-navy/55 dark:text-wheat/55" />
              <input
                aria-label="Search countries"
                className="min-w-0 flex-1 bg-transparent text-sm leading-5 text-navy dark:text-wheat outline-none placeholder:text-navy/55 dark:placeholder:text-wheat/40"
                onChange={(event) => setCountryQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && filteredCountries[0]) {
                    event.preventDefault();
                    setDraftCountry(filteredCountries[0]);
                  }
                }}
                placeholder="Search countries"
                ref={countrySearchRef}
                type="search"
                value={countryQuery}
              />
            </div>

            <div className="mt-3 grid max-h-[16rem] gap-2 overflow-y-auto pr-1 sm:grid-cols-2" role="listbox">
              {filteredCountries.map((country) => {
                const selected = draftCountry === country;

                return (
                  <button
                    aria-selected={selected}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3 py-2.5 text-left transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35 dark:focus-visible:outline-wheat/40 ${
                      selected
                        ? "border-pine/35 dark:border-moss/40 bg-pine/5 dark:bg-moss/10"
                        : "border-navy/10 dark:border-white/10 bg-white dark:bg-white/[0.06] hover:border-navy/20 hover:bg-ivory dark:hover:bg-white/10"
                    }`}
                    key={country}
                    onClick={() => setDraftCountry(country)}
                    role="option"
                    type="button"
                  >
                    <span className="block truncate text-sm font-semibold text-navy dark:text-wheat">{country}</span>
                    <span
                      aria-hidden="true"
                      className={`grid size-6 shrink-0 place-items-center rounded-full border ${
                        selected
                          ? "border-pine dark:border-moss/50 bg-pine text-wheat dark:bg-wheat dark:text-[#141414]"
                          : "border-navy/15 dark:border-white/15 text-transparent"
                      }`}
                    >
                      <Check className="size-3.5" strokeWidth={3} />
                    </span>
                  </button>
                );
              })}
              {!filteredCountries.length ? (
                <div className="col-span-full rounded-xl border border-navy/10 dark:border-white/10 bg-ivory dark:bg-white/5 px-4 py-5 text-sm font-semibold text-navy/55 dark:text-wheat/55">
                  No countries match that search.
                </div>
              ) : null}
            </div>

            <div className="mt-4 flex items-center justify-between gap-3">
              <p className="text-xs text-navy/55 dark:text-wheat/55">
                {error ?? "One alert per account, delivered in your Monday digest — saving replaces your current one."}
              </p>
              <button
                className="inline-flex min-h-10 shrink-0 items-center justify-center rounded-full bg-pine px-5 text-sm font-semibold text-wheat transition-opacity disabled:opacity-50 dark:bg-wheat dark:text-[#141414] focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-pine/35 dark:focus-visible:outline-wheat/40"
                disabled={!draftCountry || pending}
                onClick={save}
                type="button"
              >
                {pending ? "Saving…" : draftCountry ? `Save alert · ${draftCountry}` : "Pick a country"}
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </section>
  );
}
