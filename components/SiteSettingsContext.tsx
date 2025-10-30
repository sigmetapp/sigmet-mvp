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
    (async () => {
      const { data, error } = await supabase.from("site_settings").select("*").eq("id", 1).maybeSingle();
      if (!error && data && mounted) {
        setValue({
          site_name: data.site_name ?? null,
          logo_url: data.logo_url ?? null,
          invites_only: !!data.invites_only,
          allowed_continents: Array.isArray(data.allowed_continents) ? data.allowed_continents : [],
        });
      }
    })();
    return () => { mounted = false; };
  }, []);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSiteSettings() {
  return useContext(Ctx);
}
