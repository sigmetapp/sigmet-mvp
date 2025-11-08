"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type SiteSettings = {
  site_name: string | null;
  logo_url: string | null;
  invites_only?: boolean;
  allowed_continents?: string[];
};

const Ctx = createContext<SiteSettings>({ site_name: null, logo_url: null, invites_only: false, allowed_continents: [] });

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<SiteSettings>({ site_name: null, logo_url: null, invites_only: false, allowed_continents: [] });

  useEffect(() => {
    let mounted = true;
    
    // Try to load from cache first for instant display
    const loadFromCache = (): SiteSettings | null => {
      if (typeof window === "undefined") return null;
      try {
        const cached = sessionStorage.getItem("site_settings");
        if (cached) {
          const parsed = JSON.parse(cached);
          // Cache is valid for 5 minutes
          if (parsed.timestamp && Date.now() - parsed.timestamp < 5 * 60 * 1000) {
            return parsed.data;
          }
        }
      } catch (e) {
        // Ignore cache errors
      }
      return null;
    };

    // Load from cache immediately
    const cachedSettings = loadFromCache();
    if (cachedSettings && mounted) {
      setValue(cachedSettings);
    }

    // Then fetch from database
    (async () => {
      const { data, error } = await supabase.from("site_settings").select("*").eq("id", 1).maybeSingle();
      if (!error && data && mounted) {
        const newValue = {
          site_name: data.site_name ?? null,
          logo_url: data.logo_url ?? null,
          invites_only: !!data.invites_only,
          allowed_continents: Array.isArray(data.allowed_continents) ? data.allowed_continents : [],
        };
        setValue(newValue);
        
        // Cache the settings
        if (typeof window !== "undefined") {
          try {
            sessionStorage.setItem("site_settings", JSON.stringify({
              data: newValue,
              timestamp: Date.now(),
            }));
          } catch (e) {
            // Ignore cache errors
          }
        }
      }
    })();
    
    return () => { mounted = false; };
  }, []);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSiteSettings() {
  return useContext(Ctx);
}
