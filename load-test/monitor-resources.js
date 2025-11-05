#!/usr/bin/env node

/**
 * Resource Monitoring Script
 * Monitors CPU, memory, and network usage during load testing
 */

const os = require('os');
const fs = require('fs');
const { exec } = require('child_process');
const { promisify } = require('util');

const execAsync = promisify(exec);

// Configuration
const CONFIG = {
  INTERVAL_MS: parseInt(process.env.MONITOR_INTERVAL_MS || '5000', 10), // 5 seconds
  OUTPUT_FILE: process.env.MONITOR_OUTPUT || 'load-test-resources.json',
  DURATION_SECONDS: parseInt(process.env.MONITOR_DURATION_SECONDS || '600', 10), // 10 minutes default
};

// Statistics
const metrics = {
  startTime: Date.now(),
  samples: [],
  summary: {
    cpu: { min: Infinity, max: 0, avg: 0 },
    memory: { min: Infinity, max: 0, avg: 0 },
    network: { bytesRead: 0, bytesWritten: 0 },
  },
};

/**
 * Get CPU usage percentage
 */
async function getCpuUsage() {
  try {
    const cpus = os.cpus();
    let totalIdle = 0;
    let totalTick = 0;

    for (const cpu of cpus) {
      for (const type in cpu.times) {
        totalTick += cpu.times[type];
      }
      totalIdle += cpu.times.idle;
    }

    const idle = totalIdle / cpus.length;
    const total = totalTick / cpus.length;
    const usage = 100 - ~~(100 * idle / total);
    
    return Math.max(0, Math.min(100, usage));
  } catch (error) {
    console.error('Error getting CPU usage:', error);
    return 0;
  }
}

/**
 * Get memory usage
 */
function getMemoryUsage() {
  const totalMemory = os.totalmem();
  const freeMemory = os.freemem();
  const usedMemory = totalMemory - freeMemory;
  const usagePercent = (usedMemory / totalMemory) * 100;

  return {
    total: totalMemory,
    free: freeMemory,
    used: usedMemory,
    percent: usagePercent,
  };
}

/**
 * Get network statistics (Linux only)
 */
async function getNetworkStats() {
  try {
    if (process.platform !== 'linux') {
      return { bytesRead: 0, bytesWritten: 0 };
    }

    const { stdout } = await execAsync('cat /proc/net/sockstat');
    // Parse network stats if available
    // This is a simplified version - you may need to adjust based on your needs
    
    return { bytesRead: 0, bytesWritten: 0 };
  } catch (error) {
    return { bytesRead: 0, bytesWritten: 0 };
  }
}

/**
 * Get process statistics (if monitoring a specific process)
 */
async function getProcessStats(processName = 'node') {
  try {
    if (process.platform === 'linux') {
      const { stdout } = await execAsync(`ps aux | grep ${processName} | grep -v grep | awk '{sum+=$3} END {print sum}'`);
      const cpu = parseFloat(stdout.trim()) || 0;
      
      const { stdout: memOut } = await execAsync(`ps aux | grep ${processName} | grep -v grep | awk '{sum+=$4} END {print sum}'`);
      const memory = parseFloat(memOut.trim()) || 0;
      
      return { cpu, memory };
    }
    return { cpu: 0, memory: 0 };
  } catch (error) {
    return { cpu: 0, memory: 0 };
  }
}

/**
 * Collect metrics
 */
async function collectMetrics() {
  const timestamp = Date.now();
  const cpu = await getCpuUsage();
  const memory = getMemoryUsage();
  const network = await getNetworkStats();
  const processStats = await getProcessStats('node');

  const sample = {
    timestamp,
    timeSinceStart: (timestamp - metrics.startTime) / 1000,
    cpu,
    memory: {
      total: memory.total,
      used: memory.used,
      free: memory.free,
      percent: memory.percent,
    },
    network,
    process: processStats,
    loadAverage: os.loadavg(),
  };

  metrics.samples.push(sample);

  // Update summary
  if (cpu < metrics.summary.cpu.min) metrics.summary.cpu.min = cpu;
  if (cpu > metrics.summary.cpu.max) metrics.summary.cpu.max = cpu;
  
  if (memory.percent < metrics.summary.memory.min) metrics.summary.memory.min = memory.percent;
  if (memory.percent > metrics.summary.memory.max) metrics.summary.memory.max = memory.percent;

  return sample;
}

