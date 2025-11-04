'use client';

import { RequireAuth } from "@/components/RequireAuth";
import PostFeed from "@/components/PostFeed";
import { useTheme } from "@/components/ThemeProvider";

export default function FeedPage() {
  const { theme } = useTheme();
  const isLight = theme === "light";

  return (
    <RequireAuth>
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        {/* Page header */}
        <div className="mb-6 md:mb-8">
          <div>
            <h1 className={`text-2xl md:text-3xl font-semibold tracking-tight ${isLight ? "bg-gradient-to-r from-telegram-blue to-telegram-blue-light bg-clip-text text-transparent" : "gradient-text"}`}>Your feed</h1>
          </div>
        </div>

        <div className="max-w-3xl mx-auto">
          <PostFeed
            showFilters={true}
            showComposer={true}
            className=""
          />
        </div>
      </div>
    </RequireAuth>
  );
}
