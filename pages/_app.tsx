import type { AppProps } from "next/app";
import "@/styles/globals.css";
import Layout from "@/components/Layout";
import { SiteSettingsProvider } from "@/components/SiteSettingsContext";

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <SiteSettingsProvider>
      <Layout>
        <Component {...pageProps} />
      </Layout>
    </SiteSettingsProvider>
  );
}
