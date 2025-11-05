import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// Custom metrics
const errorRate = new Rate('errors');
const responseTime = new Trend('response_time');
const requestCount = new Counter('requests');

// Configuration
export const options = {
  stages: [
    { duration: '30s', target: 50 },   // Ramp up to 50 users
    { duration: '1m', target: 100 },   // Ramp up to 100 users
    { duration: '1m', target: 200 },   // Ramp up to 200 users
    { duration: '5m', target: 200 },  // Stay at 200 users for 5 minutes
    { duration: '30s', target: 0 },   // Ramp down
  ],
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'], // 95% < 2s, 99% < 5s
    http_req_failed: ['rate<0.05'],                   // Error rate < 5%
    errors: ['rate<0.05'],
  },
};

// Base URL - change this to your app URL
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';

// Test user credentials (for authenticated endpoints)
// In real scenario, you'd generate these dynamically
const TEST_USERS = JSON.parse(__ENV.TEST_USERS || '[]');

export default function () {
  const userIndex = __VU % (TEST_USERS.length || 1);
  const user = TEST_USERS[userIndex] || null;
  
  // Scenario 1: Homepage (public)
  let res = http.get(`${BASE_URL}/`);
  check(res, {
    'homepage status 200': (r) => r.status === 200,
    'homepage response time < 2s': (r) => r.timings.duration < 2000,
  }) || errorRate.add(1);
  responseTime.add(res.timings.duration);
  requestCount.add(1);
  sleep(Math.random() * 2 + 1);

  // Scenario 2: Ping endpoint (health check)
  res = http.get(`${BASE_URL}/api/ping`);
  check(res, {
    'ping status 200': (r) => r.status === 200,
    'ping response ok': (r) => JSON.parse(r.body).ok === true,
  }) || errorRate.add(1);
  responseTime.add(res.timings.duration);
  requestCount.add(1);
  sleep(Math.random() * 1 + 0.5);

  // Scenario 3: Search (public)
  const searchQueries = ['test', 'user', 'post', 'hello', 'world'];
  const query = searchQueries[Math.floor(Math.random() * searchQueries.length)];
  res = http.get(`${BASE_URL}/api/search?q=${query}&limit=10`);
  check(res, {
    'search status 200': (r) => r.status === 200,
    'search returns data': (r) => {
      const body = JSON.parse(r.body);
      return body.people !== undefined && body.posts !== undefined;
    },
  }) || errorRate.add(1);
  responseTime.add(res.timings.duration);
  requestCount.add(1);
  sleep(Math.random() * 2 + 1);

  // Scenario 4: Authenticated endpoints (if user available)
  if (user && user.token) {
    const headers = {
      'Authorization': `Bearer ${user.token}`,
      'Content-Type': 'application/json',
    };

    // Feed page
    res = http.get(`${BASE_URL}/feed`, { headers });
    check(res, {
      'feed page accessible': (r) => r.status === 200 || r.status === 302,
    }) || errorRate.add(1);
    responseTime.add(res.timings.duration);
    requestCount.add(1);
    sleep(Math.random() * 2 + 1);

    // Profile page
    res = http.get(`${BASE_URL}/profile`, { headers });
    check(res, {
      'profile page accessible': (r) => r.status === 200 || r.status === 302,
    }) || errorRate.add(1);
    responseTime.add(res.timings.duration);
    requestCount.add(1);
    sleep(Math.random() * 2 + 1);

    // DMs threads list
    res = http.get(`${BASE_URL}/api/dms/threads.list`, { headers });
    check(res, {
      'threads list status 200': (r) => r.status === 200,
      'threads list returns data': (r) => {
        const body = JSON.parse(r.body);
        return body.ok !== undefined || body.threads !== undefined;
      },
    }) || errorRate.add(1);
    responseTime.add(res.timings.duration);
    requestCount.add(1);
    sleep(Math.random() * 1 + 0.5);

    // Growth directions
    res = http.get(`${BASE_URL}/api/growth/directions.list`, { headers });
    check(res, {
      'directions list status 200': (r) => r.status === 200,
    }) || errorRate.add(1);
    responseTime.add(res.timings.duration);
    requestCount.add(1);
    sleep(Math.random() * 2 + 1);
  }

  // Random sleep between 1-3 seconds to simulate real user behavior
  sleep(Math.random() * 2 + 1);
}

export function handleSummary(data) {
  // Save detailed results to JSON file
  const summary = {
    timestamp: new Date().toISOString(),
    metrics: {
      requests: data.metrics.requests?.values || {},
      errors: data.metrics.errors?.values || {},
      responseTime: data.metrics.response_time?.values || {},
      httpReqs: data.metrics.http_reqs?.values || {},
      httpReqFailed: data.metrics.http_req_failed?.values || {},
      httpReqDuration: data.metrics.http_req_duration?.values || {},
    },
    summary: {
      totalRequests: data.metrics.requests?.values?.count || 0,
      errorRate: ((data.metrics.errors?.values?.rate || 0) * 100).toFixed(2) + '%',
      avgResponseTime: (data.metrics.response_time?.values?.avg || 0).toFixed(2) + 'ms',
      p95ResponseTime: (data.metrics.response_time?.values?.['p(95)'] || 0).toFixed(2) + 'ms',
      p99ResponseTime: (data.metrics.response_time?.values?.['p(99)'] || 0).toFixed(2) + 'ms',
    },
  };

  return {
    'load-test-results.json': JSON.stringify(data, null, 2),
    'stdout': JSON.stringify(summary.summary, null, 2),
  };
}