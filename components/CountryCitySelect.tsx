"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useTheme } from "./ThemeProvider";

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
  const { theme } = useTheme();
  const isLight = theme === "light";
  const initial = useMemo(() => parseCombined(value), [value]);
  const initialQuery = useMemo(() => combine(initial.city, initial.country), [initial]);
  const [query, setQuery] = useState<string>(initialQuery);
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const hasUserTyped = useRef(false); // Track if user has actually typed (not just clicked)

  // Update query when value prop changes externally
  useEffect(() => {
    const newInitial = parseCombined(value);
    const newInitialQuery = combine(newInitial.city, newInitial.country);
    if (newInitialQuery !== initialQuery) {
      setQuery(newInitialQuery);
      hasUserTyped.current = false;
    }
  }, [value, initialQuery]);

  // Search cities via API
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [loadingCities, setLoadingCities] = useState(false);
  
  useEffect(() => {
    // Only search when:
    // 1. Dropdown is open
    // 2. User has typed something (query has at least 1 character)
    if (!open || query.trim().length === 0) {
      setSuggestions([]);
      setLoadingCities(false);
      return;
    }
    
    // Debounce search requests
    let cancelled = false;
    setLoadingCities(true);
    
    const timeoutId = setTimeout(async () => {
      try {
        const searchParams = new URLSearchParams({
          query: query.trim(),
        });
        
        const response = await fetch(`/api/cities/search?${searchParams}`);
        if (cancelled) return;
        
        if (response.ok) {
          const { results } = await response.json();
          if (cancelled) return;
          setSuggestions(results || []);
        } else {
          console.error('Error searching cities:', response.statusText);
          if (!cancelled) {
            setSuggestions([]);
          }
        }
      } catch (error) {
        console.error('Error searching cities:', error);
        if (!cancelled) {
          setSuggestions([]);
        }
      } finally {
        if (!cancelled) {
          setLoadingCities(false);
        }
      }
    }, 300); // 300ms debounce
    
    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
    };
  }, [open, query]);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

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
          <div className={`absolute z-10 mt-1 w-full max-h-72 overflow-auto rounded-md border shadow-lg ${
            isLight 
              ? "bg-white border-gray-200" 
              : "bg-[#0b0b0b] border-white/10"
          }`}>
            {query.trim().length === 0 ? (
              <div className={`px-3 py-2 text-sm ${isLight ? "text-gray-500" : "text-white/60"}`}>Start typing to search cities…</div>
            ) : !hasUserTyped.current && query === initialQuery ? (
              <div className={`px-3 py-2 text-sm ${isLight ? "text-gray-500" : "text-white/60"}`}>Start typing to search cities…</div>
            ) : loadingCities ? (
              <div className={`px-3 py-2 text-sm ${isLight ? "text-gray-500" : "text-white/60"}`}>Searching cities…</div>
            ) : suggestions.length === 0 ? (
              <div className={`px-3 py-2 text-sm ${isLight ? "text-gray-500" : "text-white/60"}`}>No results</div>
            ) : (
              suggestions.map((s, idx) => (
                <button
                  key={`${s.city}-${s.countryCode}-${idx}`}
                  type="button"
                  className={`w-full text-left px-3 py-2 text-sm ${
                    isLight 
                      ? "text-gray-900 hover:bg-gray-100" 
                      : "text-white hover:bg-white/5"
                  }`}
                  onClick={() => select(s)}
                >
                  {s.city}, <span className={isLight ? "text-gray-600" : "text-white/80"}>{s.country}</span>
                </button>
              ))
            )}
          </div>
        )}
      </div>
    </div>
  );
}
