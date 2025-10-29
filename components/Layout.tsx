import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-[100dvh] bg-sigmet">
      {/* background overlay pattern */}
      <div aria-hidden className="absolute inset-0 z-0 bg-dot-grid opacity-20" />

      {/* content */}
      <div className="relative z-10 min-h-[100dvh] flex flex-col">
        <Header />
        <main className="flex-1">{children}</main>
        <Footer />
      </div>
    </div>
  );
}
