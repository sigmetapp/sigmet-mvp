#!/usr/bin/env node

/**
 * Node.js Load Test Script
 * Simulates 200 concurrent users hitting the application
 */

const https = require('https');
const http = require('http');
const { URL } = require('url');

// Configuration
const CONFIG = {
  BASE_URL: process.env.BASE_URL || 'http://localhost:3000',
  CONCURRENT_USERS: parseInt(process.env.CONCURRENT_USERS || '200', 10),
  DURATION_SECONDS: parseInt(process.env.DURATION_SECONDS || '300', 10), // 5 minutes
  RAMP_UP_SECONDS: parseInt(process.env.RAMP_UP_SECONDS || '60', 10),
  REQUEST_INTERVAL_MS: parseInt(process.env.REQUEST_INTERVAL_MS || '2000', 10),
  TEST_USERS: JSON.parse(process.env.TEST_USERS || '[]'),
};

// Statistics
const stats = {
  totalRequests: 0,
  successfulRequests: 0,
  failedRequests: 0,
  errors: 0,
  responseTimes: [],
  statusCodes: {},
  startTime: null,
  endTime: null,
};

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
async function testHomepage() {
  try {
    const result = await makeRequest(`${CONFIG.BASE_URL}/`);
    stats.totalRequests++;
    stats.responseTimes.push(result.duration);
    stats.statusCodes[result.statusCode] = (stats.statusCodes[result.statusCode] || 0) + 1;
    
    if (result.statusCode >= 200 && result.statusCode < 300) {
      stats.successfulRequests++;
      return { success: true, duration: result.duration };
    } else {
      stats.failedRequests++;
      return { success: false, duration: result.duration, statusCode: result.statusCode };
    }
  } catch (error) {
    stats.totalRequests++;
    stats.errors++;
    stats.failedRequests++;
    return { success: false, error: error.message };
  }
}

/**
 * Test scenario: Ping endpoint
 */
async function testPing() {
  try {
    const result = await makeRequest(`${CONFIG.BASE_URL}/api/ping`);
    stats.totalRequests++;
    stats.responseTimes.push(result.duration);
    stats.statusCodes[result.statusCode] = (stats.statusCodes[result.statusCode] || 0) + 1;
    
    const body = JSON.parse(result.body || '{}');
    if (result.statusCode === 200 && body.ok) {
      stats.successfulRequests++;
      return { success: true, duration: result.duration };
    } else {
      stats.failedRequests++;
      return { success: false, duration: result.duration };
    }
  } catch (error) {
    stats.totalRequests++;
    stats.errors++;
    stats.failedRequests++;
    return { success: false, error: error.message };
  }
}

/**
 * Test scenario: Search
 */
async function testSearch() {
  try {
    const query = SEARCH_QUERIES[Math.floor(Math.random() * SEARCH_QUERIES.length)];
    const result = await makeRequest(`${CONFIG.BASE_URL}/api/search?q=${encodeURIComponent(query)}&limit=10`);
    stats.totalRequests++;
    stats.responseTimes.push(result.duration);
    stats.statusCodes[result.statusCode] = (stats.statusCodes[result.statusCode] || 0) + 1;
    
    if (result.statusCode === 200) {
      const body = JSON.parse(result.body || '{}');
      if (body.people !== undefined && body.posts !== undefined) {
        stats.successfulRequests++;
        return { success: true, duration: result.duration };
      }
    }
    stats.failedRequests++;
    return { success: false, duration: result.duration };
  } catch (error) {
    stats.totalRequests++;
    stats.errors++;
    stats.failedRequests++;
    return { success: false, error: error.message };
  }
}

/**
 * Test scenario: Authenticated endpoint
 */
async function testAuthenticatedEndpoint(endpoint, token) {
  try {
    const result = await makeRequest(`${CONFIG.BASE_URL}${endpoint}`, {
      headers: {
        'Authorization': `Bearer ${token}`,
      },
    });
    stats.totalRequests++;
    stats.responseTimes.push(result.duration);
    stats.statusCodes[result.statusCode] = (stats.statusCodes[result.statusCode] || 0) + 1;
    
    if (result.statusCode >= 200 && result.statusCode < 300) {
      stats.successfulRequests++;
      return { success: true, duration: result.duration };
    } else {
      stats.failedRequests++;
      return { success: false, duration: result.duration };
    }
  } catch (error) {
    stats.totalRequests++;
    stats.errors++;
    stats.failedRequests++;
    return { success: false, error: error.message };
  }
}

/**
 * User simulation loop
 */
async function simulateUser(userId, userConfig = null) {
  const scenarios = [
    { name: 'homepage', fn: testHomepage },
    { name: 'ping', fn: testPing },
    { name: 'search', fn: testSearch },
  ];

  // Add authenticated scenarios if user token available
  if (userConfig && userConfig.token) {
    scenarios.push(
      { name: 'feed', fn: () => testAuthenticatedEndpoint('/feed', userConfig.token) },
      { name: 'dms_threads', fn: () => testAuthenticatedEndpoint('/api/dms/threads.list', userConfig.token) },
      { name: 'directions', fn: () => testAuthenticatedEndpoint('/api/growth/directions.list', userConfig.token) },
    );
  }

  const startTime = Date.now();
  const endTime = startTime + (CONFIG.DURATION_SECONDS * 1000);

  while (Date.now() < endTime) {
    // Pick random scenario
    const scenario = scenarios[Math.floor(Math.random() * scenarios.length)];
    
    try {
      await scenario.fn();
    } catch (error) {
      console.error(`[User ${userId}] Error in ${scenario.name}:`, error.message);
    }

    // Random delay between requests (1-3 seconds)
    const delay = Math.random() * 2000 + 1000;
    await new Promise(resolve => setTimeout(resolve, delay));
  }
}

