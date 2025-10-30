import "../styles/globals.css";
import type { Metadata } from "next";
import PostHogInit from "@/components/PostHogInit";
import SupabaseAuthSync from "@/components/SupabaseAuthSync";
import Layout from "@/components/Layout";
import { SiteSettingsProvider } from "@/components/SiteSettingsContext";
import { ThemeProvider } from "@/components/ThemeProvider";

export const metadata: Metadata = {
  title: "Settings",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PostHogInit />
        <SupabaseAuthSync />
        <ThemeProvider>
          <SiteSettingsProvider>
            <Layout>{children}</Layout>
          </SiteSettingsProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
