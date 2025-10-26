export default function Footer() {
  return (
    <footer className="border-t border-white/10 bg-black/20">
      <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between text-xs md:text-sm text-white/60">
        <span>© {new Date().getFullYear()} SIGMET</span>
        <div className="flex items-center gap-3">
          <a href="https://sigmet.app" target="_blank" rel="noreferrer" className="hover:text-white">sigmet.app</a>
          <a href="/settings" className="hover:text-white">Settings</a>
        </div>
      </div>
    </footer>
  );
}
