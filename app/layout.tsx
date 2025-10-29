import "@/styles/globals.css";
import type { Metadata } from "next";
import React from "react";
import Layout from "@/components/Layout";
import { SiteSettingsProvider } from "@/components/SiteSettingsContext";

export const metadata: Metadata = {
  title: "App",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>
        <SiteSettingsProvider>
          <Layout>{children}</Layout>
        </SiteSettingsProvider>
      </body>
    </html>
  );
}
