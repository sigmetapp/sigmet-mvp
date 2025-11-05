import "../styles/globals.css";
import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import PostHogInit from "@/components/PostHogInit";
import SupabaseAuthSync from "@/components/SupabaseAuthSync";
import Layout from "@/components/Layout";
import { SiteSettingsProvider } from "@/components/SiteSettingsContext";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Settings",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1.0,
  maximumScale: 5.0,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PostHogInit />
        <SupabaseAuthSync />
        <SpeedInsights />
        <ThemeProvider>
          <SiteSettingsProvider>
            <Layout>{children}</Layout>
          </SiteSettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
