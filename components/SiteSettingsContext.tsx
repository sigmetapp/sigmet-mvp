"use client";
import { createContext, useContext, useEffect, useState } from "react";
import { supabase } from "@/lib/supabaseClient";

export type SiteSettings = {
  site_name: string | null;
  logo_url: string | null;
};

const Ctx = createContext<SiteSettings>({ site_name: null, logo_url: null });

export function SiteSettingsProvider({ children }: { children: React.ReactNode }) {
  const [value, setValue] = useState<SiteSettings>({ site_name: null, logo_url: null });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data, error } = await supabase.from("site_settings").select("*").eq("id", 1).maybeSingle();
      if (!error && data && mounted) {
        setValue({ site_name: data.site_name ?? null, logo_url: data.logo_url ?? null });
      }
    })();
    return () => { mounted = false; };
  }, []);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSiteSettings() {
  return useContext(Ctx);
}
