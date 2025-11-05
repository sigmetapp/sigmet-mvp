"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

type EducationalInstitution = {
  id: number;
  name: string;
  type: "school" | "college" | "university";
  country?: string;
  city?: string;
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
      let queryBuilder = supabase
        .from("educational_institutions")
        .select("*")
        .ilike("name", `%${query.trim()}%`)
        .limit(20);

      if (type) {
        queryBuilder = queryBuilder.eq("type", type);
      }

      const { data, error } = await queryBuilder;

      if (cancelled) return;

      if (!error && data) {
        setInstitutions(data);
      }
      setLoading(false);
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

  function select(institution: EducationalInstitution) {
    setQuery(institution.name);
    setOpen(false);
    setSelectedInstitution(institution);
    onChange(institution.id, institution);
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
            className="px-3 py-2 text-sm text-white/60 hover:text-white"
          >
            ✕
          </button>
        )}
      </div>
      {open && query.trim().length >= 2 && (
        <div className="absolute z-10 mt-1 w-full max-h-72 overflow-auto rounded-md bg-[#0b0b0b] border border-white/10 shadow-lg">
          {loading ? (
            <div className="px-3 py-2 text-sm text-white/60">Searching...</div>
          ) : institutions.length === 0 ? (
            <div className="px-3 py-2 text-sm text-white/60">
              No results found. The institution will be created when you save.
            </div>
          ) : (
            <>
              {institutions.map((inst) => (
                <button
                  key={inst.id}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-white/5"
                  onClick={() => select(inst)}
                >
                  <div className="font-medium">{inst.name}</div>
                  <div className="text-xs text-white/60 capitalize">
                    {inst.type}
                    {inst.city && ` • ${inst.city}`}
                    {inst.country && ` • ${inst.country}`}
                  </div>
                </button>
              ))}
            </>
          )}
        </div>
      )}
    </div>
  );
}
