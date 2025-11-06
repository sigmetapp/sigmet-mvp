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
  const initialQuery = useMemo(() => combine(initial.city, initial.country), [initial]);
  const [query, setQuery] = useState<string>(initialQuery);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasUserTyped = useRef(false); // Track if user has actually typed (not just clicked)

  const countries = useMemo(() => Country.getAllCountries(), []);
  const countryNameByIso = useMemo(() => {
    const map = new Map<string, string>();
    for (const c of countries) map.set(c.isoCode, c.name);
    return map;
  }, [countries]);

  // Update query when value prop changes externally
  useEffect(() => {
    const newInitial = parseCombined(value);
    const newInitialQuery = combine(newInitial.city, newInitial.country);
    if (newInitialQuery !== initialQuery) {
      setQuery(newInitialQuery);
      hasUserTyped.current = false;
    }
  }, [value, initialQuery]);

  // Build a lazy cache of all cities once (acceptable size for MVP)
  // Only load when user actually starts typing (not just clicking on filled field)
  const [allCities, setAllCities] = useState<Suggestion[] | null>(null);
  const [loadingCities, setLoadingCities] = useState(false);
  
  useEffect(() => {
    // Only load cities when:
    // 1. Dropdown is open
    // 2. Cities haven't been loaded yet
    // 3. Not currently loading
    // 4. User has actually typed something (query differs from initial)
    // 5. Query has at least 1 character
    if (!open || allCities || loadingCities || !hasUserTyped.current || query.trim().length === 0) return;
    
    // Load cities asynchronously to prevent UI freeze
    setLoadingCities(true);
    
    // Use setTimeout to defer to next event loop tick, preventing UI freeze
    const timeoutId = setTimeout(() => {
      try {
        // Use requestIdleCallback if available for better performance
        const loadCities = () => {
          try {
            const list = City.getAllCities() || [];
            // Use Set for O(1) duplicate checking instead of O(n) findIndex
            const seen = new Set<string>();
            const suggestions: Suggestion[] = [];
            
            for (const c of list) {
              const key = `${c.name}-${c.countryCode}`;
              if (!seen.has(key)) {
                seen.add(key);
                suggestions.push({
                  city: c.name,
                  countryCode: c.countryCode,
                  country: countryNameByIso.get(c.countryCode) || c.countryCode,
                });
              }
            }
            
            setAllCities(suggestions);
          } catch (error) {
            console.error('Error loading cities:', error);
            setAllCities([]);
          } finally {
            setLoadingCities(false);
          }
        };

        // Use requestIdleCallback if available, otherwise use setTimeout
        if (typeof window !== 'undefined' && 'requestIdleCallback' in window) {
          (window as any).requestIdleCallback(loadCities, { timeout: 2000 });
        } else {
          setTimeout(loadCities, 0);
        }
      } catch (error) {
        console.error('Error setting up city loading:', error);
        setLoadingCities(false);
      }
    }, 0);
    
    return () => clearTimeout(timeoutId);
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
    hasUserTyped.current = false; // Reset typing flag after selection
    onChange(combined);
  }

  return (
    <div ref={containerRef} className="grid gap-1">
      <div className="relative">
        <input
          className="input"
          value={query}
          onChange={(e) => {
            const newQuery = e.target.value;
            setQuery(newQuery);
            // Mark that user has typed if query differs from initial
            if (newQuery !== initialQuery) {
              hasUserTyped.current = true;
            }
            setOpen(true);
          }}
          onFocus={() => {
            setOpen(true);
            // Reset typing flag when focusing on field with initial value
            if (query === initialQuery) {
              hasUserTyped.current = false;
            }
          }}
          placeholder="Type your city…"
        />
        {open && (
          <div className="absolute z-10 mt-1 w-full max-h-72 overflow-auto rounded-md bg-[#0b0b0b] border border-white/10 shadow-lg">
            {query.trim().length === 0 ? (
              <div className="px-3 py-2 text-sm text-white/60">Start typing to search cities…</div>
            ) : !hasUserTyped.current && query === initialQuery ? (
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
