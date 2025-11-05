'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Server, Database, Zap, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface PerformanceData {
  timestamp: string;
  server: {
    uptime: number;
    memory: {
      rss: number;
      heapTotal: number;
      heapUsed: number;
      external: number;
    };
    cpu: {
      user: number;
      system: number;
    };
  };
  database: {
    tests: Array<{
      name: string;
      duration: number;
      success: boolean;
      error?: string;
    }>;
    statistics: {
      average: number;
      max: number;
      min: number;
      successRate: number;
    };
  };
  api: {
    tests: Array<{
      name: string;
      duration: number;
      status?: number;
      size?: number;
      success: boolean;
      error?: string;
    }>;
    statistics: {
      average: number;
      max: number;
      min: number;
      successRate: number;
    };
  };
}

function formatDuration(ms: number): string {
  if (ms < 1) return `${Math.round(ms * 100) / 100}ms`;
  if (ms < 1000) return `${Math.round(ms)}ms`;
  return `${Math.round(ms / 10) / 100}s`;
}

function formatUptime(seconds: number): string {
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = Math.floor(seconds % 60);
  if (days > 0) return `${days}d ${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h ${minutes}m ${secs}s`;
  if (minutes > 0) return `${minutes}m ${secs}s`;
  return `${secs}s`;
}

function getColorForDuration(duration: number): string {
  if (duration < 100) return 'text-green-600';
  if (duration < 500) return 'text-yellow-600';
  if (duration < 1000) return 'text-orange-600';
  return 'text-red-600';
}

function getBgColorForDuration(duration: number): string {
  if (duration < 100) return 'bg-green-100';
  if (duration < 500) return 'bg-yellow-100';
  if (duration < 1000) return 'bg-orange-100';
  return 'bg-red-100';
}

