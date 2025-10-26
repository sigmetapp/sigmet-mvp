import type { AppProps } from "next/app";
import "@/styles/globals.css";
import { SiteSettingsProvider } from "@/components/SiteSettingsContext";

export default function MyApp({ Component, pageProps }: AppProps) {
  return (
    <SiteSettingsProvider>
      <Component {...pageProps} />
    </SiteSettingsProvider>
  );
}
