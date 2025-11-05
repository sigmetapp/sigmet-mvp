'use client';

import React, { useState, useEffect } from 'react';
import { RefreshCw, Server, Database, Zap, AlertCircle, CheckCircle, Clock } from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

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

function getColorForDuration(duration: number, isLight: boolean): string {
  if (duration < 100) return isLight ? 'text-green-600' : 'text-green-400';
  if (duration < 500) return isLight ? 'text-yellow-600' : 'text-yellow-400';
  if (duration < 1000) return isLight ? 'text-orange-600' : 'text-orange-400';
  return isLight ? 'text-red-600' : 'text-red-400';
}

function getBgColorForDuration(duration: number, isLight: boolean): string {
  if (duration < 100) return isLight ? 'bg-green-100' : 'bg-green-900/30';
  if (duration < 500) return isLight ? 'bg-yellow-100' : 'bg-yellow-900/30';
  if (duration < 1000) return isLight ? 'bg-orange-100' : 'bg-orange-900/30';
  return isLight ? 'bg-red-100' : 'bg-red-900/30';
}

export default function PerformanceTestPage() {
  const { theme } = useTheme();
  const isLight = theme === 'light';
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
        <h1 className={`text-3xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>Performance Analysis</h1>
        <div className="flex items-center gap-4">
          <label className={`flex items-center gap-2 cursor-pointer ${isLight ? 'text-black' : 'text-white'}`}>
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
            className="flex items-center gap-2 px-4 py-2 bg-telegram-blue text-white rounded-lg hover:bg-telegram-blue-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      </div>

      {error && (
        <div className={`mb-6 p-4 ${isLight ? 'bg-red-100 border-red-400 text-red-700' : 'bg-red-900/30 border-red-500 text-red-300'} border rounded-lg flex items-center gap-2`}>
          <AlertCircle className="w-5 h-5" />
          <span>{error}</span>
        </div>
      )}

      {loading && !data && (
        <div className="text-center py-12">
          <RefreshCw className={`w-8 h-8 animate-spin mx-auto mb-4 ${isLight ? 'text-gray-400' : 'text-gray-500'}`} />
          <p className={isLight ? 'text-gray-600' : 'text-gray-400'}>Loading performance data...</p>
        </div>
      )}

      {data && (
        <div className="space-y-6">
          {/* Server Metrics */}
          <div className={`${isLight ? 'bg-white' : 'bg-black/30 border-white/10'} rounded-lg shadow-md p-6 ${!isLight ? 'border' : ''}`}>
            <div className="flex items-center gap-2 mb-4">
              <Server className={`w-5 h-5 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
              <h2 className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>Server Metrics</h2>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className={`${isLight ? 'bg-gray-50' : 'bg-white/5'} p-4 rounded-lg`}>
                <div className={`text-sm mb-1 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>Uptime</div>
                <div className={`text-2xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>{formatUptime(data.server.uptime)}</div>
              </div>
              <div className={`${isLight ? 'bg-gray-50' : 'bg-white/5'} p-4 rounded-lg`}>
                <div className={`text-sm mb-1 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>Memory (RSS)</div>
                <div className={`text-2xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>{data.server.memory.rss} MB</div>
              </div>
              <div className={`${isLight ? 'bg-gray-50' : 'bg-white/5'} p-4 rounded-lg`}>
                <div className={`text-sm mb-1 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>Heap Used</div>
                <div className={`text-2xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>{data.server.memory.heapUsed} MB</div>
                <div className={`text-xs mt-1 ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                  of {data.server.memory.heapTotal} MB
                </div>
              </div>
              <div className={`${isLight ? 'bg-gray-50' : 'bg-white/5'} p-4 rounded-lg`}>
                <div className={`text-sm mb-1 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>CPU Usage</div>
                <div className={`text-2xl font-bold ${isLight ? 'text-black' : 'text-white'}`}>
                  {data.server.cpu.user + data.server.cpu.system} ms
                </div>
                <div className={`text-xs mt-1 ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                  user: {data.server.cpu.user}ms, system: {data.server.cpu.system}ms
                </div>
              </div>
            </div>
            <div className={`mt-4 text-sm ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
              Last updated: {new Date(data.timestamp).toLocaleString()}
            </div>
          </div>

          {/* Database Performance */}
          <div className={`${isLight ? 'bg-white' : 'bg-black/30 border-white/10'} rounded-lg shadow-md p-6 ${!isLight ? 'border' : ''}`}>
            <div className="flex items-center gap-2 mb-4">
              <Database className={`w-5 h-5 ${isLight ? 'text-green-600' : 'text-green-400'}`} />
              <h2 className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>Database Performance</h2>
            </div>
            <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className={`${isLight ? 'bg-gray-50' : 'bg-white/5'} p-3 rounded-lg`}>
                <div className={`text-sm mb-1 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>Average</div>
                <div className={`text-xl font-bold ${getColorForDuration(data.database.statistics.average, isLight)}`}>
                  {formatDuration(data.database.statistics.average)}
                </div>
              </div>
              <div className={`${isLight ? 'bg-gray-50' : 'bg-white/5'} p-3 rounded-lg`}>
                <div className={`text-sm mb-1 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>Max</div>
                <div className={`text-xl font-bold ${getColorForDuration(data.database.statistics.max, isLight)}`}>
                  {formatDuration(data.database.statistics.max)}
                </div>
              </div>
              <div className={`${isLight ? 'bg-gray-50' : 'bg-white/5'} p-3 rounded-lg`}>
                <div className={`text-sm mb-1 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>Min</div>
                <div className={`text-xl font-bold ${getColorForDuration(data.database.statistics.min, isLight)}`}>
                  {formatDuration(data.database.statistics.min)}
                </div>
              </div>
              <div className={`${isLight ? 'bg-gray-50' : 'bg-white/5'} p-3 rounded-lg`}>
                <div className={`text-sm mb-1 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>Success Rate</div>
                <div className={`text-xl font-bold ${data.database.statistics.successRate === 100 ? (isLight ? 'text-green-600' : 'text-green-400') : (isLight ? 'text-red-600' : 'text-red-400')}`}>
                  {data.database.statistics.successRate}%
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {data.database.tests.map((test) => (
                <div
                  key={test.name}
                  className={`p-3 rounded-lg flex items-center justify-between ${getBgColorForDuration(test.duration, isLight)}`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    {test.success ? (
                      <CheckCircle className={`w-5 h-5 ${isLight ? 'text-green-600' : 'text-green-400'}`} />
                    ) : (
                      <AlertCircle className={`w-5 h-5 ${isLight ? 'text-red-600' : 'text-red-400'}`} />
                    )}
                    <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{test.name}</span>
                    {test.error && (
                      <span className={`text-sm ${isLight ? 'text-red-600' : 'text-red-400'}`}>({test.error})</span>
                    )}
                  </div>
                  <div className={`font-bold ${getColorForDuration(test.duration, isLight)}`}>
                    {formatDuration(test.duration)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* API Performance */}
          <div className={`${isLight ? 'bg-white' : 'bg-black/30 border-white/10'} rounded-lg shadow-md p-6 ${!isLight ? 'border' : ''}`}>
            <div className="flex items-center gap-2 mb-4">
              <Zap className={`w-5 h-5 ${isLight ? 'text-yellow-600' : 'text-yellow-400'}`} />
              <h2 className={`text-xl font-semibold ${isLight ? 'text-black' : 'text-white'}`}>API Endpoints Performance</h2>
            </div>
            <div className="mb-4 grid grid-cols-1 md:grid-cols-4 gap-4">
              <div className={`${isLight ? 'bg-gray-50' : 'bg-white/5'} p-3 rounded-lg`}>
                <div className={`text-sm mb-1 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>Average</div>
                <div className={`text-xl font-bold ${getColorForDuration(data.api.statistics.average, isLight)}`}>
                  {formatDuration(data.api.statistics.average)}
                </div>
              </div>
              <div className={`${isLight ? 'bg-gray-50' : 'bg-white/5'} p-3 rounded-lg`}>
                <div className={`text-sm mb-1 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>Max</div>
                <div className={`text-xl font-bold ${getColorForDuration(data.api.statistics.max, isLight)}`}>
                  {formatDuration(data.api.statistics.max)}
                </div>
              </div>
              <div className={`${isLight ? 'bg-gray-50' : 'bg-white/5'} p-3 rounded-lg`}>
                <div className={`text-sm mb-1 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>Min</div>
                <div className={`text-xl font-bold ${getColorForDuration(data.api.statistics.min, isLight)}`}>
                  {formatDuration(data.api.statistics.min)}
                </div>
              </div>
              <div className={`${isLight ? 'bg-gray-50' : 'bg-white/5'} p-3 rounded-lg`}>
                <div className={`text-sm mb-1 ${isLight ? 'text-gray-600' : 'text-gray-400'}`}>Success Rate</div>
                <div className={`text-xl font-bold ${data.api.statistics.successRate === 100 ? (isLight ? 'text-green-600' : 'text-green-400') : (isLight ? 'text-red-600' : 'text-red-400')}`}>
                  {data.api.statistics.successRate}%
                </div>
              </div>
            </div>
            <div className="space-y-2">
              {data.api.tests.map((test) => (
                <div
                  key={test.name}
                  className={`p-3 rounded-lg flex items-center justify-between ${getBgColorForDuration(test.duration, isLight)}`}
                >
                  <div className="flex items-center gap-3 flex-1">
                    {test.success ? (
                      <CheckCircle className={`w-5 h-5 ${isLight ? 'text-green-600' : 'text-green-400'}`} />
                    ) : (
                      <AlertCircle className={`w-5 h-5 ${isLight ? 'text-red-600' : 'text-red-400'}`} />
                    )}
                    <span className={`font-medium ${isLight ? 'text-black' : 'text-white'}`}>{test.name}</span>
                    {test.status && (
                      <span className={`text-sm px-2 py-0.5 rounded ${test.status === 200 ? (isLight ? 'bg-green-100 text-green-700' : 'bg-green-900/50 text-green-300') : (isLight ? 'bg-red-100 text-red-700' : 'bg-red-900/50 text-red-300')}`}>
                        {test.status}
                      </span>
                    )}
                    {test.size && (
                      <span className={`text-sm ${isLight ? 'text-gray-500' : 'text-gray-400'}`}>
                        ({Math.round(test.size / 1024)} KB)
                      </span>
                    )}
                    {test.error && (
                      <span className={`text-sm ${isLight ? 'text-red-600' : 'text-red-400'}`}>({test.error})</span>
                    )}
                  </div>
                  <div className={`font-bold ${getColorForDuration(test.duration, isLight)} flex items-center gap-2`}>
                    <Clock className="w-4 h-4" />
                    {formatDuration(test.duration)}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Performance Benchmarks */}
          <div className={`${isLight ? 'bg-white' : 'bg-black/30 border-white/10'} rounded-lg shadow-md p-6 ${!isLight ? 'border' : ''}`}>
            <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>Рекомендательные диапазоны производительности</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <div className={`${isLight ? 'bg-blue-50 border-blue-200' : 'bg-blue-900/30 border-blue-700/50'} border rounded-lg p-4`}>
                <h3 className={`font-semibold mb-3 ${isLight ? 'text-blue-900' : 'text-blue-300'}`}>База данных (DB)</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-blue-700' : 'text-blue-300'}>Отлично:</span>
                    <span className={`font-medium ${isLight ? 'text-green-600' : 'text-green-400'}`}>&lt; 100ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-blue-700' : 'text-blue-300'}>Хорошо:</span>
                    <span className={`font-medium ${isLight ? 'text-yellow-600' : 'text-yellow-400'}`}>100-500ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-blue-700' : 'text-blue-300'}>Приемлемо:</span>
                    <span className={`font-medium ${isLight ? 'text-orange-600' : 'text-orange-400'}`}>500-1000ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-blue-700' : 'text-blue-300'}>Плохо:</span>
                    <span className={`font-medium ${isLight ? 'text-red-600' : 'text-red-400'}`}>&gt; 1000ms</span>
                  </div>
                  <div className={`mt-3 pt-3 border-t ${isLight ? 'border-blue-200' : 'border-blue-700/50'}`}>
                    <div className={`text-xs ${isLight ? 'text-blue-600' : 'text-blue-300'}`}>
                      <strong>Цель:</strong> Среднее время &lt; 200ms
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${isLight ? 'bg-purple-50 border-purple-200' : 'bg-purple-900/30 border-purple-700/50'} border rounded-lg p-4`}>
                <h3 className={`font-semibold mb-3 ${isLight ? 'text-purple-900' : 'text-purple-300'}`}>API Endpoints</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-purple-700' : 'text-purple-300'}>Отлично:</span>
                    <span className={`font-medium ${isLight ? 'text-green-600' : 'text-green-400'}`}>&lt; 200ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-purple-700' : 'text-purple-300'}>Хорошо:</span>
                    <span className={`font-medium ${isLight ? 'text-yellow-600' : 'text-yellow-400'}`}>200-500ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-purple-700' : 'text-purple-300'}>Приемлемо:</span>
                    <span className={`font-medium ${isLight ? 'text-orange-600' : 'text-orange-400'}`}>500-2000ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-purple-700' : 'text-purple-300'}>Плохо:</span>
                    <span className={`font-medium ${isLight ? 'text-red-600' : 'text-red-400'}`}>&gt; 2000ms</span>
                  </div>
                  <div className={`mt-3 pt-3 border-t ${isLight ? 'border-purple-200' : 'border-purple-700/50'}`}>
                    <div className={`text-xs ${isLight ? 'text-purple-600' : 'text-purple-300'}`}>
                      <strong>Цель:</strong> Среднее время &lt; 500ms
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${isLight ? 'bg-indigo-50 border-indigo-200' : 'bg-indigo-900/30 border-indigo-700/50'} border rounded-lg p-4`}>
                <h3 className={`font-semibold mb-3 ${isLight ? 'text-indigo-900' : 'text-indigo-300'}`}>Память сервера</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-indigo-700' : 'text-indigo-300'}>Отлично:</span>
                    <span className={`font-medium ${isLight ? 'text-green-600' : 'text-green-400'}`}>Heap &lt; 50%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-indigo-700' : 'text-indigo-300'}>Хорошо:</span>
                    <span className={`font-medium ${isLight ? 'text-yellow-600' : 'text-yellow-400'}`}>Heap 50-70%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-indigo-700' : 'text-indigo-300'}>Внимание:</span>
                    <span className={`font-medium ${isLight ? 'text-orange-600' : 'text-orange-400'}`}>Heap 70-80%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-indigo-700' : 'text-indigo-300'}>Критично:</span>
                    <span className={`font-medium ${isLight ? 'text-red-600' : 'text-red-400'}`}>Heap &gt; 80%</span>
                  </div>
                  <div className={`mt-3 pt-3 border-t ${isLight ? 'border-indigo-200' : 'border-indigo-700/50'}`}>
                    <div className={`text-xs ${isLight ? 'text-indigo-600' : 'text-indigo-300'}`}>
                      <strong>Цель:</strong> RSS &lt; 500MB для MVP
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${isLight ? 'bg-teal-50 border-teal-200' : 'bg-teal-900/30 border-teal-700/50'} border rounded-lg p-4`}>
                <h3 className={`font-semibold mb-3 ${isLight ? 'text-teal-900' : 'text-teal-300'}`}>Успешность запросов</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-teal-700' : 'text-teal-300'}>Отлично:</span>
                    <span className={`font-medium ${isLight ? 'text-green-600' : 'text-green-400'}`}>100%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-teal-700' : 'text-teal-300'}>Хорошо:</span>
                    <span className={`font-medium ${isLight ? 'text-yellow-600' : 'text-yellow-400'}`}>95-99%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-teal-700' : 'text-teal-300'}>Внимание:</span>
                    <span className={`font-medium ${isLight ? 'text-orange-600' : 'text-orange-400'}`}>90-95%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-teal-700' : 'text-teal-300'}>Критично:</span>
                    <span className={`font-medium ${isLight ? 'text-red-600' : 'text-red-400'}`}>&lt; 90%</span>
                  </div>
                  <div className={`mt-3 pt-3 border-t ${isLight ? 'border-teal-200' : 'border-teal-700/50'}`}>
                    <div className={`text-xs ${isLight ? 'text-teal-600' : 'text-teal-300'}`}>
                      <strong>Цель:</strong> 100% успешность
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-900/30 border-amber-700/50'} border rounded-lg p-4`}>
                <h3 className={`font-semibold mb-3 ${isLight ? 'text-amber-900' : 'text-amber-300'}`}>Размер ответов API</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-amber-700' : 'text-amber-300'}>Отлично:</span>
                    <span className={`font-medium ${isLight ? 'text-green-600' : 'text-green-400'}`}>&lt; 50 KB</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-amber-700' : 'text-amber-300'}>Хорошо:</span>
                    <span className={`font-medium ${isLight ? 'text-yellow-600' : 'text-yellow-400'}`}>50-200 KB</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-amber-700' : 'text-amber-300'}>Приемлемо:</span>
                    <span className={`font-medium ${isLight ? 'text-orange-600' : 'text-orange-400'}`}>200-500 KB</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-amber-700' : 'text-amber-300'}>Плохо:</span>
                    <span className={`font-medium ${isLight ? 'text-red-600' : 'text-red-400'}`}>&gt; 500 KB</span>
                  </div>
                  <div className={`mt-3 pt-3 border-t ${isLight ? 'border-amber-200' : 'border-amber-700/50'}`}>
                    <div className={`text-xs ${isLight ? 'text-amber-600' : 'text-amber-300'}`}>
                      <strong>Цель:</strong> Средний размер &lt; 100 KB
                    </div>
                  </div>
                </div>
              </div>

              <div className={`${isLight ? 'bg-rose-50 border-rose-200' : 'bg-rose-900/30 border-rose-700/50'} border rounded-lg p-4`}>
                <h3 className={`font-semibold mb-3 ${isLight ? 'text-rose-900' : 'text-rose-300'}`}>CPU Usage</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-rose-700' : 'text-rose-300'}>Низкое:</span>
                    <span className={`font-medium ${isLight ? 'text-green-600' : 'text-green-400'}`}>&lt; 100ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-rose-700' : 'text-rose-300'}>Среднее:</span>
                    <span className={`font-medium ${isLight ? 'text-yellow-600' : 'text-yellow-400'}`}>100-500ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-rose-700' : 'text-rose-300'}>Высокое:</span>
                    <span className={`font-medium ${isLight ? 'text-orange-600' : 'text-orange-400'}`}>500-1000ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className={isLight ? 'text-rose-700' : 'text-rose-300'}>Очень высокое:</span>
                    <span className={`font-medium ${isLight ? 'text-red-600' : 'text-red-400'}`}>&gt; 1000ms</span>
                  </div>
                  <div className={`mt-3 pt-3 border-t ${isLight ? 'border-rose-200' : 'border-rose-700/50'}`}>
                    <div className={`text-xs ${isLight ? 'text-rose-600' : 'text-rose-300'}`}>
                      <strong>Примечание:</strong> Замеряется за время запроса
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Recommendations */}
          <div className={`${isLight ? 'bg-white' : 'bg-black/30 border-white/10'} rounded-lg shadow-md p-6 ${!isLight ? 'border' : ''}`}>
            <h2 className={`text-xl font-semibold mb-4 ${isLight ? 'text-black' : 'text-white'}`}>Анализ производительности и рекомендации</h2>
            <div className="space-y-2">
              {/* Database Performance Analysis */}
              {data.database.statistics.average < 100 ? (
                <div className={`p-3 ${isLight ? 'bg-green-50 border-green-200' : 'bg-green-900/30 border-green-700/50'} border rounded-lg`}>
                  <div className={`font-medium ${isLight ? 'text-green-800' : 'text-green-300'}`}>✅ База данных: Отлично</div>
                  <div className={`text-sm mt-1 ${isLight ? 'text-green-700' : 'text-green-300'}`}>
                    Среднее время запросов: {formatDuration(data.database.statistics.average)} (цель: &lt; 200ms)
                  </div>
                </div>
              ) : data.database.statistics.average < 500 ? (
                <div className={`p-3 ${isLight ? 'bg-yellow-50 border-yellow-200' : 'bg-yellow-900/30 border-yellow-700/50'} border rounded-lg`}>
                  <div className={`font-medium ${isLight ? 'text-yellow-800' : 'text-yellow-300'}`}>⚠️ База данных: Хорошо</div>
                  <div className={`text-sm mt-1 ${isLight ? 'text-yellow-700' : 'text-yellow-300'}`}>
                    Среднее время запросов: {formatDuration(data.database.statistics.average)}. Рекомендуется оптимизация индексов для достижения &lt; 200ms.
                  </div>
                </div>
              ) : data.database.statistics.average < 1000 ? (
                <div className={`p-3 ${isLight ? 'bg-orange-50 border-orange-200' : 'bg-orange-900/30 border-orange-700/50'} border rounded-lg`}>
                  <div className={`font-medium ${isLight ? 'text-orange-800' : 'text-orange-300'}`}>⚠️ База данных: Приемлемо, но требует внимания</div>
                  <div className={`text-sm mt-1 ${isLight ? 'text-orange-700' : 'text-orange-300'}`}>
                    Среднее время запросов: {formatDuration(data.database.statistics.average)}. Необходимо оптимизировать запросы и индексы.
                  </div>
                </div>
              ) : (
                <div className={`p-3 ${isLight ? 'bg-red-50 border-red-200' : 'bg-red-900/30 border-red-700/50'} border rounded-lg`}>
                  <div className={`font-medium ${isLight ? 'text-red-800' : 'text-red-300'}`}>❌ База данных: Критично</div>
                  <div className={`text-sm mt-1 ${isLight ? 'text-red-700' : 'text-red-300'}`}>
                    Среднее время запросов: {formatDuration(data.database.statistics.average)} (&gt; 1000ms). Требуется срочная оптимизация: проверьте индексы, оптимизируйте запросы, рассмотрите кэширование.
                  </div>
                </div>
              )}

              {/* API Performance Analysis */}
              {data.api.statistics.average < 200 ? (
                <div className={`p-3 ${isLight ? 'bg-green-50 border-green-200' : 'bg-green-900/30 border-green-700/50'} border rounded-lg`}>
                  <div className={`font-medium ${isLight ? 'text-green-800' : 'text-green-300'}`}>✅ API Endpoints: Отлично</div>
                  <div className={`text-sm mt-1 ${isLight ? 'text-green-700' : 'text-green-300'}`}>
                    Среднее время ответа: {formatDuration(data.api.statistics.average)} (цель: &lt; 500ms)
                  </div>
                </div>
              ) : data.api.statistics.average < 500 ? (
                <div className={`p-3 ${isLight ? 'bg-yellow-50 border-yellow-200' : 'bg-yellow-900/30 border-yellow-700/50'} border rounded-lg`}>
                  <div className={`font-medium ${isLight ? 'text-yellow-800' : 'text-yellow-300'}`}>⚠️ API Endpoints: Хорошо</div>
                  <div className={`text-sm mt-1 ${isLight ? 'text-yellow-700' : 'text-yellow-300'}`}>
                    Среднее время ответа: {formatDuration(data.api.statistics.average)}. Рассмотрите оптимизацию для достижения &lt; 500ms.
                  </div>
                </div>
              ) : data.api.statistics.average < 2000 ? (
                <div className={`p-3 ${isLight ? 'bg-orange-50 border-orange-200' : 'bg-orange-900/30 border-orange-700/50'} border rounded-lg`}>
                  <div className={`font-medium ${isLight ? 'text-orange-800' : 'text-orange-300'}`}>⚠️ API Endpoints: Приемлемо, но требует внимания</div>
                  <div className={`text-sm mt-1 ${isLight ? 'text-orange-700' : 'text-orange-300'}`}>
                    Среднее время ответа: {formatDuration(data.api.statistics.average)}. Рекомендуется кэширование и оптимизация.
                  </div>
                </div>
              ) : (
                <div className={`p-3 ${isLight ? 'bg-red-50 border-red-200' : 'bg-red-900/30 border-red-700/50'} border rounded-lg`}>
                  <div className={`font-medium ${isLight ? 'text-red-800' : 'text-red-300'}`}>❌ API Endpoints: Критично</div>
                  <div className={`text-sm mt-1 ${isLight ? 'text-red-700' : 'text-red-300'}`}>
                    Среднее время ответа: {formatDuration(data.api.statistics.average)} (&gt; 2000ms). Требуется срочная оптимизация: кэширование, оптимизация запросов, рассмотрите CDN.
                  </div>
                </div>
              )}

              {/* Memory Analysis */}
              {(() => {
                const heapUsagePercent = (data.server.memory.heapUsed / data.server.memory.heapTotal) * 100;
                if (heapUsagePercent < 50) {
                  return (
                    <div className={`p-3 ${isLight ? 'bg-green-50 border-green-200' : 'bg-green-900/30 border-green-700/50'} border rounded-lg`}>
                      <div className={`font-medium ${isLight ? 'text-green-800' : 'text-green-300'}`}>✅ Память: Отлично</div>
                      <div className={`text-sm mt-1 ${isLight ? 'text-green-700' : 'text-green-300'}`}>
                        Использование heap: {Math.round(heapUsagePercent)}% ({data.server.memory.heapUsed} MB / {data.server.memory.heapTotal} MB)
                      </div>
                    </div>
                  );
                } else if (heapUsagePercent < 70) {
                  return (
                    <div className={`p-3 ${isLight ? 'bg-yellow-50 border-yellow-200' : 'bg-yellow-900/30 border-yellow-700/50'} border rounded-lg`}>
                      <div className={`font-medium ${isLight ? 'text-yellow-800' : 'text-yellow-300'}`}>⚠️ Память: Хорошо</div>
                      <div className={`text-sm mt-1 ${isLight ? 'text-yellow-700' : 'text-yellow-300'}`}>
                        Использование heap: {Math.round(heapUsagePercent)}% ({data.server.memory.heapUsed} MB / {data.server.memory.heapTotal} MB)
                      </div>
                    </div>
                  );
                } else if (heapUsagePercent < 80) {
                  return (
                    <div className={`p-3 ${isLight ? 'bg-orange-50 border-orange-200' : 'bg-orange-900/30 border-orange-700/50'} border rounded-lg`}>
                      <div className={`font-medium ${isLight ? 'text-orange-800' : 'text-orange-300'}`}>⚠️ Память: Требует внимания</div>
                      <div className={`text-sm mt-1 ${isLight ? 'text-orange-700' : 'text-orange-300'}`}>
                        Использование heap: {Math.round(heapUsagePercent)}% ({data.server.memory.heapUsed} MB / {data.server.memory.heapTotal} MB). Мониторьте на предмет утечек памяти.
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className={`p-3 ${isLight ? 'bg-red-50 border-red-200' : 'bg-red-900/30 border-red-700/50'} border rounded-lg`}>
                      <div className={`font-medium ${isLight ? 'text-red-800' : 'text-red-300'}`}>❌ Память: Критично</div>
                      <div className={`text-sm mt-1 ${isLight ? 'text-red-700' : 'text-red-300'}`}>
                        Использование heap: {Math.round(heapUsagePercent)}% ({data.server.memory.heapUsed} MB / {data.server.memory.heapTotal} MB) (&gt; 80%). Проверьте на утечки памяти, рассмотрите увеличение ресурсов.
                      </div>
                    </div>
                  );
                }
              })()}

              {/* RSS Memory Check */}
              {data.server.memory.rss > 500 && (
                <div className={`p-3 ${isLight ? 'bg-orange-50 border-orange-200' : 'bg-orange-900/30 border-orange-700/50'} border rounded-lg`}>
                  <div className={`font-medium ${isLight ? 'text-orange-800' : 'text-orange-300'}`}>⚠️ RSS Memory: Выше целевого</div>
                  <div className={`text-sm mt-1 ${isLight ? 'text-orange-700' : 'text-orange-300'}`}>
                    RSS: {data.server.memory.rss} MB (цель для MVP: &lt; 500 MB). Рассмотрите оптимизацию для MVP проекта.
                  </div>
                </div>
              )}

              {/* Success Rate Analysis */}
              {data.database.statistics.successRate < 100 && (
                <div className={`p-3 ${isLight ? 'bg-red-50 border-red-200' : 'bg-red-900/30 border-red-700/50'} border rounded-lg`}>
                  <div className={`font-medium ${isLight ? 'text-red-800' : 'text-red-300'}`}>❌ Ошибки базы данных</div>
                  <div className={`text-sm mt-1 ${isLight ? 'text-red-700' : 'text-red-300'}`}>
                    Успешность запросов: {data.database.statistics.successRate}% (цель: 100%). Проверьте подключение к БД и синтаксис запросов.
                  </div>
                </div>
              )}
              {data.api.statistics.successRate < 100 && (
                <div className={`p-3 ${isLight ? 'bg-red-50 border-red-200' : 'bg-red-900/30 border-red-700/50'} border rounded-lg`}>
                  <div className={`font-medium ${isLight ? 'text-red-800' : 'text-red-300'}`}>❌ Ошибки API</div>
                  <div className={`text-sm mt-1 ${isLight ? 'text-red-700' : 'text-red-300'}`}>
                    Успешность запросов: {data.api.statistics.successRate}% (цель: 100%). Проверьте логи сервера и реализацию endpoints.
                  </div>
                </div>
              )}

              {/* Overall Performance */}
              {data.database.statistics.average < 200 &&
                data.api.statistics.average < 500 &&
                data.database.statistics.successRate === 100 &&
                data.api.statistics.successRate === 100 &&
                (data.server.memory.heapUsed / data.server.memory.heapTotal) * 100 < 70 && (
                  <div className={`p-3 ${isLight ? 'bg-green-50 border-green-200' : 'bg-green-900/30 border-green-700/50'} border rounded-lg`}>
                    <div className={`font-medium ${isLight ? 'text-green-800' : 'text-green-300'}`}>✅ Общая производительность: Отлично</div>
                    <div className={`text-sm mt-1 ${isLight ? 'text-green-700' : 'text-green-300'}`}>
                      Все системы работают в пределах рекомендуемых диапазонов. Время отклика и использование ресурсов оптимальны.
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
