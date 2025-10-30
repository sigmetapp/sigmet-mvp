import "../styles/globals.css";
import type { Metadata } from "next";
import PostHogInit from "@/components/PostHogInit";

export const metadata: Metadata = {
  title: "Settings",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <PostHogInit />
        {children}
      </body>
    </html>
  );
}
