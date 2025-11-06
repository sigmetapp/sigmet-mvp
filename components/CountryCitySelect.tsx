"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Country, City } from "country-state-city";

type Suggestion = { city: string; countryCode: string; country: string };

function parseCombined(value?: string): { city?: string; country?: string } {
  if (!value) return {};
  const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) return { city: parts[0] };
  return { city: parts.slice(0, -1).join(", "), country: parts[parts.length - 1] };
}

function combine(city?: string, country?: string) {
  return [city, country].filter(Boolean).join(", ");
}

export default function CountryCitySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (combined: string) => void;
}) {
  const initial = useMemo(() => parseCombined(value), [value]);
  const [query, setQuery] = useState<string>(combine(initial.city, initial.country));
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const countries = useMemo(() => Country.getAllCountries(), []);
  const countryNameByIso = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of countries) map.set(c.isoCode, c.name);
    return map;
  }, [countries]);

  // Build a lazy cache of all cities once (acceptable size for MVP)
  // Only load when user starts typing to avoid blocking UI on open
  const [allCities, setAllCities] = useState<Suggestion[] | null>(null);
  const [loadingCities, setLoadingCities] = useState(false);
  useEffect(() => {
    // Only load cities when user has typed at least 1 character to avoid blocking on open
    if (!open || allCities || loadingCities || query.trim().length === 0) return;
    
    // Load cities asynchronously to prevent UI freeze
    setLoadingCities(true);
    
    // Use Promise to make it truly async and non-blocking
    Promise.resolve().then(() => {
      try {
        const list = City.getAllCities()?.slice(0) || [];
        const suggestions: Suggestion[] = list
          .map((c) => ({
            city: c.name,
            countryCode: c.countryCode,
            country: countryNameByIso.get(c.countryCode) || c.countryCode,
          }))
          .filter((v, i, arr) => arr.findIndex((x) => x.city === v.city && x.countryCode === v.countryCode) === i);
        setAllCities(suggestions);
      } catch (error) {
        console.error('Error loading cities:', error);
        setAllCities([]);
      } finally {
        setLoadingCities(false);
      }
    });
  }, [open, allCities, countryNameByIso, loadingCities, query]);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const filtered: Suggestion[] = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!allCities || q.length === 0) return [];
    const results = allCities.filter(
      (s) => s.city.toLowerCase().includes(q) || s.country.toLowerCase().includes(q)
    );
    results.sort((a, b) => {
      const aStarts = a.city.toLowerCase().startsWith(q) ? 0 : 1;
      const bStarts = b.city.toLowerCase().startsWith(q) ? 0 : 1;
      if (aStarts !== bStarts) return aStarts - bStarts;
      return a.city.localeCompare(b.city);
    });
    return results.slice(0, 30);
  }, [allCities, query]);

  function select(s: Suggestion) {
    const combined = combine(s.city, s.country);
    setQuery(combined);
    setOpen(false);
    onChange(combined);
  }

  return (
    <div ref={containerRef} className="grid gap-1">
      <div className="relative">
        <input
          className="input"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Type your city…"
        />
        {open && (
          <div className="absolute z-10 mt-1 w-full max-h-72 overflow-auto rounded-md bg-[#0b0b0b] border border-white/10 shadow-lg">
            {query.trim().length === 0 ? (
              <div className="px-3 py-2 text-sm text-white/60">Start typing to search cities…</div>
            ) : loadingCities || !allCities ? (
              <div className="px-3 py-2 text-sm text-white/60">Loading cities…</div>
            ) : filtered.length === 0 ? (
              <div className="px-3 py-2 text-sm text-white/60">No results</div>
            ) : (
              filtered.map((s, idx) => (
                <button
                  key={`${s.city}-${s.countryCode}-${idx}`}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-white/5"
                  onClick={() => select(s)}
                >
                  {s.city}, <span className="text-white/80">{s.country}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
