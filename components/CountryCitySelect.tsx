"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Country, City } from "country-state-city";

export type CountryCityValue = {
  countryName?: string;
  countryCode?: string;
  cityName?: string;
};

function parseCombined(value?: string): CountryCityValue {
  if (!value) return {};
  const parts = value.split(",").map((p) => p.trim()).filter(Boolean);
  if (parts.length === 0) return {};
  if (parts.length === 1) {
    return { countryName: parts[0] };
  }
  const cityName = parts.slice(0, parts.length - 1).join(", ");
  const countryName = parts[parts.length - 1];
  return { cityName, countryName };
}

function toCombined(v: CountryCityValue): string {
  const pieces: string[] = [];
  if (v.cityName) pieces.push(v.cityName);
  if (v.countryName) pieces.push(v.countryName);
  return pieces.join(", ");
}

export default function CountryCitySelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (combined: string) => void;
}) {
  const initial = useMemo(() => parseCombined(value), [value]);
  const countries = useMemo(() => Country.getAllCountries(), []);
  const [countryQuery, setCountryQuery] = useState<string>(initial.countryName || "");
  const [cityQuery, setCityQuery] = useState<string>(initial.cityName || "");
  const [selectedCountryCode, setSelectedCountryCode] = useState<string | undefined>(undefined);
  const [countryOpen, setCountryOpen] = useState(false);
  const [cityOpen, setCityOpen] = useState(false);

  const containerRef = useRef<HTMLDivElement | null>(null);

  // Initialize selected country code from name (best-effort)
  useEffect(() => {
    if (!initial.countryName) return;
    const match = countries.find(
      (c) => c.name.toLowerCase() === initial.countryName!.toLowerCase()
    );
    if (match) {
      setSelectedCountryCode(match.isoCode);
    }
    // cityQuery set from initial already
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [countries]);

  // Close dropdowns on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setCountryOpen(false);
        setCityOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  const filteredCountries = useMemo(() => {
    const q = countryQuery.trim().toLowerCase();
    if (!q) return countries.slice(0, 20);
    return countries
      .filter(
        (c) =>
          c.name.toLowerCase().includes(q) ||
          c.isoCode.toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [countries, countryQuery]);

  const cities = useMemo(() => {
    if (!selectedCountryCode) return [] as ReturnType<typeof City.getCitiesOfCountry>;
    return City.getCitiesOfCountry(selectedCountryCode) || [];
  }, [selectedCountryCode]);

  const filteredCities = useMemo(() => {
    const q = cityQuery.trim().toLowerCase();
    if (!q) return cities.slice(0, 20);
    return cities
      .filter((c) => c.name.toLowerCase().includes(q))
      .slice(0, 20);
  }, [cities, cityQuery]);

  function selectCountry(code: string, name: string) {
    setSelectedCountryCode(code);
    setCountryQuery(name);
    setCountryOpen(false);
    // Reset city when country changes
    setCityQuery("");
    emitChange(name, "");
  }

  function selectCity(name: string) {
    setCityQuery(name);
    setCityOpen(false);
    emitChange(countryQuery, name);
  }

  function emitChange(countryName: string, cityName: string) {
    const combined = toCombined({ countryName, cityName });
    onChange(combined);
  }

  return (
    <div ref={containerRef} className="grid gap-3">
      <div className="grid gap-1">
        <label className="label">Country</label>
        <div className="relative">
          <input
            className="input"
            value={countryQuery}
            onChange={(e) => {
              setCountryQuery(e.target.value);
              setSelectedCountryCode(undefined);
              setCountryOpen(true);
            }}
            onFocus={() => setCountryOpen(true)}
            placeholder="Search country"
          />
          {countryOpen && (
            <div className="absolute z-10 mt-1 w-full max-h-64 overflow-auto rounded-md bg-[#0b0b0b] border border-white/10 shadow-lg">
              {filteredCountries.length === 0 && (
                <div className="px-3 py-2 text-sm text-white/60">No results</div>
              )}
              {filteredCountries.map((c) => (
                <button
                  key={c.isoCode}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-white/5"
                  onClick={() => selectCountry(c.isoCode, c.name)}
                >
                  {c.name} <span className="text-white/40">({c.isoCode})</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      <div className="grid gap-1">
        <label className="label">City</label>
        <div className="relative">
          <input
            className="input"
            value={cityQuery}
            onChange={(e) => {
              setCityQuery(e.target.value);
              setCityOpen(true);
            }}
            onFocus={() => setCityOpen(true)}
            placeholder={selectedCountryCode ? "Search city" : "Select country first"}
            disabled={!selectedCountryCode}
          />
          {cityOpen && selectedCountryCode && (
            <div className="absolute z-10 mt-1 w-full max-h-64 overflow-auto rounded-md bg-[#0b0b0b] border border-white/10 shadow-lg">
              {filteredCities.length === 0 && (
                <div className="px-3 py-2 text-sm text-white/60">No results</div>
              )}
              {filteredCities.map((c) => (
                <button
                  key={`${c.name}-${c.stateCode}`}
                  type="button"
                  className="w-full text-left px-3 py-2 text-sm hover:bg-white/5"
                  onClick={() => selectCity(c.name)}
                >
                  {c.name}
                  {c.stateCode ? (
                    <span className="text-white/40">, {c.stateCode}</span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
