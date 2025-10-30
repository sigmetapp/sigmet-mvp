import type { AppProps } from "next/app";
import "@/styles/globals.css";
import PostHogInit from "@/components/PostHogInit";
import Layout from "@/components/Layout";
import { SiteSettingsProvider } from "@/components/SiteSettingsContext";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <>
      <PostHogInit />
      <SiteSettingsProvider>
        <Layout>
          <Component {...pageProps} />
        </Layout>
      </SiteSettingsProvider>
    </>
  );
}
