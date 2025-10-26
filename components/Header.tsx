import Link from "next/link";
import Image from "next/image";
import { useSiteSettings } from "@/components/SiteSettingsContext";
import { useRouter } from "next/router";

const navLinks = [
  { href: "/", label: "Home" },
  { href: "/feed", label: "Feed" },
  { href: "/profile", label: "Profile" },
  { href: "/settings", label: "Settings" }, // страница настроек, которую мы добавили
];

export default function Header() {
  const { logo_url, site_name } = useSiteSettings();
  const router = useRouter();

  return (
    <header className="sticky top-0 z-50 backdrop-blur bg-black/30 border-b border-white/10">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center gap-3">
        <Link href="/" className="flex items-center gap-2">
          {logo_url ? (
            <Image src={logo_url} alt="Logo" width={36} height={36} className="rounded-md" />
          ) : (
            <div className="h-9 w-9 rounded-md bg-white/10 grid place-items-center">S</div>
          )}
          <span className="text-white/90 font-medium">{site_name || "SIGMET"}</span>
        </Link>

        <nav className="ml-auto flex items-center gap-1">
          {navLinks.map((l) => {
            const active = router.pathname === l.href;
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`px-3 py-1.5 rounded-lg text-sm transition ${
                  active
                    ? "bg-white text-black"
                    : "text-white/75 hover:text-white hover:bg-white/10"
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
      </div>
    </header>
  );
}

