import type { AppProps } from "next/app";
import "@/styles/globals.css";
import PostHogInit from "@/components/PostHogInit";
import Layout from "@/components/Layout";
import { SiteSettingsProvider } from "@/components/SiteSettingsContext";
import SupabaseAuthSync from "@/components/SupabaseAuthSync";
import { ThemeProvider } from "@/components/ThemeProvider";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <PostHogInit />
      <SupabaseAuthSync />
      <ThemeProvider>
        <SiteSettingsProvider>
          <Layout>
            <Component {...pageProps} />
          </Layout>
        </SiteSettingsProvider>
      </ThemeProvider>
    </>
  );
}
