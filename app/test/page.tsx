'use client';

import { useState, useEffect, useRef } from 'react';

interface TestStats {
  totalRequests: number;
  successfulRequests: number;
  failedRequests: number;
  errors: number;
  duration: number;
  successRate: string;
  errorRate: string;
  requestsPerSecond: string;
  responseTimeStats: {
    avg: number;
    min: number;
    max: number;
    p50: number;
    p95: number;
    p99: number;
  };
  statusCodes: Record<string, number>;
  scenarios: Record<string, {
    total: number;
    success: number;
    failed: number;
  }>;
  isRunning: boolean;
  elapsed: number;
}

interface TestConfig {
  baseUrl: string;
  concurrentUsers: number;
  durationSeconds: number;
  rampUpSeconds: number;
}

export default function LoadTestPage() {
  const [testId, setTestId] = useState<string | null>(null);
  const [stats, setStats] = useState<TestStats | null>(null);
  const [isRunning, setIsRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [config, setConfig] = useState<TestConfig>({
    baseUrl: typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000',
    concurrentUsers: 200,
    durationSeconds: 300,
    rampUpSeconds: 60,
  });
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    // Cleanup on unmount
    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, []);

  useEffect(() => {
    // Poll for stats if test is running
    if (isRunning && testId) {
      intervalRef.current = setInterval(async () => {
        try {
          const response = await fetch(`/api/load-test/status?testId=${testId}`);
          const data = await response.json();
          
          if (data.stats) {
            setStats(data.stats);
            
            // Check if test finished
            if (!data.stats.isRunning) {
              setIsRunning(false);
              if (intervalRef.current) {
                clearInterval(intervalRef.current);
              }
            }
          }
        } catch (err) {
          console.error('Error fetching stats:', err);
        }
      }, 2000); // Poll every 2 seconds
    } else {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    }

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [isRunning, testId]);

  const startTest = async () => {
    try {
      setError(null);
      
      const response = await fetch('/api/load-test/start', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...config,
          testId: `test-${Date.now()}`,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to start test');
      }

      setTestId(data.testId);
      setIsRunning(true);
      
      // Fetch initial stats
      setTimeout(async () => {
        try {
          const statusResponse = await fetch(`/api/load-test/status?testId=${data.testId}`);
          const statusData = await statusResponse.json();
          if (statusData.stats) {
            setStats(statusData.stats);
          }
        } catch (err) {
          console.error('Error fetching initial stats:', err);
        }
      }, 1000);
    } catch (err: any) {
      setError(err.message || 'Failed to start load test');
      setIsRunning(false);
    }
  };

  const stopTest = async () => {
    if (!testId) return;

    try {
      const response = await fetch('/api/load-test/stop', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ testId }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to stop test');
      }

      setIsRunning(false);
      if (data.stats) {
        setStats(data.stats);
      }
    } catch (err: any) {
      setError(err.message || 'Failed to stop load test');
    }
  };

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs.toString().padStart(2, '0')}`;
  };

  const getStatusColor = (value: number, thresholds: { good: number; warn: number }) => {
    if (value <= thresholds.good) return 'text-green-600';
    if (value <= thresholds.warn) return 'text-yellow-600';
    return 'text-red-600';
  };

  return (
    <div className="container mx-auto px-4 py-8 max-w-6xl">
      <h1 className="text-3xl font-bold mb-6">Load Test Dashboard</h1>

      {/* Configuration */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6 mb-6">
        <h2 className="text-xl font-semibold mb-4">Configuration</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium mb-2">Base URL</label>
            <input
              type="text"
              value={config.baseUrl}
              onChange={(e) => setConfig({ ...config, baseUrl: e.target.value })}
              disabled={isRunning}
              className="w-full px-3 py-2 border rounded-md dark:bg-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Concurrent Users</label>
            <input
              type="number"
              value={config.concurrentUsers}
              onChange={(e) => setConfig({ ...config, concurrentUsers: parseInt(e.target.value) || 200 })}
              disabled={isRunning}
              className="w-full px-3 py-2 border rounded-md dark:bg-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Duration (seconds)</label>
            <input
              type="number"
              value={config.durationSeconds}
              onChange={(e) => setConfig({ ...config, durationSeconds: parseInt(e.target.value) || 300 })}
              disabled={isRunning}
              className="w-full px-3 py-2 border rounded-md dark:bg-gray-700"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-2">Ramp Up (seconds)</label>
            <input
              type="number"
              value={config.rampUpSeconds}
              onChange={(e) => setConfig({ ...config, rampUpSeconds: parseInt(e.target.value) || 60 })}
              disabled={isRunning}
              className="w-full px-3 py-2 border rounded-md dark:bg-gray-700"
            />
          </div>
        </div>
        <div className="mt-4 flex gap-2">
          <button
            onClick={startTest}
            disabled={isRunning}
            className="px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Start Test
          </button>
          <button
            onClick={stopTest}
            disabled={!isRunning}
            className="px-4 py-2 bg-red-600 text-white rounded hover:bg-red-700 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Stop Test
          </button>
        </div>
        {error && (
          <div className="mt-4 p-3 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-200 rounded">
            {error}
          </div>
        )}
      </div>

      {/* Status */}
      {stats && (
        <div className="space-y-6">
          {/* Overview */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Overview</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Status</div>
                <div className={`text-2xl font-bold ${isRunning ? 'text-green-600' : 'text-gray-600'}`}>
                  {isRunning ? 'Running' : 'Stopped'}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Elapsed</div>
                <div className="text-2xl font-bold">{formatTime(stats.elapsed)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Total Requests</div>
                <div className="text-2xl font-bold">{stats.totalRequests.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Requests/sec</div>
                <div className="text-2xl font-bold">{stats.requestsPerSecond}</div>
              </div>
            </div>
          </div>

          {/* Response Times */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Response Times (ms)</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Average</div>
                <div className={`text-2xl font-bold ${getStatusColor(stats.responseTimeStats.avg, { good: 500, warn: 1000 })}`}>
                  {stats.responseTimeStats.avg.toFixed(0)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Min</div>
                <div className="text-2xl font-bold text-green-600">{stats.responseTimeStats.min.toFixed(0)}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">P95</div>
                <div className={`text-2xl font-bold ${getStatusColor(stats.responseTimeStats.p95, { good: 1000, warn: 2000 })}`}>
                  {stats.responseTimeStats.p95.toFixed(0)}
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">P99</div>
                <div className={`text-2xl font-bold ${getStatusColor(stats.responseTimeStats.p99, { good: 2000, warn: 5000 })}`}>
                  {stats.responseTimeStats.p99.toFixed(0)}
                </div>
              </div>
            </div>
          </div>

          {/* Success/Error Rates */}
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
            <h2 className="text-xl font-semibold mb-4">Success & Error Rates</h2>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Success Rate</div>
                <div className={`text-2xl font-bold ${parseFloat(stats.successRate) >= 95 ? 'text-green-600' : parseFloat(stats.successRate) >= 90 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {stats.successRate}%
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Error Rate</div>
                <div className={`text-2xl font-bold ${parseFloat(stats.errorRate) <= 1 ? 'text-green-600' : parseFloat(stats.errorRate) <= 5 ? 'text-yellow-600' : 'text-red-600'}`}>
                  {stats.errorRate}%
                </div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Successful</div>
                <div className="text-2xl font-bold text-green-600">{stats.successfulRequests.toLocaleString()}</div>
              </div>
              <div>
                <div className="text-sm text-gray-600 dark:text-gray-400">Failed</div>
                <div className="text-2xl font-bold text-red-600">{stats.failedRequests.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Status Codes */}
          {stats.statusCodes && Object.keys(stats.statusCodes).length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Status Codes</h2>
              <div className="grid grid-cols-4 md:grid-cols-8 gap-4">
                {Object.entries(stats.statusCodes)
                  .sort(([a], [b]) => parseInt(a) - parseInt(b))
                  .map(([code, count]) => (
                    <div key={code}>
                      <div className="text-sm text-gray-600 dark:text-gray-400">{code}</div>
                      <div className={`text-xl font-bold ${
                        parseInt(code) >= 200 && parseInt(code) < 300 ? 'text-green-600' :
                        parseInt(code) >= 300 && parseInt(code) < 400 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {count.toLocaleString()}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          )}

          {/* Scenarios */}
          {stats.scenarios && Object.keys(stats.scenarios).length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h2 className="text-xl font-semibold mb-4">Scenarios</h2>
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left p-2">Scenario</th>
                      <th className="text-right p-2">Total</th>
                      <th className="text-right p-2">Success</th>
                      <th className="text-right p-2">Failed</th>
                      <th className="text-right p-2">Success Rate</th>
                    </tr>
                  </thead>
                  <tbody>
                    {Object.entries(stats.scenarios).map(([name, scenario]) => (
                      <tr key={name} className="border-b">
                        <td className="p-2 font-mono text-sm">{name}</td>
                        <td className="text-right p-2">{scenario.total.toLocaleString()}</td>
                        <td className="text-right p-2 text-green-600">{scenario.success.toLocaleString()}</td>
                        <td className="text-right p-2 text-red-600">{scenario.failed.toLocaleString()}</td>
                        <td className="text-right p-2">
                          {scenario.total > 0 
                            ? ((scenario.success / scenario.total) * 100).toFixed(1)
                            : '0.0'
                          }%
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Empty State */}
      {!stats && !isRunning && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-12 text-center">
          <p className="text-gray-600 dark:text-gray-400">
            No test running. Configure and start a load test to see results here.
          </p>
        </div>
      )}
    </div>
  );
}