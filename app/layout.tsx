import "../styles/globals.css";
import type { Metadata, Viewport } from "next";
import { SpeedInsights } from "@vercel/speed-insights/next";
import dynamic from "next/dynamic";
import SupabaseAuthSync from "@/components/SupabaseAuthSync";
import InviteAcceptanceSync from "@/components/InviteAcceptanceSync";
import Layout from "@/components/Layout";
import { SiteSettingsProvider } from "@/components/SiteSettingsContext";
import { ThemeProvider } from "@/components/ThemeProvider";

const PostHogInit = dynamic(() => import("@/components/PostHogInit"), {
  ssr: false,
});

export const metadata: Metadata = {
  title: "Settings",
  icons: {
    icon: [
      { url: '/api/favicon', type: 'image/png', sizes: '32x32' },
      { url: '/api/favicon-closed', type: 'image/png', sizes: '32x32' },
      { url: '/api/favicon.ico', sizes: 'any' },
    ],
    apple: [
      { url: '/api/favicon', type: 'image/png', sizes: '180x180' },
    ],
    shortcut: '/api/favicon.ico',
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1.0,
  maximumScale: 1.0,
  userScalable: false,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PostHogInit />
        <SupabaseAuthSync />
        <InviteAcceptanceSync />
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
