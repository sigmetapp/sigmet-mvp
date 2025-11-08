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
  const [isFullScreen, setIsFullScreen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const modalInputRef = useRef<HTMLInputElement>(null);
  const modalRef = useRef<HTMLDivElement>(null);
  const { theme } = useTheme();
  const router = useRouter();
  const isLight = theme === "light";

  // Detect mobile
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Close on outside click
  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      const target = e.target as Node;
      
      // Close regular dropdown if click is outside container
      if (containerRef.current && !containerRef.current.contains(target)) {
        setIsOpen(false);
      }
      
      // Close modal if click is outside modal (on mobile)
      if (isModalOpen && isMobile && modalRef.current && !modalRef.current.contains(target)) {
        setIsModalOpen(false);
        setQuery("");
        setIsOpen(false);
        inputRef.current?.blur();
      }
    }
    document.addEventListener("click", onDocClick);
    return () => document.removeEventListener("click", onDocClick);
  }, [isModalOpen, isMobile]);

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
      setIsModalOpen(false);
      setQuery("");
    } else if (e.key === "Escape") {
      setIsOpen(false);
      setIsModalOpen(false);
      inputRef.current?.blur();
    }
  }

  function handleFocus() {
    if (isMobile && !isModalOpen) {
      // On mobile, open modal instead of fullscreen
      setIsModalOpen(true);
      setTimeout(() => {
        modalInputRef.current?.focus();
      }, 100);
    }
    if (query.length >= 2) {
      setIsOpen(true);
    }
  }

  function handleBlur() {
    // Delay to allow click events on results
    setTimeout(() => {
      // Don't close modal on blur, only on explicit close
    }, 200);
  }

  function handleSearchClick() {
    if (query.trim()) {
      router.push(`/search?q=${encodeURIComponent(query.trim())}`);
      setIsModalOpen(false);
      setIsOpen(false);
      setQuery("");
      inputRef.current?.blur();
    }
  }

  function handleCloseModal() {
    setIsModalOpen(false);
    setQuery("");
    setIsOpen(false);
    inputRef.current?.blur();
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
    <>
      {/* Modal overlay for mobile */}
      {isModalOpen && isMobile && (
        <div
          className="fixed inset-0 z-[100] md:hidden flex items-center justify-center p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) {
              handleCloseModal();
            }
          }}
        >
          {/* Backdrop */}
          <div
            className={`fixed inset-0 ${isLight ? "bg-black/50" : "bg-black/70"} backdrop-blur-sm`}
            onClick={handleCloseModal}
          />
          
          {/* Modal content */}
          <div
            ref={modalRef}
            className={`relative z-[101] w-full max-w-md rounded-xl shadow-2xl ${
              isLight
                ? "bg-white border border-primary-blue/20"
                : "bg-[rgba(15,22,35,0.98)] border border-primary-blue/30 backdrop-blur-md"
            }`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal header with close button */}
            <div className="flex items-center justify-between p-4 border-b border-primary-blue/20">
              <h2 className={`text-lg font-semibold ${
                isLight ? "text-primary-text" : "text-primary-text"
              }`}>
                Search
              </h2>
              <button
                onClick={handleCloseModal}
                className={`p-2 rounded-lg transition ${
                  isLight
                    ? "text-primary-text-secondary hover:bg-primary-blue/10"
                    : "text-primary-text-secondary hover:bg-white/10"
                }`}
                aria-label="Close search"
              >
                <X size={20} />
              </button>
            </div>

            {/* Search form */}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                handleSearchClick();
              }}
              className="p-4"
            >
              <div className="relative mb-4">
                <Search
                  className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                    isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
                  }`}
                  size={20}
                />
                <input
                  ref={modalInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && query.trim()) {
                      e.preventDefault();
                      handleSearchClick();
                    } else if (e.key === "Escape") {
                      handleCloseModal();
                    }
                  }}
                  placeholder="Search people, posts, cities..."
                  autoFocus
                  className={`w-full pl-10 pr-10 py-3 text-base rounded-lg border transition ${
                    isLight
                      ? "bg-white border-primary-blue/20 text-primary-text placeholder:text-primary-text-secondary focus:border-primary-blue focus:outline-none focus:ring-2 focus:ring-primary-blue/20"
                      : "bg-[rgba(255,255,255,0.05)] border-primary-blue/30 text-primary-text placeholder:text-primary-text-secondary focus:border-primary-blue focus:outline-none focus:ring-2 focus:ring-primary-blue/30"
                  }`}
                  style={{ fontSize: '16px' }} // Prevent zoom on mobile
                />
                {query && (
                  <button
                    type="button"
                    onClick={handleClear}
                    className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded ${
                      isLight
                        ? "text-primary-text-secondary hover:bg-primary-blue/10"
                        : "text-primary-text-secondary hover:bg-white/10"
                    }`}
                    aria-label="Clear search"
                  >
                    <X size={18} />
                  </button>
                )}
              </div>

              {/* Search button */}
              <button
                type="submit"
                disabled={!query.trim()}
                className={`w-full py-3 px-4 rounded-lg font-medium transition ${
                  query.trim()
                    ? isLight
                      ? "bg-primary-blue text-white hover:bg-primary-blue-dark shadow-[0_2px_8px_rgba(51,144,236,0.25)]"
                      : "bg-primary-blue text-white hover:bg-primary-blue-dark shadow-[0_2px_8px_rgba(51,144,236,0.3)]"
                    : isLight
                    ? "bg-primary-blue/20 text-primary-text-secondary cursor-not-allowed"
                    : "bg-primary-blue/20 text-primary-text-secondary cursor-not-allowed"
                }`}
              >
                Search
              </button>
            </form>
            {/* Results in modal */}
            {isOpen && query.length >= 2 && (
              <div className="max-h-[300px] overflow-y-auto border-t border-primary-blue/20">
                {isLoading ? (
                  <div className={`px-4 py-3 text-sm ${
                    isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
                  }`}>
                    Searching...
                  </div>
                ) : !hasResults ? (
                  <div className={`px-4 py-3 text-sm ${
                    isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
                  }`}>
                    No results found
                  </div>
                ) : (
                  <div>
                    {/* People */}
                    {results.people.length > 0 && (
                      <div>
                        <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider ${
                          isLight ? "text-primary-text-secondary bg-primary-blue/5" : "text-primary-text-secondary bg-primary-blue/10"
                        }`}>
                          People
                        </div>
                        {results.people.map((person) => (
                          <Link
                            key={person.user_id}
                            href={`/u/${person.username || person.user_id}`}
                            onClick={() => {
                              setIsOpen(false);
                              setIsModalOpen(false);
                              setQuery("");
                            }}
                            className={`flex items-center gap-3 px-4 py-3 hover:bg-opacity-50 transition ${
                              isLight ? "hover:bg-primary-blue/10" : "hover:bg-white/5"
                            }`}
                          >
                            {person.avatar_url ? (
                              // eslint-disable-next-line @next/next/no-img-element
                              <img
                                src={person.avatar_url}
                                alt={person.full_name || person.username || "User"}
                                className="w-10 h-10 rounded-full"
                              />
                            ) : (
                              <div className={`w-10 h-10 rounded-full grid place-items-center ${
                                isLight ? "bg-primary-blue/10 text-primary-blue" : "bg-primary-blue/20 text-primary-blue-light"
                              }`}>
                                <User size={20} />
                              </div>
                            )}
                            <div className="flex-1 min-w-0">
                              <div className={`text-base font-medium truncate ${
                                isLight ? "text-primary-text" : "text-primary-text"
                              }`}>
                                {person.full_name || person.username || "Anonymous"}
                              </div>
                              {person.username && person.full_name && (
                                <div className={`text-sm truncate ${
                                  isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
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
                          isLight ? "text-primary-text-secondary bg-primary-blue/5" : "text-primary-text-secondary bg-primary-blue/10"
                        }`}>
                          Posts
                        </div>
                        {results.posts.map((post) => (
                          <Link
                            key={post.id}
                            href={`/post/${post.id}`}
                            onClick={() => {
                              setIsOpen(false);
                              setIsModalOpen(false);
                              setQuery("");
                            }}
                            className={`block px-4 py-3 hover:bg-opacity-50 transition ${
                              isLight ? "hover:bg-primary-blue/10" : "hover:bg-white/5"
                            }`}
                          >
                            <div className={`text-base line-clamp-2 mb-1 ${
                              isLight ? "text-primary-text" : "text-primary-text"
                            }`}>
                              {post.text}
                            </div>
                            <div className={`text-sm flex items-center gap-2 ${
                              isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
                            }`}>
                              <FileText size={14} />
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
                          isLight ? "text-primary-text-secondary bg-primary-blue/5" : "text-primary-text-secondary bg-primary-blue/10"
                        }`}>
                          Cities
                        </div>
                        {results.cities.map((item, idx) => (
                          <Link
                            key={`${item.city}-${idx}`}
                            href={`/search?q=${encodeURIComponent(item.city)}&type=city`}
                            onClick={() => {
                              setIsOpen(false);
                              setIsModalOpen(false);
                              setQuery("");
                            }}
                            className={`flex items-center gap-3 px-4 py-3 hover:bg-opacity-50 transition ${
                              isLight ? "hover:bg-primary-blue/10" : "hover:bg-white/5"
                            }`}
                          >
                            <MapPin
                              className={isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}
                              size={18}
                            />
                            <div className={`text-base ${
                              isLight ? "text-primary-text" : "text-primary-text"
                            }`}>
                              {item.city}
                            </div>
                            <div className={`text-sm ml-auto ${
                              isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
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
                          isLight ? "text-primary-text-secondary bg-primary-blue/5" : "text-primary-text-secondary bg-primary-blue/10"
                        }`}>
                          Countries
                        </div>
                        {results.countries.map((item, idx) => (
                          <Link
                            key={`${item.country}-${idx}`}
                            href={`/search?q=${encodeURIComponent(item.country)}&type=country`}
                            onClick={() => {
                              setIsOpen(false);
                              setIsModalOpen(false);
                              setQuery("");
                            }}
                            className={`flex items-center gap-3 px-4 py-3 hover:bg-opacity-50 transition ${
                              isLight ? "hover:bg-primary-blue/10" : "hover:bg-white/5"
                            }`}
                          >
                            <MapPin
                              className={isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}
                              size={18}
                            />
                            <div className={`text-base ${
                              isLight ? "text-primary-text" : "text-primary-text"
                            }`}>
                              {item.country}
                            </div>
                            <div className={`text-sm ml-auto ${
                              isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
                            }`}>
                              {item.count}
                            </div>
                          </Link>
                        ))}
                      </div>
                    )}

                    {/* View All Results */}
                    <div className={`border-t ${
                      isLight ? "border-primary-blue/10" : "border-primary-blue/20"
                    }`}>
                      <Link
                        href={`/search?q=${encodeURIComponent(query)}`}
                        onClick={() => {
                          setIsOpen(false);
                          setIsModalOpen(false);
                          setQuery("");
                        }}
                        className={`block px-4 py-3 text-base text-center font-medium transition ${
                          isLight
                            ? "text-primary-blue hover:bg-primary-blue/10"
                            : "text-primary-blue-light hover:bg-primary-blue/20"
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
        </div>
      )}

      {/* Regular search input */}
      <div ref={containerRef} className={`relative ${className ? className : 'w-full md:w-[313px]'}`}>
        <div className="relative">
          <Search
            className={`absolute left-3 top-1/2 -translate-y-1/2 ${
              isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
            }`}
            size={18}
          />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onFocus={handleFocus}
            onBlur={handleBlur}
            onKeyDown={handleKeyDown}
            onClick={(e) => {
              // On mobile, clicking should open modal
              if (isMobile && !isModalOpen) {
                e.preventDefault();
                setIsModalOpen(true);
                setTimeout(() => {
                  modalInputRef.current?.focus();
                }, 100);
              }
            }}
            placeholder="Search people, posts, cities..."
            className={`w-full pl-10 pr-10 py-2 rounded-lg text-sm border transition ${
              isLight
                ? "bg-white/90 border-primary-blue/20 text-primary-text placeholder:text-primary-text-secondary focus:border-primary-blue focus:outline-none focus:ring-2 focus:ring-primary-blue/20"
                : "bg-[rgba(255,255,255,0.05)] border-primary-blue/30 text-primary-text placeholder:text-primary-text-secondary focus:border-primary-blue focus:outline-none focus:ring-2 focus:ring-primary-blue/30"
            }`}
            style={{ fontSize: '16px' }} // Prevent zoom on mobile
          />
          {query && (
            <button
              onClick={handleClear}
              className={`absolute right-2 top-1/2 -translate-y-1/2 p-1 rounded ${
                isLight
                  ? "text-primary-text-secondary hover:bg-primary-blue/10"
                  : "text-primary-text-secondary hover:bg-white/10"
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
              ? "bg-white border-primary-blue/20"
              : "bg-[rgba(15,22,35,0.95)] backdrop-blur-md border-primary-blue/30"
          }`}
        >
          {isLoading ? (
            <div className={`px-4 py-3 text-sm ${
              isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
            }`}>
              Searching...
            </div>
          ) : !hasResults ? (
            <div className={`px-4 py-3 text-sm ${
              isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
            }`}>
              No results found
            </div>
          ) : (
            <div className="max-h-[400px] overflow-y-auto">
              {/* People */}
              {results.people.length > 0 && (
                <div>
                  <div className={`px-4 py-2 text-xs font-semibold uppercase tracking-wider ${
                    isLight ? "text-primary-text-secondary bg-primary-blue/5" : "text-primary-text-secondary bg-primary-blue/10"
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
                        isLight ? "hover:bg-primary-blue/10" : "hover:bg-white/5"
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
                          isLight ? "bg-primary-blue/10 text-primary-blue" : "bg-primary-blue/20 text-primary-blue-light"
                        }`}>
                          <User size={16} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className={`text-sm font-medium truncate ${
                          isLight ? "text-primary-text" : "text-primary-text"
                        }`}>
                          {person.full_name || person.username || "Anonymous"}
                        </div>
                        {person.username && person.full_name && (
                          <div className={`text-xs truncate ${
                            isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
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
                    isLight ? "text-primary-text-secondary bg-primary-blue/5" : "text-primary-text-secondary bg-primary-blue/10"
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
                        isLight ? "hover:bg-primary-blue/10" : "hover:bg-white/5"
                      }`}
                    >
                      <div className={`text-sm line-clamp-2 mb-1 ${
                        isLight ? "text-primary-text" : "text-primary-text"
                      }`}>
                        {post.text}
                      </div>
                      <div className={`text-xs flex items-center gap-2 ${
                        isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
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
                    isLight ? "text-primary-text-secondary bg-primary-blue/5" : "text-primary-text-secondary bg-primary-blue/10"
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
                        isLight ? "hover:bg-primary-blue/10" : "hover:bg-white/5"
                      }`}
                    >
                      <MapPin
                        className={isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}
                        size={16}
                      />
                      <div className={`text-sm ${
                        isLight ? "text-primary-text" : "text-primary-text"
                      }`}>
                        {item.city}
                      </div>
                      <div className={`text-xs ml-auto ${
                        isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
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
                    isLight ? "text-primary-text-secondary bg-primary-blue/5" : "text-primary-text-secondary bg-primary-blue/10"
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
                        isLight ? "hover:bg-primary-blue/10" : "hover:bg-white/5"
                      }`}
                    >
                      <MapPin
                        className={isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"}
                        size={16}
                      />
                      <div className={`text-sm ${
                        isLight ? "text-primary-text" : "text-primary-text"
                      }`}>
                        {item.country}
                      </div>
                      <div className={`text-xs ml-auto ${
                        isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
                      }`}>
                        {item.count}
                      </div>
                    </Link>
                  ))}
                </div>
              )}

              {/* View All Results */}
              <div className={`border-t ${
                isLight ? "border-primary-blue/10" : "border-primary-blue/20"
              }`}>
                <Link
                  href={`/search?q=${encodeURIComponent(query)}`}
                  onClick={() => {
                    setIsOpen(false);
                    setQuery("");
                  }}
                  className={`block px-4 py-2 text-sm text-center font-medium transition ${
                    isLight
                      ? "text-primary-blue hover:bg-primary-blue/10"
                      : "text-primary-blue-light hover:bg-primary-blue/20"
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
    </>
  );
}
