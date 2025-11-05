/**
 * Load Test Engine
 * Modular version for API usage
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Search queries for testing
const SEARCH_QUERIES = ['test', 'user', 'post', 'hello', 'world', 'message', 'profile'];

/**
 * Make HTTP request
 */
function makeRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const urlObj = new URL(url);
    const isHttps = urlObj.protocol === 'https:';
    const client = isHttps ? https : http;
    
    const requestOptions = {
      hostname: urlObj.hostname,
      port: urlObj.port || (isHttps ? 443 : 80),
      path: urlObj.pathname + urlObj.search,
      method: options.method || 'GET',
      headers: {
        'User-Agent': 'LoadTest/1.0',
        ...options.headers,
      },
    };

    const startTime = Date.now();
    const req = client.request(requestOptions, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        const duration = Date.now() - startTime;
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: data,
          duration,
        });
      });
    });

    req.on('error', (error) => {
      reject(error);
    });

    if (options.body) {
      req.write(options.body);
    }

    req.setTimeout(options.timeout || 10000, () => {
      req.destroy();
      reject(new Error('Request timeout'));
    });

    req.end();
  });
}

/**
 * Test scenario: Homepage
 */
async function testHomepage(baseUrl, onStats) {
  try {
    const result = await makeRequest(`${baseUrl}/`);
    const stats = {
      success: result.statusCode >= 200 && result.statusCode < 300,
      duration: result.duration,
      statusCode: result.statusCode,
      scenario: 'homepage',
    };
    if (onStats) onStats(stats);
    return stats;
  } catch (error) {
    const stats = {
      success: false,
      duration: 0,
      error: error.message,
      scenario: 'homepage',
    };
    if (onStats) onStats(stats);
    return stats;
  }
}

/**
 * Test scenario: Ping endpoint
 */
async function testPing(baseUrl, onStats) {
  try {
    const result = await makeRequest(`${baseUrl}/api/ping`);
    const body = JSON.parse(result.body || '{}');
    const success = result.statusCode === 200 && body.ok;
    const stats = {
      success,
      duration: result.duration,
      statusCode: result.statusCode,
      scenario: 'ping',
    };
    if (onStats) onStats(stats);
    return stats;
  } catch (error) {
    const stats = {
      success: false,
      duration: 0,
      error: error.message,
      scenario: 'ping',
    };
    if (onStats) onStats(stats);
    return stats;
  }
}

/**
 * Test scenario: Search
 */
async function testSearch(baseUrl, onStats) {
  try {
    const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
    const result = await makeRequest(`${baseUrl}/api/search?q=${encodeURIComponent(query)}&limit=10`);
    const body = JSON.parse(result.body || '{}');
    const success = result.statusCode === 200 && body.people !== undefined && body.posts !== undefined;
    const stats = {
      success,
      duration: result.duration,
      statusCode: result.statusCode,
      scenario: 'search',
    };
    if (onStats) onStats(stats);
    return stats;
  } catch (error) {
    const stats = {
      success: false,
      duration: 0,
      error: error.message,
      scenario: 'search',
    };
    if (onStats) onStats(stats);
    return stats;
  }
}

/**
 * Test scenario: Authenticated endpoint
 */
