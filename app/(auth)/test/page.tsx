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

          {/* Performance Benchmarks */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Рекомендательные диапазоны производительности</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                <h3 className="font-semibold text-blue-900 mb-3">База данных (DB)</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-blue-700">Отлично:</span>
                    <span className="font-medium text-green-600">&lt; 100ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-blue-700">Хорошо:</span>
                    <span className="font-medium text-yellow-600">100-500ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-blue-700">Приемлемо:</span>
                    <span className="font-medium text-orange-600">500-1000ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-blue-700">Плохо:</span>
                    <span className="font-medium text-red-600">&gt; 1000ms</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-blue-200">
                    <div className="text-xs text-blue-600">
                      <strong>Цель:</strong> Среднее время &lt; 200ms
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-purple-50 border border-purple-200 rounded-lg p-4">
                <h3 className="font-semibold text-purple-900 mb-3">API Endpoints</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-purple-700">Отлично:</span>
                    <span className="font-medium text-green-600">&lt; 200ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-purple-700">Хорошо:</span>
                    <span className="font-medium text-yellow-600">200-500ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-purple-700">Приемлемо:</span>
                    <span className="font-medium text-orange-600">500-2000ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-purple-700">Плохо:</span>
                    <span className="font-medium text-red-600">&gt; 2000ms</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-purple-200">
                    <div className="text-xs text-purple-600">
                      <strong>Цель:</strong> Среднее время &lt; 500ms
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-4">
                <h3 className="font-semibold text-indigo-900 mb-3">Память сервера</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-indigo-700">Отлично:</span>
                    <span className="font-medium text-green-600">Heap &lt; 50%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-indigo-700">Хорошо:</span>
                    <span className="font-medium text-yellow-600">Heap 50-70%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-indigo-700">Внимание:</span>
                    <span className="font-medium text-orange-600">Heap 70-80%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-indigo-700">Критично:</span>
                    <span className="font-medium text-red-600">Heap &gt; 80%</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-indigo-200">
                    <div className="text-xs text-indigo-600">
                      <strong>Цель:</strong> RSS &lt; 500MB для MVP
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-teal-50 border border-teal-200 rounded-lg p-4">
                <h3 className="font-semibold text-teal-900 mb-3">Успешность запросов</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-teal-700">Отлично:</span>
                    <span className="font-medium text-green-600">100%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-teal-700">Хорошо:</span>
                    <span className="font-medium text-yellow-600">95-99%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-teal-700">Внимание:</span>
                    <span className="font-medium text-orange-600">90-95%</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-teal-700">Критично:</span>
                    <span className="font-medium text-red-600">&lt; 90%</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-teal-200">
                    <div className="text-xs text-teal-600">
                      <strong>Цель:</strong> 100% успешность
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <h3 className="font-semibold text-amber-900 mb-3">Размер ответов API</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-amber-700">Отлично:</span>
                    <span className="font-medium text-green-600">&lt; 50 KB</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-amber-700">Хорошо:</span>
                    <span className="font-medium text-yellow-600">50-200 KB</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-amber-700">Приемлемо:</span>
                    <span className="font-medium text-orange-600">200-500 KB</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-amber-700">Плохо:</span>
                    <span className="font-medium text-red-600">&gt; 500 KB</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-amber-200">
                    <div className="text-xs text-amber-600">
                      <strong>Цель:</strong> Средний размер &lt; 100 KB
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-rose-50 border border-rose-200 rounded-lg p-4">
                <h3 className="font-semibold text-rose-900 mb-3">CPU Usage</h3>
                <div className="space-y-2 text-sm">
                  <div className="flex items-center justify-between">
                    <span className="text-rose-700">Низкое:</span>
                    <span className="font-medium text-green-600">&lt; 100ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-rose-700">Среднее:</span>
                    <span className="font-medium text-yellow-600">100-500ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-rose-700">Высокое:</span>
                    <span className="font-medium text-orange-600">500-1000ms</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span className="text-rose-700">Очень высокое:</span>
                    <span className="font-medium text-red-600">&gt; 1000ms</span>
                  </div>
                  <div className="mt-3 pt-3 border-t border-rose-200">
                    <div className="text-xs text-rose-600">
                      <strong>Примечание:</strong> Замеряется за время запроса
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* Performance Recommendations */}
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-xl font-semibold mb-4">Анализ производительности и рекомендации</h2>
            <div className="space-y-2">
              {/* Database Performance Analysis */}
              {data.database.statistics.average < 100 ? (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="font-medium text-green-800">✅ База данных: Отлично</div>
                  <div className="text-sm text-green-700 mt-1">
                    Среднее время запросов: {formatDuration(data.database.statistics.average)} (цель: &lt; 200ms)
                  </div>
                </div>
              ) : data.database.statistics.average < 500 ? (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="font-medium text-yellow-800">⚠️ База данных: Хорошо</div>
                  <div className="text-sm text-yellow-700 mt-1">
                    Среднее время запросов: {formatDuration(data.database.statistics.average)}. Рекомендуется оптимизация индексов для достижения &lt; 200ms.
                  </div>
                </div>
              ) : data.database.statistics.average < 1000 ? (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="font-medium text-orange-800">⚠️ База данных: Приемлемо, но требует внимания</div>
                  <div className="text-sm text-orange-700 mt-1">
                    Среднее время запросов: {formatDuration(data.database.statistics.average)}. Необходимо оптимизировать запросы и индексы.
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="font-medium text-red-800">❌ База данных: Критично</div>
                  <div className="text-sm text-red-700 mt-1">
                    Среднее время запросов: {formatDuration(data.database.statistics.average)} (&gt; 1000ms). Требуется срочная оптимизация: проверьте индексы, оптимизируйте запросы, рассмотрите кэширование.
                  </div>
                </div>
              )}

              {/* API Performance Analysis */}
              {data.api.statistics.average < 200 ? (
                <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                  <div className="font-medium text-green-800">✅ API Endpoints: Отлично</div>
                  <div className="text-sm text-green-700 mt-1">
                    Среднее время ответа: {formatDuration(data.api.statistics.average)} (цель: &lt; 500ms)
                  </div>
                </div>
              ) : data.api.statistics.average < 500 ? (
                <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                  <div className="font-medium text-yellow-800">⚠️ API Endpoints: Хорошо</div>
                  <div className="text-sm text-yellow-700 mt-1">
                    Среднее время ответа: {formatDuration(data.api.statistics.average)}. Рассмотрите оптимизацию для достижения &lt; 500ms.
                  </div>
                </div>
              ) : data.api.statistics.average < 2000 ? (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="font-medium text-orange-800">⚠️ API Endpoints: Приемлемо, но требует внимания</div>
                  <div className="text-sm text-orange-700 mt-1">
                    Среднее время ответа: {formatDuration(data.api.statistics.average)}. Рекомендуется кэширование и оптимизация.
                  </div>
                </div>
              ) : (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="font-medium text-red-800">❌ API Endpoints: Критично</div>
                  <div className="text-sm text-red-700 mt-1">
                    Среднее время ответа: {formatDuration(data.api.statistics.average)} (&gt; 2000ms). Требуется срочная оптимизация: кэширование, оптимизация запросов, рассмотрите CDN.
                  </div>
                </div>
              )}

              {/* Memory Analysis */}
              {(() => {
                const heapUsagePercent = (data.server.memory.heapUsed / data.server.memory.heapTotal) * 100;
                if (heapUsagePercent < 50) {
                  return (
                    <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                      <div className="font-medium text-green-800">✅ Память: Отлично</div>
                      <div className="text-sm text-green-700 mt-1">
                        Использование heap: {Math.round(heapUsagePercent)}% ({data.server.memory.heapUsed} MB / {data.server.memory.heapTotal} MB)
                      </div>
                    </div>
                  );
                } else if (heapUsagePercent < 70) {
                  return (
                    <div className="p-3 bg-yellow-50 border border-yellow-200 rounded-lg">
                      <div className="font-medium text-yellow-800">⚠️ Память: Хорошо</div>
                      <div className="text-sm text-yellow-700 mt-1">
                        Использование heap: {Math.round(heapUsagePercent)}% ({data.server.memory.heapUsed} MB / {data.server.memory.heapTotal} MB)
                      </div>
                    </div>
                  );
                } else if (heapUsagePercent < 80) {
                  return (
                    <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                      <div className="font-medium text-orange-800">⚠️ Память: Требует внимания</div>
                      <div className="text-sm text-orange-700 mt-1">
                        Использование heap: {Math.round(heapUsagePercent)}% ({data.server.memory.heapUsed} MB / {data.server.memory.heapTotal} MB). Мониторьте на предмет утечек памяти.
                      </div>
                    </div>
                  );
                } else {
                  return (
                    <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                      <div className="font-medium text-red-800">❌ Память: Критично</div>
                      <div className="text-sm text-red-700 mt-1">
                        Использование heap: {Math.round(heapUsagePercent)}% ({data.server.memory.heapUsed} MB / {data.server.memory.heapTotal} MB) (&gt; 80%). Проверьте на утечки памяти, рассмотрите увеличение ресурсов.
                      </div>
                    </div>
                  );
                }
              })()}

              {/* RSS Memory Check */}
              {data.server.memory.rss > 500 && (
                <div className="p-3 bg-orange-50 border border-orange-200 rounded-lg">
                  <div className="font-medium text-orange-800">⚠️ RSS Memory: Выше целевого</div>
                  <div className="text-sm text-orange-700 mt-1">
                    RSS: {data.server.memory.rss} MB (цель для MVP: &lt; 500 MB). Рассмотрите оптимизацию для MVP проекта.
                  </div>
                </div>
              )}

              {/* Success Rate Analysis */}
              {data.database.statistics.successRate < 100 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="font-medium text-red-800">❌ Ошибки базы данных</div>
                  <div className="text-sm text-red-700 mt-1">
                    Успешность запросов: {data.database.statistics.successRate}% (цель: 100%). Проверьте подключение к БД и синтаксис запросов.
                  </div>
                </div>
              )}
              {data.api.statistics.successRate < 100 && (
                <div className="p-3 bg-red-50 border border-red-200 rounded-lg">
                  <div className="font-medium text-red-800">❌ Ошибки API</div>
                  <div className="text-sm text-red-700 mt-1">
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
                  <div className="p-3 bg-green-50 border border-green-200 rounded-lg">
                    <div className="font-medium text-green-800">✅ Общая производительность: Отлично</div>
                    <div className="text-sm text-green-700 mt-1">
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
