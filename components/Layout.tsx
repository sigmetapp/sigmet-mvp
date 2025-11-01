"use client";
import Header from "@/components/Header";
import Footer from "@/components/Footer";
import { useTheme } from "@/components/ThemeProvider";

export default function Layout({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme();
  const isLight = theme === "light";

  return (
    <div className={`relative min-h-[100dvh] ${isLight ? "bg-telegram-gradient" : "bg-sigmet"}`}>
      {/* background overlay pattern */}
      <div 
        aria-hidden 
        className={`absolute inset-0 z-0 ${isLight ? "bg-dot-grid opacity-10" : "bg-dot-grid opacity-20"}`}
      />

      {/* content */}
      <div className="relative z-10 min-h-[100dvh] flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </div>
  );
}