/**
 * Calculate averages
 */
function calculateAverages() {
  if (metrics.samples.length === 0) return;

  const cpuSum = metrics.samples.reduce((sum, s) => sum + s.cpu, 0);
  const memorySum = metrics.samples.reduce((sum, s) => sum + s.memory.percent, 0);

  metrics.summary.cpu.avg = cpuSum / metrics.samples.length;
  metrics.summary.memory.avg = memorySum / metrics.samples.length;
}

/**
 * Print current metrics
 */
function printMetrics(sample) {
  const time = new Date(sample.timestamp).toISOString();
  console.log(`[${time}] CPU: ${sample.cpu.toFixed(1)}% | Memory: ${sample.memory.percent.toFixed(1)}% (${(sample.memory.used / 1024 / 1024 / 1024).toFixed(2)}GB) | Load: ${sample.loadAverage[0].toFixed(2)}`);
}

/**
 * Save results to file
 */
function saveResults() {
  calculateAverages();
  
  const results = {
    config: CONFIG,
    summary: {
      ...metrics.summary,
      duration: (Date.now() - metrics.startTime) / 1000,
      sampleCount: metrics.samples.length,
    },
    samples: metrics.samples,
    timestamp: new Date().toISOString(),
  };

  fs.writeFileSync(CONFIG.OUTPUT_FILE, JSON.stringify(results, null, 2));
  console.log(`\nResults saved to ${CONFIG.OUTPUT_FILE}`);
}

/**
 * Print summary
 */
function printSummary() {
  calculateAverages();
  
  console.log('\n' + '='.repeat(60));
  console.log('RESOURCE MONITORING SUMMARY');
  console.log('='.repeat(60));
  console.log(`Duration: ${((Date.now() - metrics.startTime) / 1000).toFixed(2)}s`);
  console.log(`Samples: ${metrics.samples.length}`);
  console.log('\nCPU Usage:');
  console.log(`  Min: ${metrics.summary.cpu.min.toFixed(1)}%`);
  console.log(`  Max: ${metrics.summary.cpu.max.toFixed(1)}%`);
  console.log(`  Avg: ${metrics.summary.cpu.avg.toFixed(1)}%`);
  console.log('\nMemory Usage:');
  console.log(`  Min: ${metrics.summary.memory.min.toFixed(1)}%`);
  console.log(`  Max: ${metrics.summary.memory.max.toFixed(1)}%`);
  console.log(`  Avg: ${metrics.summary.memory.avg.toFixed(1)}%`);
  
  // Check for issues
  if (metrics.summary.cpu.avg > 80) {
    console.warn('\n⚠️  WARNING: High CPU usage - system may be overloaded');
  }
  if (metrics.summary.memory.avg > 85) {
    console.warn('⚠️  WARNING: High memory usage - risk of OOM');
  }
  if (metrics.summary.cpu.max > 95) {
    console.warn('⚠️  WARNING: CPU peaked at >95% - system was severely overloaded');
  }
  
  console.log('='.repeat(60) + '\n');
}

/**
 * Main monitoring loop
 */
async function main() {
  console.log('Starting resource monitoring...');
  console.log(`Interval: ${CONFIG.INTERVAL_MS}ms`);
  console.log(`Duration: ${CONFIG.DURATION_SECONDS}s`);
  console.log(`Output file: ${CONFIG.OUTPUT_FILE}\n`);

  const endTime = Date.now() + (CONFIG.DURATION_SECONDS * 1000);

  // Initial sample
  const initialSample = await collectMetrics();
  printMetrics(initialSample);

  // Monitoring loop
  const interval = setInterval(async () => {
    if (Date.now() >= endTime) {
      clearInterval(interval);
      const finalSample = await collectMetrics();
      printMetrics(finalSample);
      printSummary();
      saveResults();
      process.exit(0);
    }

    const sample = await collectMetrics();
    printMetrics(sample);
  }, CONFIG.INTERVAL_MS);

  // Handle Ctrl+C
  process.on('SIGINT', () => {
    clearInterval(interval);
    printSummary();
    saveResults();
    process.exit(0);
  });
}

main().catch((error) => {
  console.error('Monitoring failed:', error);
  process.exit(1);
});