async function testAuthenticatedEndpoint(baseUrl, endpoint, token, onStats) {
  try {
    const result = await makeRequest(`${baseUrl}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    const stats = {
      success: result.statusCode >= 200 && result.statusCode < 300,
      duration: result.duration,
      statusCode: result.statusCode,
      scenario: endpoint,
    };
    if (onStats) onStats(stats);
    return stats;
  } catch (error) {
    const stats = {
      success: false,
      duration: 0,
      error: error.message,
      scenario: endpoint,
    };
    if (onStats) onStats(stats);
    return stats;
  }
}

/**
 * Load Test Engine
 */
class LoadTestEngine {
  constructor(config) {
    this.config = {
      baseUrl: config.baseUrl || 'http://localhost:3000',
      concurrentUsers: config.concurrentUsers || 200,
      durationSeconds: config.durationSeconds || 300,
      rampUpSeconds: config.rampUpSeconds || 60,
      testUsers: config.testUsers || [],
      onUpdate: config.onUpdate || null,
    };
    
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      errors: 0,
      responseTimes: [],
      statusCodes: {},
      startTime: null,
      endTime: null,
      scenarios: {},
    };
    
    this.isRunning = false;
    this.shouldStop = false;
    this.userPromises = [];
  }

  /**
   * Update statistics
   */
  updateStats(stats) {
    this.stats.totalRequests++;
    this.stats.responseTimes.push(stats.duration);
    this.stats.statusCodes[stats.statusCode] = (this.stats.statusCodes[stats.statusCode] || 0) + 1;
    
    if (!this.stats.scenarios[stats.scenario]) {
      this.stats.scenarios[stats.scenario] = {
        total: 0,
        success: 0,
        failed: 0,
        responseTimes: [],
      };
    }
    
    const scenarioStats = this.stats.scenarios[stats.scenario];
    scenarioStats.total++;
    scenarioStats.responseTimes.push(stats.duration);
    
    if (stats.success) {
      this.stats.successfulRequests++;
      scenarioStats.success++;
    } else {
      this.stats.failedRequests++;
      scenarioStats.failed++;
      if (stats.error) {
        this.stats.errors++;
      }
    }
    
    // Notify listener
    if (this.config.onUpdate) {
      this.config.onUpdate(this.getStats());
    }
  }

  /**
   * Get current statistics
   */
  getStats() {
    const responseTimes = this.stats.responseTimes.sort((a, b) => a - b);
    const count = responseTimes.length;
    
    let responseTimeStats = {
      avg: 0,
      min: 0,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    };
    
    if (count > 0) {
      responseTimeStats = {
        avg: responseTimes.reduce((a, b) => a + b, 0) / count,
        min: responseTimes[0],
        max: responseTimes[count - 1],
        p50: responseTimes[Math.floor(count * 0.5)],
        p95: responseTimes[Math.floor(count * 0.95)],
        p99: responseTimes[Math.floor(count * 0.99)],
      };
    }
    
    const duration = this.stats.startTime 
      ? (Date.now() - this.stats.startTime) / 1000
      : 0;
    
    const successRate = this.stats.totalRequests > 0 
      ? (this.stats.successfulRequests / this.stats.totalRequests) * 100
      : 0;
    
    const errorRate = this.stats.totalRequests > 0
      ? (this.stats.failedRequests / this.stats.totalRequests) * 100
      : 0;
    
    const requestsPerSecond = duration > 0
      ? this.stats.totalRequests / duration
      : 0;
    
    return {
      ...this.stats,
      duration,
      successRate: successRate.toFixed(2),
      errorRate: errorRate.toFixed(2),
      requestsPerSecond: requestsPerSecond.toFixed(2),
      responseTimeStats,
      isRunning: this.isRunning,
      elapsed: duration,
    };
  }

  /**
   * User simulation loop
   */
  async simulateUser(userId, userConfig = null) {
    const scenarios = [
      { name: 'homepage', fn: () => testHomepage(this.config.baseUrl, (s) => this.updateStats(s)) },
      { name: 'ping', fn: () => testPing(this.config.baseUrl, (s) => this.updateStats(s)) },
      { name: 'search', fn: () => testSearch(this.config.baseUrl, (s) => this.updateStats(s)) },
    ];

    // Add authenticated scenarios if user token available
    if (userConfig && userConfig.token) {
      scenarios.push(
        { name: 'feed', fn: () => testAuthenticatedEndpoint(this.config.baseUrl, '/feed', userConfig.token, (s) => this.updateStats(s)) },
        { name: 'dms_threads', fn: () => testAuthenticatedEndpoint(this.config.baseUrl, '/api/dms/threads.list', userConfig.token, (s) => this.updateStats(s)) },
        { name: 'directions', fn: () => testAuthenticatedEndpoint(this.config.baseUrl, '/api/growth/directions.list', userConfig.token, (s) => this.updateStats(s)) },
      );
    }

    const startTime = Date.now();
    const endTime = startTime + (this.config.durationSeconds * 1000);

    while (Date.now() < endTime && !this.shouldStop) {
      // Pick random scenario
      const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
      
      try {
        await scenario.fn();
      } catch (error) {
        this.updateStats({
          success: false,
          duration: 0,
          error: error.message,
          scenario: scenario.name,
          statusCode: 0,
        });
      }

      // Random delay between requests (1-3 seconds)
      const delay = Math.random() * 2000 + 1000;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }

  /**
   * Ramp up users gradually
   */
  async rampUpUsers() {
    const usersPerSecond = this.config.concurrentUsers / this.config.rampUpSeconds;
    this.userPromises = [];
    
    for (let i = 0; i < this.config.concurrentUsers; i++) {
      if (this.shouldStop) break;
      
      const userIndex = i % (this.config.testUsers.length || 1);
      const userConfig = this.config.testUsers[userIndex] || null;
      
      this.userPromises.push(this.simulateUser(i, userConfig));
      
      // Ramp up gradually
      if (i < this.config.concurrentUsers - 1) {
        const delay = 1000 / usersPerSecond;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  /**
   * Start load test
   */
  async start() {
    if (this.isRunning) {
      throw new Error('Load test is already running');
    }
    
    this.isRunning = true;
    this.shouldStop = false;
    this.stats.startTime = Date.now();
    this.stats.endTime = null;
    
    // Reset stats
    this.stats = {
      totalRequests: 0,
      successfulRequests: 0,
      failedRequests: 0,
      errors: 0,
      responseTimes: [],
      statusCodes: {},
      startTime: this.stats.startTime,
      endTime: null,
      scenarios: {},
    };
    
    try {
      // Ramp up users
      await this.rampUpUsers();
      
      // Wait for all users to complete or stop signal
      await Promise.all(this.userPromises);
    } catch (error) {
      console.error('Load test error:', error);
      throw error;
    } finally {
      this.stats.endTime = Date.now();
      this.isRunning = false;
      
      if (this.config.onUpdate) {
        this.config.onUpdate(this.getStats());
      }
    }
  }

  /**
   * Stop load test
   */
  stop() {
    this.shouldStop = true;
    this.isRunning = false;
  }
}

module.exports = LoadTestEngine;