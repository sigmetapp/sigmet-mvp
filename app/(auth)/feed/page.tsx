'use client';

import { RequireAuth } from "@/components/RequireAuth";
import PostFeed from "@/components/PostFeed";
import { useTheme } from "@/components/ThemeProvider";
import { useState } from "react";

export default function FeedPage() {
  const { theme } = useTheme();
  const isLight = theme === "light";
  const [filtersElement, setFiltersElement] = useState<React.ReactNode>(null);

  return (
    <RequireAuth>
      <div className="max-w-7xl mx-auto px-4 py-6 md:py-8">
        {/* Page header with filters in one row */}
        <div className="mb-6 md:mb-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <h1 className={`text-2xl md:text-3xl font-semibold tracking-tight ${isLight ? "bg-gradient-to-r from-telegram-blue to-telegram-blue-light bg-clip-text text-transparent" : "gradient-text"}`}>
              Your feed
            </h1>
            {filtersElement && (
              <div className="flex-shrink-0">
                {filtersElement}
              </div>
            )}
          </div>
        </div>

        <div className="w-full">
          <PostFeed
            showFilters={true}
            showComposer={true}
            className=""
            renderFiltersOutside={true}
            renderFilters={setFiltersElement}
            buttonPosition="inline"
            enableLazyLoad={false}
          />
        </div>
      </div>
    </RequireAuth>
  );
}
