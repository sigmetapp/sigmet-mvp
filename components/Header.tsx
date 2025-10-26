// components/Header.tsx
import Link from "next/link";
import Image from "next/image";
import { useSiteSettings } from "@/components/SiteSettingsContext";

export default function Header() {
  const { logo_url, site_name } = useSiteSettings();

  return (
    <header className="sticky top-0 z-50 backdrop-blur bg-black/30 border-b border-white/10">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2">
          {logo_url ? (
            /* Старайтесь держать логотип ~32–40px высотой */
            <Image src={logo_url} alt="Logo" width={36} height={36} className="rounded-md" />
          ) : (
            <div className="h-9 w-9 rounded-md bg-white/10 grid place-items-center">S</div>
          )}
          <span className="text-white/90 font-medium">{site_name || "SIGMET"}</span>
        </Link>

        <nav className="ml-auto flex items-center gap-4 text-sm">
          <Link href="/feed" className="text-white/80 hover:text-white">Feed</Link>
          <Link href="/settings" className="text-white/60 hover:text-white">Settings</Link>
        </nav>
      </div>
    </header>
  );
}
