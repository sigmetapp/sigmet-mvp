"use client";

import { useEffect, useRef, useState } from "react";
import { Search, User, MapPin, FileText, X } from "lucide-react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";
import { useRouter } from "next/navigation";

interface SearchResult {
  people: Array<{
    user_id: string;
    username: string | null;
    full_name: string | null;
    avatar_url: string | null;
    country: string | null;
  }>;
  posts: Array<{
    id: number;
    text: string;
    author_id: string;
    created_at: string;
    profiles: {
      username: string | null;
      full_name: string | null;
      avatar_url: string | null;
    } | null;
  }>;
  cities: Array<{
    city: string;
    count: number;
  }>;
  countries: Array<{
    country: string;
    count: number;
  }>;
}

export default function SearchInput({ className = "" }: { className?: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const { theme } = useTheme();
  const router = useRouter();
  const isLight = theme === "light";

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (!containerRef.current) return;
      if (!containerRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, []);

  // Search debounce
  useEffect(() => {
    if (!query || query.length < 2) {
      setResults(null);
      setIsOpen(false);
      return;
    }

    const timeoutId = setTimeout(async () => {
      setIsLoading(true);
      try {
        const response = await fetch(`/api/search?q=${encodeURIComponent(query)}&limit=5`);
        if (response.ok) {
          const data = await response.json();
          setResults(data);
          setIsOpen(true);
        }
      } catch (error) {
        console.error("Search error:", error);
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => clearTimeout(timeoutId);
  }, [query]);

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter" && query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      setIsOpen(false);
      setQuery("");
    } else if (e.key === "Escape") {
      setIsOpen(false);
    }
  }

  function handleClear() {
    setQuery("");
    setResults(null);
    setIsOpen(false);
    inputRef.current?.focus();
  }

  const hasResults = results && (
    results.people.length > 0 ||
    results.posts.length > 0 ||
    results.cities.length > 0 ||
    results.countries.length > 0
  );

  return (
    <div ref={containerRef} className={`relative flex-1 max-w-md ${className}`}>
      <div className="relative">
        <Search
          className={`absolute left-3 top-1/2 -translate-y-1/2 ${
            isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"
          }`}
          size={18}
        />
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onFocus={() => query.length >= 2 && setIsOpen(true)}
          onKeyDown={handleKeyDown}
          placeholder="Search people, posts, cities..."
          className={`w-full pl-10 pr-10 py-2 rounded-lg text-sm border transition ${
            isLight
              ? "bg-white/90 border-telegram-blue/20 text-telegram-text placeholder:text-telegram-text-secondary focus:border-telegram-blue focus:outline-none focus:ring-2 focus:ring-telegram-blue/20"
              : "bg-[rgba(255,255,255,0.05)] border-telegram-blue/30 text-telegram-text placeholder:text-telegram-text-secondary focus:border-telegram-blue focus:outline-none focus:ring-2 focus:ring-telegram-blue/30"
          }`}
        />
        {query && (
          <button
            onClick={handleClear}
            className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded ${
              isLight
                ? "text-telegram-text-secondary hover:bg-telegram-blue/10"
                : "text-telegram-text-secondary hover:bg-white/10"
            }`}
            aria-label="Clear search"
          >
            <X size={16} />
          </button>
        )}
      </div>

      {/* Quick Results Dropdown */}
      {isOpen && query.length >= 2 && (
        <div
          className={`absolute z-50 mt-2 w-full rounded-lg border shadow-lg overflow-hidden ${
            isLight
              ? "bg-white border-telegram-blue/20"
              : "bg-[rgba(15,22,35,0.95)] backdrop-blur-md border-telegram-blue/30"
          }`}
        >
          {isLoading ? (
            <div className={`px-4 py-3 text-sm ${
              isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"
            }`}>
              Searching...
            </div>
          ) : !hasResults ? (
            <div className={`px-4 py-3 text-sm ${
              isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"
            }`}>
              No results found
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              {/* People */}
              {results.people.length > 0 && (
                <div>
                  <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider ${
                    isLight ? "text-telegram-text-secondary bg-telegram-blue/5" : "text-telegram-text-secondary bg-telegram-blue/10"
                  }`}>
                    People
                  </div>
                  {results.people.map((person) => (
                    <Link
                      key={person.user_id}
                      href={`/u/${person.username || person.user_id}`}
                      onClick={() => {
                        setIsOpen(false);
                        setQuery("");
                      }}
                      className={`flex items-center gap-3 px-4 py-2 hover:bg-opacity-50 transition ${
                        isLight ? "hover:bg-telegram-blue/10" : "hover:bg-white/5"
                      }`}
                    >
                      {person.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={person.avatar_url}
                          alt={person.full_name || person.username || "User"}
                          className="w-8 h-8 rounded-full"
                        />
                      ) : (
                        <div className={`w-8 h-8 rounded-full grid place-items-center ${
                          isLight ? "bg-telegram-blue/10 text-telegram-blue" : "bg-telegram-blue/20 text-telegram-blue-light"
                        }`}>
                          <User size={16} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${
                          isLight ? "text-telegram-text" : "text-telegram-text"
                        }`}>
                          {person.full_name || person.username || "Anonymous"}
                        </div>
                        {person.username && person.full_name && (
                          <div className={`text-xs truncate ${
                            isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"
                          }`}>
                            @{person.username}
                          </div>
                        )}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Posts */}
              {results.posts.length > 0 && (
                <div>
                  <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider ${
                    isLight ? "text-telegram-text-secondary bg-telegram-blue/5" : "text-telegram-text-secondary bg-telegram-blue/10"
                  }`}>
                    Posts
                  </div>
                  {results.posts.map((post) => (
                    <Link
                      key={post.id}
                      href={`/post/${post.id}`}
                      onClick={() => {
                        setIsOpen(false);
                        setQuery("");
                      }}
                      className={`block px-4 py-2 hover:bg-opacity-50 transition ${
                        isLight ? "hover:bg-telegram-blue/10" : "hover:bg-white/5"
                      }`}
                    >
                      <div className={`text-sm line-clamp-2 mb-1 ${
                        isLight ? "text-telegram-text" : "text-telegram-text"
                      }`}>
                        {post.text}
                      </div>
                      <div className={`text-xs flex items-center gap-2 ${
                        isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"
                      }`}>
                        <FileText size={12} />
                        {post.profiles?.full_name || post.profiles?.username || "Anonymous"}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Cities */}
              {results.cities.length > 0 && (
                <div>
                  <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider ${
                    isLight ? "text-telegram-text-secondary bg-telegram-blue/5" : "text-telegram-text-secondary bg-telegram-blue/10"
                  }`}>
                    Cities
                  </div>
                  {results.cities.map((item, idx) => (
                    <Link
                      key={`${item.city}-${idx}`}
                      href={`/search?q=${encodeURIComponent(item.city)}&type=city`}
                      onClick={() => {
                        setIsOpen(false);
                        setQuery("");
                      }}
                      className={`flex items-center gap-3 px-4 py-2 hover:bg-opacity-50 transition ${
                        isLight ? "hover:bg-telegram-blue/10" : "hover:bg-white/5"
                      }`}
                    >
                      <MapPin
                        className={isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}
                        size={16}
                      />
                      <div className={`text-sm ${
                        isLight ? "text-telegram-text" : "text-telegram-text"
                      }`}>
                        {item.city}
                      </div>
                      <div className={`text-xs ml-auto ${
                        isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"
                      }`}>
                        {item.count}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* Countries */}
              {results.countries.length > 0 && (
                <div>
                  <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider ${
                    isLight ? "text-telegram-text-secondary bg-telegram-blue/5" : "text-telegram-text-secondary bg-telegram-blue/10"
                  }`}>
                    Countries
                  </div>
                  {results.countries.map((item, idx) => (
                    <Link
                      key={`${item.country}-${idx}`}
                      href={`/search?q=${encodeURIComponent(item.country)}&type=country`}
                      onClick={() => {
                        setIsOpen(false);
                        setQuery("");
                      }}
                      className={`flex items-center gap-3 px-4 py-2 hover:bg-opacity-50 transition ${
                        isLight ? "hover:bg-telegram-blue/10" : "hover:bg-white/5"
                      }`}
                    >
                      <MapPin
                        className={isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"}
                        size={16}
                      />
                      <div className={`text-sm ${
                        isLight ? "text-telegram-text" : "text-telegram-text"
                      }`}>
                        {item.country}
                      </div>
                      <div className={`text-xs ml-auto ${
                        isLight ? "text-telegram-text-secondary" : "text-telegram-text-secondary"
                      }`}>
                        {item.count}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* View All Results */}
              <div className={`border-t ${
                isLight ? "border-telegram-blue/10" : "border-telegram-blue/20"
              }`}>
                <Link
                  href={`/search?q=${encodeURIComponent(query)}`}
                  onClick={() => {
                    setIsOpen(false);
                    setQuery("");
                  }}
                  className={`block px-4 py-2 text-sm text-center font-medium transition ${
                    isLight
                      ? "text-telegram-blue hover:bg-telegram-blue/10"
                      : "text-telegram-blue-light hover:bg-telegram-blue/20"
                  }`}
                >
                  View all results
                </Link>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
