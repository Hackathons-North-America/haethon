"use client";

import { useEffect, useId, useRef, useState } from "react";

import type { CitySuggestion } from "@/lib/hackathons/city-lookup";

/**
 * City autocomplete against our own GeoNames-backed /api/cities/search — no
 * external geocoding API. Renders the visible city input (name="city") plus
 * hidden latitude/longitude/countryCode inputs that are filled when a
 * suggestion is picked and cleared again if the text is edited afterwards,
 * so free-typed cities still submit (coordinates then resolve server-side).
 */
export function CityCombobox({
  id,
  required = false,
  defaultValue = "",
  inputClassName,
  onCitySelect,
}: {
  id: string;
  required?: boolean;
  defaultValue?: string;
  inputClassName: string;
  onCitySelect?: (city: CitySuggestion) => void;
}) {
  const [query, setQuery] = useState(defaultValue);
  const [selected, setSelected] = useState<CitySuggestion | null>(null);
  const [suggestions, setSuggestions] = useState<CitySuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [highlighted, setHighlighted] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  const selectedName = selected?.name;

  useEffect(() => {
    const term = query.trim();

    // Nothing to look up for short queries or right after a pick (the pick
    // handler set the query to the selected city's name).
    if (term.length < 2 || term === selectedName?.trim()) {
      return;
    }

    const controller = new AbortController();
    const timeout = setTimeout(async () => {
      try {
        const response = await fetch(`/api/cities/search?q=${encodeURIComponent(term)}`, {
          signal: controller.signal,
        });

        if (!response.ok) {
          return;
        }

        const body = (await response.json()) as { data: CitySuggestion[] };
        setSuggestions(body.data);
        setHighlighted(0);
        setOpen(body.data.length > 0);
      } catch {
        // Aborted or offline — the field still works as plain text.
      }
    }, 250);

    return () => {
      controller.abort();
      clearTimeout(timeout);
    };
  }, [query, selectedName]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!containerRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    }

    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, []);

  function pick(city: CitySuggestion) {
    setSelected(city);
    setQuery(city.name);
    setSuggestions([]);
    setOpen(false);
    onCitySelect?.(city);
  }

  function handleKeyDown(event: React.KeyboardEvent<HTMLInputElement>) {
    if (!open) {
      return;
    }

    if (event.key === "ArrowDown") {
      event.preventDefault();
      setHighlighted((current) => Math.min(current + 1, suggestions.length - 1));
    } else if (event.key === "ArrowUp") {
      event.preventDefault();
      setHighlighted((current) => Math.max(current - 1, 0));
    } else if (event.key === "Enter" && suggestions[highlighted]) {
      event.preventDefault();
      pick(suggestions[highlighted]);
    } else if (event.key === "Escape") {
      setOpen(false);
    }
  }

  return (
    <div className="relative" ref={containerRef}>
      <input
        aria-autocomplete="list"
        aria-controls={listboxId}
        aria-expanded={open}
        autoComplete="off"
        className={inputClassName}
        id={id}
        name="city"
        onChange={(event) => {
          const value = event.target.value;
          setQuery(value);

          // Typing after a pick invalidates the stored coordinates.
          if (selected && value !== selected.name) {
            setSelected(null);
          }

          if (value.trim().length < 2) {
            setSuggestions([]);
            setOpen(false);
          }
        }}
        onFocus={() => setOpen(suggestions.length > 0)}
        onKeyDown={handleKeyDown}
        required={required}
        role="combobox"
        value={query}
      />
      <input name="latitude" type="hidden" value={selected ? String(selected.latitude) : ""} />
      <input name="longitude" type="hidden" value={selected ? String(selected.longitude) : ""} />
      <input name="countryCode" type="hidden" value={selected?.countryCode ?? ""} />
      {open ? (
        <ul
          className="absolute left-0 right-0 top-[calc(100%+0.35rem)] z-50 max-h-72 overflow-y-auto rounded-xl border border-navy/10 dark:border-white/10 bg-white dark:bg-[#1b1b1b] py-1 shadow-[0_18px_45px_rgba(0,0,0,0.18)]"
          id={listboxId}
          role="listbox"
        >
          {suggestions.map((city, index) => (
            <li key={city.id} role="option" aria-selected={index === highlighted}>
              <button
                className={`flex w-full flex-col px-4 py-2.5 text-left transition-colors ${
                  index === highlighted ? "bg-ivory dark:bg-white/10" : "hover:bg-ivory dark:hover:bg-white/10"
                }`}
                onClick={() => pick(city)}
                onMouseEnter={() => setHighlighted(index)}
                type="button"
              >
                <span className="text-sm font-semibold text-navy dark:text-wheat">{city.name}</span>
                <span className="text-xs text-navy/55 dark:text-wheat/55">
                  {[city.region, city.country].filter(Boolean).join(", ")}
                </span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
