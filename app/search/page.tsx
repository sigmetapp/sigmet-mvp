"use client";

import { useEffect, useState, useMemo, Suspense } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import { Search, User, MapPin, FileText, Users, MessageSquare } from "lucide-react";
import Link from "next/link";
import { useTheme } from "@/components/ThemeProvider";

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

function SearchPageContent() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const { theme } = useTheme();
  const isLight = theme === "light";

  const query = searchParams.get("q") || "";
  const type = searchParams.get("type") || "all";
  const [searchQuery, setSearchQuery] = useState(query);
  const [results, setResults] = useState<SearchResult | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"all" | "people" | "posts" | "cities" | "countries">(
    type === "all" || type === "people" || type === "posts" || type === "cities" || type === "countries"
      ? (type as any)
      : "all"
  );

  useEffect(() => {
    setSearchQuery(query);
  }, [query]);

  useEffect(() => {
    if (!query || query.length < 2) {
      setResults(null);
      return;
    }

    setIsLoading(true);
    fetch(`/api/search?q=${encodeURIComponent(query)}&limit=50`)
      .then((res) => res.json())
      .then((data) => {
        setResults(data);
        setIsLoading(false);
      })
      .catch((error) => {
        console.error("Search error:", error);
        setIsLoading(false);
      });
  }, [query]);

  function handleSearch(e: React.FormEvent) {
    e.preventDefault();
    if (searchQuery.trim()) {
      router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleSearch(e);
    }
  }

  const filteredResults = useMemo(() => {
    if (!results) return null;

    if (activeTab === "all") return results;

    return {
      people: activeTab === "people" ? results.people : [],
      posts: activeTab === "posts" ? results.posts : [],
      cities: activeTab === "cities" ? results.cities : [],
      countries: activeTab === "countries" ? results.countries : [],
    };
  }, [results, activeTab]);

  const tabs = [
    { id: "all", label: "All", count: results ? results.people.length + results.posts.length + results.cities.length + results.countries.length : 0 },
    { id: "people", label: "People", count: results?.people.length || 0 },
    { id: "posts", label: "Posts", count: results?.posts.length || 0 },
    { id: "cities", label: "Cities", count: results?.cities.length || 0 },
    { id: "countries", label: "Countries", count: results?.countries.length || 0 },
  ];

  return (
    <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
      {/* Page header */}
      <div className="mb-6 md:mb-8">
        <h1 className={`text-2xl md:text-3xl font-semibold tracking-tight mb-4 ${
          isLight ? "bg-gradient-to-r from-primary-blue to-primary-blue-light bg-clip-text text-transparent" : "gradient-text"
        }`}>
          Search
        </h1>

        {/* Search input */}
        <form onSubmit={handleSearch} className="max-w-2xl">
          <div className="relative">
            <Search
              className={`absolute left-3 top-1/2 -translate-y-1/2 ${
                isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
              }`}
              size={20}
            />
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyDown={handleKeyDown}
              placeholder="Search people, posts, cities, countries..."
              className={`w-full pl-10 pr-4 py-3 rounded-lg border transition ${
                isLight
                  ? "bg-white border-primary-blue/20 text-primary-text placeholder:text-primary-text-secondary focus:border-primary-blue focus:outline-none focus:ring-2 focus:ring-primary-blue/20"
                  : "bg-[rgba(255,255,255,0.05)] border-primary-blue/30 text-primary-text placeholder:text-primary-text-secondary focus:border-primary-blue focus:outline-none focus:ring-2 focus:ring-primary-blue/30"
              }`}
            />
          </div>
        </form>
      </div>

      {/* Tabs */}
      {query && (
        <div className="mb-6 flex flex-wrap gap-2 border-b border-primary-blue/10 pb-2">
          {tabs.map((tab) => {
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition relative ${
                  isActive
                    ? isLight
                      ? "bg-primary-blue text-white shadow-[0_2px_8px_rgba(51,144,236,0.25)]"
                      : "bg-primary-blue text-white shadow-[0_2px_8px_rgba(51,144,236,0.3)]"
                    : isLight
                    ? "text-primary-text-secondary hover:text-primary-blue hover:bg-primary-blue/10"
                    : "text-primary-text-secondary hover:text-primary-blue-light hover:bg-primary-blue/15"
                }`}
              >
                {tab.label}
                {tab.count > 0 && (
                  <span className={`ml-2 px-1.5 py-0.5 rounded text-xs ${
                    isActive
                      ? "bg-white/20"
                      : isLight
                      ? "bg-primary-blue/10 text-primary-blue"
                      : "bg-primary-blue/20 text-primary-blue-light"
                  }`}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Results */}
      {!query && (
        <div className={`text-center py-12 ${
          isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
        }`}>
          <Search size={48} className="mx-auto mb-4 opacity-50" />
          <p className="text-lg">Enter a search query to find people, posts, cities, and countries</p>
        </div>
      )}

      {query && query.length < 2 && (
        <div className={`text-center py-12 ${
          isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
        }`}>
          <p>Please enter at least 2 characters to search</p>
        </div>
      )}

      {query && query.length >= 2 && isLoading && (
        <div className={`text-center py-12 ${
          isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
        }`}>
          <p>Searching...</p>
        </div>
      )}

      {query && query.length >= 2 && !isLoading && filteredResults && (
        <div className="space-y-8">
          {/* People */}
          {(activeTab === "all" || activeTab === "people") && filteredResults.people.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <Users
                  className={isLight ? "text-primary-blue" : "text-primary-blue-light"}
                  size={20}
                />
                <h2 className={`text-xl font-semibold ${
                  isLight ? "text-primary-text" : "text-primary-text"
                }`}>
                  People ({filteredResults.people.length})
                </h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredResults.people.map((person) => (
                  <Link
                    key={person.user_id}
                    href={`/u/${person.username || person.user_id}`}
                    className={`p-4 rounded-lg border transition ${
                      isLight
                        ? "bg-white border-primary-blue/20 hover:border-primary-blue hover:shadow-md"
                        : "bg-[rgba(255,255,255,0.03)] border-primary-blue/30 hover:border-primary-blue hover:bg-[rgba(255,255,255,0.05)]"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      {person.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={person.avatar_url}
                          alt={person.full_name || person.username || "User"}
                          className="w-12 h-12 rounded-full"
                        />
                      ) : (
                        <div className={`w-12 h-12 rounded-full grid place-items-center ${
                          isLight ? "bg-primary-blue/10 text-primary-blue" : "bg-primary-blue/20 text-primary-blue-light"
                        }`}>
                          <User size={24} />
                        </div>
                      )}
                      <div className="flex-1 min-w-0">
                        <div className={`font-medium truncate ${
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
                        {person.country && (
                          <div className={`text-xs mt-1 flex items-center gap-1 ${
                            isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
                          }`}>
                            <MapPin size={12} />
                            {person.country}
                          </div>
                        )}
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Posts */}
          {(activeTab === "all" || activeTab === "posts") && filteredResults.posts.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <MessageSquare
                  className={isLight ? "text-primary-blue" : "text-primary-blue-light"}
                  size={20}
                />
                <h2 className={`text-xl font-semibold ${
                  isLight ? "text-primary-text" : "text-primary-text"
                }`}>
                  Posts ({filteredResults.posts.length})
                </h2>
              </div>
              <div className="space-y-4">
                {filteredResults.posts.map((post) => (
                  <Link
                    key={post.id}
                    href={`/post/${post.id}`}
                    className={`block p-4 rounded-lg border transition ${
                      isLight
                        ? "bg-white border-primary-blue/20 hover:border-primary-blue hover:shadow-md"
                        : "bg-[rgba(255,255,255,0.03)] border-primary-blue/30 hover:border-primary-blue hover:bg-[rgba(255,255,255,0.05)]"
                    }`}
                  >
                    <div className={`mb-3 line-clamp-3 ${
                      isLight ? "text-primary-text" : "text-primary-text"
                    }`}>
                      {post.text}
                    </div>
                    <div className="flex items-center gap-2">
                      {post.profiles?.avatar_url ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={post.profiles.avatar_url}
                          alt={post.profiles.full_name || post.profiles.username || "User"}
                          className="w-6 h-6 rounded-full"
                        />
                      ) : (
                        <div className={`w-6 h-6 rounded-full grid place-items-center ${
                          isLight ? "bg-primary-blue/10 text-primary-blue" : "bg-primary-blue/20 text-primary-blue-light"
                        }`}>
                          <User size={12} />
                        </div>
                      )}
                      <div className={`text-sm ${
                        isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
                      }`}>
                        {post.profiles?.full_name || post.profiles?.username || "Anonymous"}
                      </div>
                      <FileText
                        className={`ml-auto ${
                          isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
                        }`}
                        size={16}
                      />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Cities */}
          {(activeTab === "all" || activeTab === "cities") && filteredResults.cities.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <MapPin
                  className={isLight ? "text-primary-blue" : "text-primary-blue-light"}
                  size={20}
                />
                <h2 className={`text-xl font-semibold ${
                  isLight ? "text-primary-text" : "text-primary-text"
                }`}>
                  Cities ({filteredResults.cities.length})
                </h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredResults.cities.map((item, idx) => (
                  <Link
                    key={`${item.city}-${idx}`}
                    href={`/search?q=${encodeURIComponent(item.city)}&type=city`}
                    className={`p-4 rounded-lg border transition ${
                      isLight
                        ? "bg-white border-primary-blue/20 hover:border-primary-blue hover:shadow-md"
                        : "bg-[rgba(255,255,255,0.03)] border-primary-blue/30 hover:border-primary-blue hover:bg-[rgba(255,255,255,0.05)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin
                          className={isLight ? "text-primary-blue" : "text-primary-blue-light"}
                          size={18}
                        />
                        <span className={`font-medium ${
                          isLight ? "text-primary-text" : "text-primary-text"
                        }`}>
                          {item.city}
                        </span>
                      </div>
                      <span className={`text-sm ${
                        isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
                      }`}>
                        {item.count} {item.count === 1 ? "person" : "people"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* Countries */}
          {(activeTab === "all" || activeTab === "countries") && filteredResults.countries.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-4">
                <MapPin
                  className={isLight ? "text-primary-blue" : "text-primary-blue-light"}
                  size={20}
                />
                <h2 className={`text-xl font-semibold ${
                  isLight ? "text-primary-text" : "text-primary-text"
                }`}>
                  Countries ({filteredResults.countries.length})
                </h2>
              </div>
              <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
                {filteredResults.countries.map((item, idx) => (
                  <Link
                    key={`${item.country}-${idx}`}
                    href={`/search?q=${encodeURIComponent(item.country)}&type=country`}
                    className={`p-4 rounded-lg border transition ${
                      isLight
                        ? "bg-white border-primary-blue/20 hover:border-primary-blue hover:shadow-md"
                        : "bg-[rgba(255,255,255,0.03)] border-primary-blue/30 hover:border-primary-blue hover:bg-[rgba(255,255,255,0.05)]"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <MapPin
                          className={isLight ? "text-primary-blue" : "text-primary-blue-light"}
                          size={18}
                        />
                        <span className={`font-medium ${
                          isLight ? "text-primary-text" : "text-primary-text"
                        }`}>
                          {item.country}
                        </span>
                      </div>
                      <span className={`text-sm ${
                        isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
                      }`}>
                        {item.count} {item.count === 1 ? "person" : "people"}
                      </span>
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          )}

          {/* No results */}
          {filteredResults &&
            filteredResults.people.length === 0 &&
            filteredResults.posts.length === 0 &&
            filteredResults.cities.length === 0 &&
            filteredResults.countries.length === 0 && (
              <div className={`text-center py-12 ${
                isLight ? "text-primary-text-secondary" : "text-primary-text-secondary"
              }`}>
                <Search size={48} className="mx-auto mb-4 opacity-50" />
                <p className="text-lg">No results found for &quot;{query}&quot;</p>
              </div>
            )}
        </div>
      )}
    </div>
  );
}

export default function SearchPage() {
  return (
    <Suspense fallback={
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        <div className="text-center py-12">
          <p>Loading...</p>
        </div>
      </div>
    }>
      <SearchPageContent />
    </Suspense>
  );
}
