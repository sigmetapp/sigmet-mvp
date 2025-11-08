/**
 * Metrics and monitoring for DM system
 * Tracks connection count, message latency, error rates, etc.
 */

type MetricType = 'counter' | 'gauge' | 'histogram' | 'timer';

interface Metric {
  name: string;
  type: MetricType;
  value: number;
  labels?: Record<string, string>;
  timestamp: number;
}

class MetricsCollector {
  private static instance: MetricsCollector | null = null;
  private metrics: Map<string, Metric> = new Map();
  private counters: Map<string, number> = new Map();
  private gauges: Map<string, number> = new Map();
  private timers: Map<string, number[]> = new Map();

  static getInstance(): MetricsCollector {
    if (!MetricsCollector.instance) {
      MetricsCollector.instance = new MetricsCollector();
    }
    return MetricsCollector.instance;
  }

  /**
   * Increment counter
   */
  increment(name: string, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    const current = this.counters.get(key) || 0;
    this.counters.set(key, current + 1);
    this.recordMetric({
      name,
      type: 'counter',
      value: current + 1,
      labels,
      timestamp: Date.now(),
    });
  }

  /**
   * Set gauge value
   */
  setGauge(name: string, value: number, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    this.gauges.set(key, value);
    this.recordMetric({
      name,
      type: 'gauge',
      value,
      labels,
      timestamp: Date.now(),
    });
  }

  /**
   * Record timer (latency)
   */
  recordTimer(name: string, duration: number, labels?: Record<string, string>): void {
    const key = this.getKey(name, labels);
    const timers = this.timers.get(key) || [];
    timers.push(duration);
    // Keep only last 1000 measurements
    if (timers.length > 1000) {
      timers.shift();
    }
    this.timers.set(key, timers);

    // Calculate statistics
    const sorted = [...timers].sort((a, b) => a - b);
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    const avg = timers.reduce((a, b) => a + b, 0) / timers.length;

    this.recordMetric({
      name: `${name}_p50`,
      type: 'histogram',
      value: p50,
      labels,
      timestamp: Date.now(),
    });
    this.recordMetric({
      name: `${name}_p95`,
      type: 'histogram',
      value: p95,
      labels,
      timestamp: Date.now(),
    });
    this.recordMetric({
      name: `${name}_p99`,
      type: 'histogram',
      value: p99,
      labels,
      timestamp: Date.now(),
    });
    this.recordMetric({
      name: `${name}_avg`,
      type: 'histogram',
      value: avg,
      labels,
      timestamp: Date.now(),
    });
  }

  /**
   * Get counter value
   */
  getCounter(name: string, labels?: Record<string, string>): number {
    const key = this.getKey(name, labels);
    return this.counters.get(key) || 0;
  }

  /**
   * Get gauge value
   */
  getGauge(name: string, labels?: Record<string, string>): number {
    const key = this.getKey(name, labels);
    return this.gauges.get(key) || 0;
  }

  /**
   * Get timer statistics
   */
  getTimerStats(name: string, labels?: Record<string, string>): {
    count: number;
    avg: number;
    p50: number;
    p95: number;
    p99: number;
    min: number;
    max: number;
  } {
    const key = this.getKey(name, labels);
    const timers = this.timers.get(key) || [];
    
    if (timers.length === 0) {
      return { count: 0, avg: 0, p50: 0, p95: 0, p99: 0, min: 0, max: 0 };
    }

    const sorted = [...timers].sort((a, b) => a - b);
    const avg = timers.reduce((a, b) => a + b, 0) / timers.length;
    const p50 = sorted[Math.floor(sorted.length * 0.5)] || 0;
    const p95 = sorted[Math.floor(sorted.length * 0.95)] || 0;
    const p99 = sorted[Math.floor(sorted.length * 0.99)] || 0;
    const min = sorted[0] || 0;
    const max = sorted[sorted.length - 1] || 0;

    return { count: timers.length, avg, p50, p95, p99, min, max };
  }

  /**
   * Get all metrics
   */
  getAllMetrics(): Metric[] {
    return Array.from(this.metrics.values());
  }

  /**
   * Get metrics summary
   */
  getSummary(): {
    connections: number;
    messagesSent: number;
    messagesReceived: number;
    errors: number;
    messageLatency: { avg: number; p95: number; p99: number };
  } {
    return {
      connections: this.getGauge('dm.connections'),
      messagesSent: this.getCounter('dm.messages.sent'),
      messagesReceived: this.getCounter('dm.messages.received'),
      errors: this.getCounter('dm.errors'),
      messageLatency: this.getTimerStats('dm.message.latency'),
    };
  }

  /**
   * Reset metrics
   */
  reset(): void {
    this.metrics.clear();
    this.counters.clear();
    this.gauges.clear();
    this.timers.clear();
  }

  private recordMetric(metric: Metric): void {
    const key = this.getKey(metric.name, metric.labels);
    this.metrics.set(key, metric);
  }

  private getKey(name: string, labels?: Record<string, string>): string {
    if (!labels || Object.keys(labels).length === 0) {
      return name;
    }
    const labelStr = Object.entries(labels)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([k, v]) => `${k}=${v}`)
      .join(',');
    return `${name}{${labelStr}}`;
  }
}

// Export singleton instance
export const metrics = MetricsCollector.getInstance();

// Export convenience functions
export function incrementCounter(name: string, labels?: Record<string, string>): void {
  metrics.increment(name, labels);
}

export function setGauge(name: string, value: number, labels?: Record<string, string>): void {
  metrics.setGauge(name, value, labels);
}

export function recordTimer(name: string, duration: number, labels?: Record<string, string>): void {
  metrics.recordTimer(name, duration, labels);
}

export function getMetricsSummary() {
  return metrics.getSummary();
}
