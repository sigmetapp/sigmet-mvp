"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";
import { useTheme } from "./ThemeProvider";

type EducationalInstitution = {
  id?: number;
  name: string;
  type: "school" | "college" | "university";
  country?: string;
  city?: string;
  source?: "local" | "external";
};

type EducationalInstitutionSelectProps = {
  value: number | null;
  onChange: (id: number | null, institution?: EducationalInstitution) => void;
  onQueryChange?: (query: string) => void;
  type?: "school" | "college" | "university" | null;
};

export default function EducationalInstitutionSelect({
  value,
  onChange,
  onQueryChange,
  type,
}: EducationalInstitutionSelectProps) {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [query, setQuery] = useState<string>("");
  const [open, setOpen] = useState(false);
  const [institutions, setInstitutions] = useState<EducationalInstitution[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedInstitution, setSelectedInstitution] = useState<EducationalInstitution | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Load selected institution when value changes
  useEffect(() => {
    if (value && !selectedInstitution) {
      (async () => {
        const { data } = await supabase
          .from("educational_institutions")
          .select("*")
          .eq("id", value)
          .maybeSingle();
        if (data) {
          setSelectedInstitution(data);
          setQuery(data.name);
        }
      })();
    } else if (!value) {
      setSelectedInstitution(null);
      setQuery("");
    }
  }, [value, selectedInstitution]);

  // Search institutions
  useEffect(() => {
    if (!open || query.trim().length < 2) {
      setInstitutions([]);
      return;
    }

    let cancelled = false;
    setLoading(true);

    (async () => {
      try {
        // Search via API which includes both local and external sources
        const searchParams = new URLSearchParams({
          query: query.trim(),
          ...(type && { type }),
        });

        const response = await fetch(`/api/educational-institutions/search?${searchParams}`);
        if (cancelled) return;

        if (response.ok) {
          const { results } = await response.json();
          if (cancelled) return;
          setInstitutions(results || []);
        } else {
          // Fallback to local search only
          let queryBuilder = supabase
            .from("educational_institutions")
            .select("*")
            .ilike("name", `%${query.trim()}%`)
            .limit(20);

          if (type) {
            queryBuilder = queryBuilder.eq("type", type);
          }

          const { data: localData, error: localError } = await queryBuilder;
          if (cancelled) return;

          if (!localError && localData) {
            setInstitutions(localData.map((inst) => ({ ...inst, source: "local" as const })));
          }
        }
      } catch (searchError) {
        console.error("Error searching institutions:", searchError);
        // Fallback to local search only
        let queryBuilder = supabase
          .from("educational_institutions")
          .select("*")
          .ilike("name", `%${query.trim()}%`)
          .limit(20);

        if (type) {
          queryBuilder = queryBuilder.eq("type", type);
        }

        const { data: fallbackData, error: fallbackError } = await queryBuilder;
        if (cancelled) return;

        if (!fallbackError && fallbackData) {
          setInstitutions(fallbackData.map((inst) => ({ ...inst, source: "local" as const })));
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [query, open, type]);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  function select(institution: EducationalInstitution | null) {
    if (!institution) {
      // User wants to use custom name
      setOpen(false);
      // Pass null ID but keep the query as the name
      onChange(null, { name: query.trim(), type: type || 'university' } as EducationalInstitution);
      return;
    }
    
    setQuery(institution.name);
    setOpen(false);
    setSelectedInstitution(institution);
    onChange(institution.id || null, institution);
  }

  function clear() {
    setQuery("");
    setSelectedInstitution(null);
    onChange(null);
    onQueryChange?.("");
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="flex gap-2">
        <input
          className="input flex-1"
          value={query}
          onChange={(e) => {
            const newQuery = e.target.value;
            setQuery(newQuery);
            setOpen(true);
            onQueryChange?.(newQuery);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Search for institution..."
        />
        {selectedInstitution && (
          <button
            type="button"
            onClick={clear}
            className={`px-3 py-2 text-sm ${
              isLight ? "text-gray-500 hover:text-gray-700" : "text-white/60 hover:text-white"
            }`}
          >
            ✕
          </button>
        )}
      </div>
      {open && query.trim().length >= 2 && (
        <div className={`absolute z-10 mt-1 w-full max-h-72 overflow-auto rounded-md border shadow-lg ${
          isLight 
            ? "bg-white border-gray-200" 
            : "bg-[#0b0b0b] border-white/10"
        }`}>
          {loading ? (
            <div className={`px-3 py-2 text-sm ${isLight ? "text-gray-500" : "text-white/60"}`}>Searching...</div>
          ) : (
            <>
              {institutions.length > 0 && (
                <>
                  {institutions.map((inst, idx) => (
                    <button
                      key={inst.id || `external-${idx}`}
                      type="button"
                      className={`w-full text-left px-3 py-2 text-sm ${
                        isLight 
                          ? "text-gray-900 hover:bg-gray-100" 
                          : "text-white hover:bg-white/5"
                      }`}
                      onClick={() => select(inst)}
                    >
                      <div className="font-medium">{inst.name}</div>
                      <div className={`text-xs capitalize ${
                        isLight ? "text-gray-600" : "text-white/60"
                      }`}>
                        {inst.type}
                        {inst.city && ` • ${inst.city}`}
                        {inst.country && ` • ${inst.country}`}
                        {inst.source === "external" && (
                          <span className="ml-1 text-primary-blue">(external)</span>
                        )}
                      </div>
                    </button>
                  ))}
                  <div className={`border-t my-1 ${
                    isLight ? "border-gray-200" : "border-white/10"
                  }`}></div>
                </>
              )}
              {/* Always show option to use custom name */}
              <button
                type="button"
                className={`w-full text-left px-3 py-2 text-sm text-primary-blue font-medium ${
                  isLight ? "hover:bg-gray-100" : "hover:bg-white/5"
                }`}
                onClick={() => select(null)}
              >
                Use "{query}" as custom institution name
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
