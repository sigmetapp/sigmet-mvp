import Header from "@/components/Header";
import Footer from "@/components/Footer";

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-[100dvh] flex flex-col bg-[radial-gradient(1200px_600px_at_50%_-10%,rgba(255,255,255,0.08),transparent),linear-gradient(180deg,rgba(255,255,255,0.04),transparent)]">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