export default function PerformanceTestPage() {
  const [data, setData] = useState<PerformanceData | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [refreshInterval, setRefreshInterval] = useState<NodeJS.Timeout | null>(null);

  const fetchData = async () => {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch('/api/admin/performance');
      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
      const result = await response.json();
      setData(result);
    } catch (err: any) {
      setError(err?.message || 'Failed to fetch performance data');
      console.error('Performance fetch error:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  useEffect(() => {
    if (autoRefresh) {
      const interval = setInterval(() => {
        fetchData();
      }, 10000); // Refresh every 10 seconds
      setRefreshInterval(interval);
      return () => clearInterval(interval);
    } else {
      if (refreshInterval) {
        clearInterval(refreshInterval);
        setRefreshInterval(null);
      }
    }
  }, [autoRefresh]);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-3xl font-bold">Performance Analysis</h1>
        <div className="flex items-center gap-4">
          <label className="flex items-center gap-2 cursor-pointer">
            <input
              type="checkbox"
              checked={autoRefresh}
              onChange={(e) => setAutoRefresh(e.target.checked)}
              className="w-4 h-4"
            />
            <span className="text-sm">Auto-refresh (10s)</span>
          </label>
          <button
            onClick={fetchData}
            disabled={loading}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-4 bg-red-100 border border-red-400 text-red-700 rounded-lg flex items-center gap-2">
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {loading && !data && (
        <div className="text-center py-12">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-4 text-gray-400" />
          <p className="text-gray-600">Loading performance data...</p>
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Server Metrics */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center gap-2 mb-4">
              <Server className="w-5 h-5 text-blue-600" />
              <h2 className="text-xl font-semibold">Server Metrics</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Uptime</div>
                <div className="text-2xl font-bold">{formatUptime(data.server.uptime)}</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Memory (RSS)</div>
                <div className="text-2xl font-bold">{data.server.memory.rss} MB</div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Heap Used</div>
                <div className="text-2xl font-bold">{data.server.memory.heapUsed} MB</div>
                <div className="text-xs text-gray-500 mt-1">
                  of {data.server.memory.heapTotal} MB
                </div>
              </div>
              <div className="bg-gray-50 p-4 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">CPU Usage</div>
                <div className="text-2xl font-bold">
                  {data.server.cpu.user + data.server.cpu.system} ms
                </div>
                <div className="text-xs text-gray-500 mt-1">
                  user: {data.server.cpu.user}ms, system: {data.server.cpu.system}ms
                </div>
              </div>
            </div>
            <div className="mt-4 text-sm text-gray-500">
              Last updated: {new Date(data.timestamp).toLocaleString()}
            </div>
          </div>

          {/* Database Performance */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center gap-2 mb-4">
              <Database className="w-5 h-5 text-green-600" />
              <h2 className="text-xl font-semibold">Database Performance</h2>
            </div>
            <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Average</div>
                <div className={`text-xl font-bold ${getColorForDuration(data.database.statistics.average)}`}>
                  {formatDuration(data.database.statistics.average)}
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Max</div>
                <div className={`text-xl font-bold ${getColorForDuration(data.database.statistics.max)}`}>
                  {formatDuration(data.database.statistics.max)}
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Min</div>
                <div className={`text-xl font-bold ${getColorForDuration(data.database.statistics.min)}`}>
                  {formatDuration(data.database.statistics.min)}
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Success Rate</div>
                <div className={`text-xl font-bold ${data.database.statistics.successRate === 100 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.database.statistics.successRate}%
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {data.database.tests.map((test) => (
                <div
                  key={test.name}
                  className={`p-3 rounded-lg flex items-center justify-between ${getBgColorForDuration(test.duration)}`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    {test.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    )}
                    <span className="font-medium">{test.name}</span>
                    {test.error && (
                      <span className="text-sm text-red-600">({test.error})</span>
                    )}
                  </div>
                  <div className={`font-bold ${getColorForDuration(test.duration)}`}>
                    {formatDuration(test.duration)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* API Performance */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <div className="flex items-center gap-2 mb-4">
              <Zap className="w-5 h-5 text-yellow-600" />
              <h2 className="text-xl font-semibold">API Endpoints Performance</h2>
            </div>
            <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Average</div>
                <div className={`text-xl font-bold ${getColorForDuration(data.api.statistics.average)}`}>
                  {formatDuration(data.api.statistics.average)}
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Max</div>
                <div className={`text-xl font-bold ${getColorForDuration(data.api.statistics.max)}`}>
                  {formatDuration(data.api.statistics.max)}
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Min</div>
                <div className={`text-xl font-bold ${getColorForDuration(data.api.statistics.min)}`}>
                  {formatDuration(data.api.statistics.min)}
                </div>
              </div>
              <div className="bg-gray-50 p-3 rounded-lg">
                <div className="text-sm text-gray-600 mb-1">Success Rate</div>
                <div className={`text-xl font-bold ${data.api.statistics.successRate === 100 ? 'text-green-600' : 'text-red-600'}`}>
                  {data.api.statistics.successRate}%
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {data.api.tests.map((test) => (
                <div
                  key={test.name}
                  className={`p-3 rounded-lg flex items-center justify-between ${getBgColorForDuration(test.duration)}`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    {test.success ? (
                      <CheckCircle className="w-5 h-5 text-green-600" />
                    ) : (
                      <AlertCircle className="w-5 h-5 text-red-600" />
                    )}
                    <span className="font-medium">{test.name}</span>
                    {test.status && (
                      <span className={`text-sm px-2 py-0.5 rounded ${test.status === 200 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {test.status}
                      </span>
                    )}
                    {test.size && (
                      <span className="text-sm text-gray-500">
                        ({Math.round(test.size / 1024)} KB)
                      </span>
                    )}
                    {test.error && (
                      <span className="text-sm text-red-600">({test.error})</span>
                    )}
                  </div>
                  <div className={`font-bold ${getColorForDuration(test.duration)} flex items-center gap-2`}>
                    <Clock className="w-4 h-4" />
                    {formatDuration(test.duration)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Performance Recommendations */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Performance Recommendations</h2>
            <div className="space-y-2">
              {data.database.statistics.max > 1000 && (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="font-medium text-yellow-800">⚠️ Slow Database Queries</div>
                  <div className="text-sm text-yellow-700 mt-1">
                    Some database queries are taking more than 1 second. Consider optimizing indexes or query structure.
                  </div>
                </div>
              )}
              {data.api.statistics.max > 2000 && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="font-medium text-orange-800">⚠️ Slow API Endpoints</div>
                  <div className="text-sm text-orange-700 mt-1">
                    Some API endpoints are taking more than 2 seconds. Consider caching or optimizing response times.
                  </div>
                </div>
              )}
              {data.server.memory.heapUsed / data.server.memory.heapTotal > 0.8 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="font-medium text-red-800">⚠️ High Memory Usage</div>
                  <div className="text-sm text-red-700 mt-1">
                    Heap memory usage is above 80%. Monitor for potential memory leaks.
                  </div>
                </div>
              )}
              {data.database.statistics.successRate < 100 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="font-medium text-red-800">❌ Database Errors</div>
                  <div className="text-sm text-red-700 mt-1">
                    Some database queries are failing. Check database connection and query syntax.
                  </div>
                </div>
              )}
              {data.api.statistics.successRate < 100 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="font-medium text-red-800">❌ API Errors</div>
                  <div className="text-sm text-red-700 mt-1">
                    Some API endpoints are returning errors. Check server logs and endpoint implementations.
                  </div>
                </div>
              )}
              {data.database.statistics.max < 500 &&
                data.api.statistics.max < 1000 &&
                data.database.statistics.successRate === 100 &&
                data.api.statistics.successRate === 100 && (
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="font-medium text-green-800">✅ Good Performance</div>
                    <div className="text-sm text-green-700 mt-1">
                      All systems are performing well. Response times are within acceptable ranges.
                    </div>
                  </div>
                )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
