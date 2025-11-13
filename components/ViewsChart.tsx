'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

type ViewData = {
  view_date: string;
  view_count: number;
};

type LinkClickData = {
  click_date: string;
  click_count: number;
};

type ViewsChartProps = {
  postId: number;
  isOpen: boolean;
  onClose: () => void;
};

export default function ViewsChart({ postId, isOpen, onClose }: ViewsChartProps) {
  const { theme } = useTheme();
  const isLight = theme === 'light';
  const [views, setViews] = useState<ViewData[]>([]);
  const [linkClicks, setLinkClicks] = useState<LinkClickData[]>([]);
  const [loading, setLoading] = useState(false);
  const [canRenderPortal, setCanRenderPortal] = useState(false);
  const chartRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setCanRenderPortal(true);
  }, []);

  useEffect(() => {
    if (isOpen && postId) {
      fetchViews();
    }
  }, [isOpen, postId]);

  const fetchViews = async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/posts/${postId}/views`);
      if (!response.ok) {
        throw new Error('Failed to fetch views');
      }
      const data = await response.json();
      setViews(data.views || []);
      setLinkClicks(data.linkClicks || []);
    } catch (error) {
      console.error('Error fetching views:', error);
      setViews([]);
      setLinkClicks([]);
    } finally {
      setLoading(false);
    }
  };

  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e: MouseEvent) => {
      if (chartRef.current && !chartRef.current.contains(e.target as Node)) {
        onClose();
      }
    };

    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, onClose]);

  const maxViews = Math.max(...views.map(v => v.view_count), 1);
  const chartHeight = 200;
  const chartWidth = 400;
  const padding = 40;
  const barWidth = (chartWidth - padding * 2) / 7 - 4;

  const formatDate = (dateString: string) => {
    // Handle date string in YYYY-MM-DD format
    const date = new Date(dateString + 'T00:00:00');
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);
    
    const dateOnly = new Date(date);
    dateOnly.setHours(0, 0, 0, 0);

    if (dateOnly.getTime() === today.getTime()) {
      return 'Today';
    }
    if (dateOnly.getTime() === yesterday.getTime()) {
      return 'Yesterday';
    }
    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  };

  const getDayLabel = (dateString: string) => {
    // Handle date string in YYYY-MM-DD format
    const date = new Date(dateString + 'T00:00:00');
    return date.toLocaleDateString('en-US', { weekday: 'short' });
  };

  if (!canRenderPortal) return null;

  return createPortal(
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Overlay */}
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9990] bg-black/50 dark:bg-black/70 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Chart Modal */}
          <motion.div
            ref={chartRef}
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-[9991] flex items-center justify-center p-3 sm:p-4"
          >
            <div
              className={`w-full max-w-md rounded-xl border shadow-xl p-4 sm:p-6 ${
                isLight
                  ? 'bg-white border-white/10'
                  : 'bg-zinc-900 border-white/10'
              }`}
            >
              {/* Header */}
              <div className="flex items-center justify-between mb-4">
                <h3
                  className={`text-lg font-semibold ${
                    isLight ? 'text-primary-text' : 'text-primary-text'
                  }`}
                >
                  Statistics Last 7 Days
                </h3>
                <button
                  onClick={onClose}
                  className={`p-1 rounded-lg transition ${
                    isLight
                      ? 'text-primary-text-secondary hover:bg-black/5'
                      : 'text-primary-text-secondary hover:bg-white/5'
                  }`}
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Chart */}
              {loading ? (
                <div
                  className={`h-[200px] flex items-center justify-center ${
                    isLight ? 'text-primary-text-secondary' : 'text-primary-text-secondary'
                  }`}
                >
                  Loading...
                </div>
              ) : views.length === 0 ? (
                <div
                  className={`h-[200px] flex items-center justify-center ${
                    isLight ? 'text-primary-text-secondary' : 'text-primary-text-secondary'
                  }`}
                >
                  No view data available
                </div>
              ) : (
                <div className="space-y-4">
                  {/* SVG Chart */}
                  <div className="relative">
                    <svg
                      width={chartWidth}
                      height={chartHeight}
                      viewBox={`0 0 ${chartWidth} ${chartHeight}`}
                      className="w-full h-auto"
                    >
                      {/* Grid lines */}
                      {[0, 1, 2, 3, 4].map((i) => {
                        const y = padding + (chartHeight - padding * 2) * (1 - i / 4);
                        return (
                          <line
                            key={i}
                            x1={padding}
                            y1={y}
                            x2={chartWidth - padding}
                            y2={y}
                            stroke={isLight ? '#e5e7eb' : '#374151'}
                            strokeWidth={1}
                            strokeDasharray="2,2"
                          />
                        );
                      })}

                      {/* Bars */}
                      {views.map((view, index) => {
                        const barHeight = maxViews > 0 
                          ? ((view.view_count / maxViews) * (chartHeight - padding * 2))
                          : 0;
                        const x = padding + index * (barWidth + 4) + 2;
                        const y = chartHeight - padding - barHeight;

                        return (
                          <g key={view.view_date}>
                            {/* Bar */}
                            <rect
                              x={x}
                              y={y}
                              width={barWidth}
                              height={barHeight}
                              fill={isLight ? '#3390ec' : '#4da3f5'}
                              rx={4}
                              className="hover:opacity-80 transition-opacity"
                            />
                            {/* Value label on top */}
                            {view.view_count > 0 && (
                              <text
                                x={x + barWidth / 2}
                                y={y - 5}
                                textAnchor="middle"
                                className={`text-xs font-medium ${
                                  isLight ? 'fill-primary-text' : 'fill-primary-text'
                                }`}
                              >
                                {view.view_count}
                              </text>
                            )}
                            {/* Day label */}
                            <text
                              x={x + barWidth / 2}
                              y={chartHeight - padding + 15}
                              textAnchor="middle"
                              className={`text-xs ${
                                isLight ? 'fill-primary-text-secondary' : 'fill-primary-text-secondary'
                              }`}
                            >
                              {getDayLabel(view.view_date)}
                            </text>
                            {/* Date label */}
                            <text
                              x={x + barWidth / 2}
                              y={chartHeight - padding + 28}
                              textAnchor="middle"
                              className={`text-xs ${
                                isLight ? 'fill-primary-text-secondary' : 'fill-primary-text-secondary'
                              }`}
                            >
                              {formatDate(view.view_date)}
                            </text>
                          </g>
                        );
                      })}
                    </svg>
                  </div>

                  {/* Summary */}
                  <div
                    className={`text-sm pt-2 border-t ${
                      isLight ? 'border-black/10 text-primary-text-secondary' : 'border-white/10 text-primary-text-secondary'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span>Total views:</span>
                      <span className="font-semibold">
                        {views.reduce((sum, v) => sum + v.view_count, 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span>Average views per day:</span>
                      <span className="font-semibold">
                        {views.length > 0
                          ? Math.round(
                              views.reduce((sum, v) => sum + v.view_count, 0) / views.length
                            )
                          : 0}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span>Total link clicks:</span>
                      <span className="font-semibold">
                        {linkClicks.reduce((sum, c) => sum + c.click_count, 0)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between mt-1">
                      <span>Average clicks per day:</span>
                      <span className="font-semibold">
                        {linkClicks.length > 0
                          ? Math.round(
                              linkClicks.reduce((sum, c) => sum + c.click_count, 0) / linkClicks.length
                            )
                          : 0}
                      </span>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>,
    document.body
  );
}