/**
 * Calculate statistics
 */
function calculateStats() {
  const responseTimes = stats.responseTimes.sort((a, b) => a - b);
  const count = responseTimes.length;
  
  if (count === 0) {
    return {
      avg: 0,
      min: 0,
      max: 0,
      p50: 0,
      p95: 0,
      p99: 0,
    };
  }

  return {
    avg: responseTimes.reduce((a, b) => a + b, 0) / count,
    min: responseTimes[0],
    max: responseTimes[count - 1],
    p50: responseTimes[Math.floor(count * 0.5)],
    p95: responseTimes[Math.floor(count * 0.95)],
    p99: responseTimes[Math.floor(count * 0.99)],
  };
}

/**
 * Print statistics
 */
function printStats() {
  const duration = (stats.endTime - stats.startTime) / 1000;
  const responseTimeStats = calculateStats();
  const successRate = stats.totalRequests > 0 
    ? ((stats.successfulRequests / stats.totalRequests) * 100).toFixed(2)
    : 0;
  const errorRate = stats.totalRequests > 0
    ? ((stats.failedRequests / stats.totalRequests) * 100).toFixed(2)
    : 0;
  const requestsPerSecond = (stats.totalRequests / duration).toFixed(2);

  console.log('\n' + '='.repeat(60));
  console.log('LOAD TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`Duration: ${duration.toFixed(2)}s`);
  console.log(`Concurrent Users: ${CONFIG.CONCURRENT_USERS}`);
  console.log(`Total Requests: ${stats.totalRequests}`);
  console.log(`Requests/sec: ${requestsPerSecond}`);
  console.log(`Successful: ${stats.successfulRequests} (${successRate}%)`);
  console.log(`Failed: ${stats.failedRequests} (${errorRate}%)`);
  console.log(`Errors: ${stats.errors}`);
  console.log('\nResponse Times:');
  console.log(`  Average: ${responseTimeStats.avg.toFixed(2)}ms`);
  console.log(`  Min: ${responseTimeStats.min.toFixed(2)}ms`);
  console.log(`  Max: ${responseTimeStats.max.toFixed(2)}ms`);
  console.log(`  P50: ${responseTimeStats.p50.toFixed(2)}ms`);
  console.log(`  P95: ${responseTimeStats.p95.toFixed(2)}ms`);
  console.log(`  P99: ${responseTimeStats.p99.toFixed(2)}ms`);
  console.log('\nStatus Codes:');
  Object.entries(stats.statusCodes)
    .sort(([a], [b]) => parseInt(a) - parseInt(b))
    .forEach(([code, count]) => {
      console.log(`  ${code}: ${count}`);
    });
  console.log('='.repeat(60) + '\n');

  // Check for bottlenecks
  if (responseTimeStats.p95 > 2000) {
    console.warn('⚠️  WARNING: P95 response time > 2s - potential performance issue');
  }
  if (errorRate > 5) {
    console.warn('⚠️  WARNING: Error rate > 5% - potential stability issue');
  }
  if (responseTimeStats.avg > 1000) {
    console.warn('⚠️  WARNING: Average response time > 1s - system may be overloaded');
  }
}

/**
 * Ramp up users gradually
 */
async function rampUpUsers() {
  const usersPerSecond = CONFIG.CONCURRENT_USERS / CONFIG.RAMP_UP_SECONDS;
  const users = [];
  
  for (let i = 0; i < CONFIG.CONCURRENT_USERS; i++) {
    const userIndex = i % (CONFIG.TEST_USERS.length || 1);
    const userConfig = CONFIG.TEST_USERS[userIndex] || null;
    
    users.push(simulateUser(i, userConfig));
    
    // Ramp up gradually
    if (i < CONFIG.CONCURRENT_USERS - 1) {
      const delay = 1000 / usersPerSecond;
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  return users;
}

/**
 * Main function
 */
async function main() {
  console.log('Starting load test...');
  console.log(`Target URL: ${CONFIG.BASE_URL}`);
  console.log(`Concurrent Users: ${CONFIG.CONCURRENT_USERS}`);
  console.log(`Duration: ${CONFIG.DURATION_SECONDS}s`);
  console.log(`Ramp up: ${CONFIG.RAMP_UP_SECONDS}s\n`);

  stats.startTime = Date.now();

  // Ramp up users
  console.log('Ramping up users...');
  const userPromises = await rampUpUsers();
  console.log(`All ${CONFIG.CONCURRENT_USERS} users started\n`);

  // Wait for all users to complete
  await Promise.all(userPromises);

  stats.endTime = Date.now();
  
  // Print results
  printStats();
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('Unhandled rejection:', error);
  process.exit(1);
});

// Run the test
main().catch((error) => {
  console.error('Load test failed:', error);
  process.exit(1);
});