import Link from "next/link";
import { useSiteSettings } from "@/components/SiteSettingsContext";

export default function Footer() {
  const { site_name } = useSiteSettings();
  const year = new Date().getFullYear();

  return (
    <footer className="border-t border-white/10 bg-black/30">
      <div className="max-w-7xl mx-auto px-4 py-10 text-sm text-white/70">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <div className="h-8 w-8 rounded-md bg-white/10 grid place-items-center border border-white/10">S</div>
              <span className="text-white font-semibold tracking-tight">{site_name || "SIGMET"}</span>
            </div>
            <p className="text-white/50 max-w-xs">
              Build your social weight with meaningful progress and transparent reputation.
            </p>
          </div>

          <div>
            <div className="text-white/80 font-medium mb-3">Product</div>
            <ul className="space-y-2">
              <li><Link className="hover:text-white" href="/feed">Feed</Link></li>
              <li><Link className="hover:text-white" href="/profile">Profile</Link></li>
              <li><Link className="hover:text-white" href="/settings">Settings</Link></li>
            </ul>
          </div>

          <div>
            <div className="text-white/80 font-medium mb-3">Company</div>
            <ul className="space-y-2">
              <li><a className="hover:text-white" href="https://sigmet.app" target="_blank" rel="noreferrer">Website</a></li>
              <li><a className="hover:text-white" href="mailto:hello@sigmet.app">Contact</a></li>
            </ul>
          </div>

          <div>
            <div className="text-white/80 font-medium mb-3">Social</div>
            <ul className="space-y-2">
              <li><a className="hover:text-white" href="https://twitter.com" target="_blank" rel="noreferrer">Twitter</a></li>
              <li><a className="hover:text-white" href="https://github.com" target="_blank" rel="noreferrer">GitHub</a></li>
            </ul>
          </div>
        </div>

        <div className="mt-8 border-t border-white/10 pt-4 flex items-center justify-between text-xs md:text-sm">
          <span>© {year} {site_name || "SIGMET"}. All rights reserved.</span>
          <div className="flex items-center gap-3">
            <Link href="/settings" className="hover:text-white">Settings</Link>
            <a href="https://sigmet.app" target="_blank" rel="noreferrer" className="hover:text-white">sigmet.app</a>
          </div>
        </div>
      </div>
    </footer>
  );
}
