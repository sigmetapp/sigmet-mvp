import type { AppProps } from "next/app";
import "@/styles/globals.css";
import Layout from "@/components/Layout";
import { SiteSettingsProvider } from "@/components/SiteSettingsContext";
import { useEffect } from "react";
import { initAnalyticsClient, identifyUser, trackClient } from "@/lib/analytics";
import { supabase } from "@/lib/supabaseClient";

export default function MyApp({ Component, pageProps }: AppProps) {
  useEffect(() => {
    (async () => {
      await initAnalyticsClient();
      try {
        const { data } = await supabase.auth.getUser();
        const uid = data?.user?.id;
        if (uid) identifyUser(uid);
      } catch {}

      // Track push_clicked if landing from a push deep link
      try {
        const url = new URL(window.location.href);
        if (url.searchParams.get("push") === "1") {
          const notifId = url.searchParams.get("notif_id") || undefined;
          trackClient("push_clicked", { notif_id: notifId, path: url.pathname });
        }
      } catch {}
    })();
  }, []);
  return (
    <SiteSettingsProvider>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </SiteSettingsProvider>
  );
}
