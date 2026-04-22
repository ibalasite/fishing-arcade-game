/**
 * k6 Ramp-Up Stress Test
 *
 * Ramps VUs from 50 to 1000 across 19 minutes to find the system's
 * breaking point. All REST endpoints are tested proportionally.
 * Error rate > 1% triggers an automatic test failure.
 *
 * Stages:
 *   2m  warm-up   →  50 VUs
 *   5m  target    → 200 VUs
 *   5m  stress    → 500 VUs
 *   2m  peak      → 1000 VUs
 *   5m  cool-down →   0 VUs
 *
 * Run: k6 run tests/performance/k6-ramp-stress.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ---------- Custom metrics ----------
const loginLatency = new Trend('stress_login_latency', true);
const refreshLatency = new Trend('stress_refresh_latency', true);
const jackpotLatency = new Trend('stress_jackpot_latency', true);
const walletLatency = new Trend('stress_wallet_latency', true);
const profileLatency = new Trend('stress_profile_latency', true);
const overallErrorRate = new Rate('stress_error_rate');
const requestCount = new Counter('stress_request_count');
const serverErrorCount = new Counter('stress_server_error_count');

// ---------- Options ----------
export const options = {
  scenarios: {
    ramp_stress: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '2m', target: 50 },    // Warm-up
        { duration: '5m', target: 200 },   // Target load
        { duration: '5m', target: 500 },   // Stress
        { duration: '2m', target: 1000 },  // Peak / breaking point
        { duration: '5m', target: 0 },     // Cool-down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    // Alert threshold: error rate > 1% = test failure
    stress_error_rate: ['rate<0.01'],
    http_req_failed: ['rate<0.01'],

    // Latency degrades gracefully under load — soft thresholds
    stress_login_latency: ['p(99)<500'],
    stress_refresh_latency: ['p(99)<500'],
    stress_jackpot_latency: ['p(99)<500'],
    stress_wallet_latency: ['p(99)<500'],
    stress_profile_latency: ['p(99)<500'],

    // Under normal load these should meet NFR
    http_req_duration: ['p(95)<200'],
  },
};

// ---------- Config ----------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TEST_PASSWORD = 'PerfTest1!';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Endpoint weights (must sum to 1.0)
const WEIGHTS = {
  login: 0.10,         // 10%
  refresh: 0.15,       // 15%
  jackpot: 0.30,       // 30%
  wallet: 0.25,        // 25%
  profile: 0.10,       // 10%
  health: 0.10,        // 10%
};

// ---------- Setup ----------
export function setup() {
  // Create a pool of 20 test users to spread load
  const users = [];

  for (let i = 0; i < 20; i++) {
    const email = `stress-vu${i}-${Date.now()}@example.com`;
    const nickname = `StressVU${i}`;

    const regRes = http.post(
      `${BASE_URL}/api/v1/auth/register`,
      JSON.stringify({ email, password: TEST_PASSWORD, nickname }),
      { headers: JSON_HEADERS, tags: { name: 'setup_register' } }
    );

    let accessToken = '';
    let refreshToken = '';

    if (regRes.status === 201) {
      const body = JSON.parse(regRes.body);
      accessToken = body.accessToken || '';
      refreshToken = body.refreshToken || '';
    } else {
      const loginRes = http.post(
        `${BASE_URL}/api/v1/auth/login`,
        JSON.stringify({ email, password: TEST_PASSWORD }),
        { headers: JSON_HEADERS, tags: { name: 'setup_login' } }
      );
      if (loginRes.status === 200) {
        const body = JSON.parse(loginRes.body);
        accessToken = body.accessToken || '';
        refreshToken = body.refreshToken || '';
      }
    }

    users.push({ email, accessToken, refreshToken, index: i });
  }

  return { users };
}

// ---------- Helper: refresh token for a user ----------
function doRefresh(refreshToken) {
  if (!refreshToken) return null;

  const res = http.post(
    `${BASE_URL}/api/v1/auth/refresh`,
    JSON.stringify({ refreshToken }),
    { headers: JSON_HEADERS, tags: { name: 'auth_refresh' } }
  );

  refreshLatency.add(res.timings.duration);

  // Single-use tokens may already be rotated by another VU — treat 401 as OK
  const ok = res.status === 200 || res.status === 401;
  overallErrorRate.add(!ok || res.status >= 500);
  serverErrorCount.add(res.status >= 500 ? 1 : 0);
  requestCount.add(1);

  if (res.status === 200) {
    try {
      return JSON.parse(res.body).accessToken || null;
    } catch (_) {
      return null;
    }
  }
  return null;
}

// ---------- VU function ----------
export default function (data) {
  const { users } = data;
  const userIndex = (__VU - 1) % users.length;
  const user = users[userIndex];
  const { accessToken, refreshToken, email } = user;

  const authHeader = { Authorization: `Bearer ${accessToken}` };
  const roll = Math.random();
  let cumulative = 0;

  // ---------- Weighted endpoint selection ----------

  cumulative += WEIGHTS.login;
  if (roll < cumulative) {
    group('stress_login', () => {
      const res = http.post(
        `${BASE_URL}/api/v1/auth/login`,
        JSON.stringify({ email, password: TEST_PASSWORD }),
        { headers: JSON_HEADERS, tags: { name: 'stress_login' } }
      );

      loginLatency.add(res.timings.duration);
      const ok = check(res, { 'login: 200': (r) => r.status === 200 });
      overallErrorRate.add(!ok || res.status >= 500);
      serverErrorCount.add(res.status >= 500 ? 1 : 0);
      requestCount.add(1);
    });

    sleep(Math.random() * 2 + 0.5);
    return;
  }

  cumulative += WEIGHTS.refresh;
  if (roll < cumulative) {
    group('stress_refresh', () => {
      doRefresh(refreshToken);
    });

    sleep(Math.random() * 2 + 0.5);
    return;
  }

  cumulative += WEIGHTS.jackpot;
  if (roll < cumulative) {
    group('stress_jackpot', () => {
      const res = http.get(
        `${BASE_URL}/api/v1/game/jackpot`,
        { headers: authHeader, tags: { name: 'stress_jackpot' } }
      );

      jackpotLatency.add(res.timings.duration);
      const ok = check(res, { 'jackpot: 200': (r) => r.status === 200 });
      overallErrorRate.add(!ok || res.status >= 500);
      serverErrorCount.add(res.status >= 500 ? 1 : 0);
      requestCount.add(1);
    });

    sleep(Math.random() * 2 + 0.5);
    return;
  }

  cumulative += WEIGHTS.wallet;
  if (roll < cumulative) {
    group('stress_wallet', () => {
      const res = http.get(
        `${BASE_URL}/api/v1/user/wallet`,
        { headers: authHeader, tags: { name: 'stress_wallet' } }
      );

      walletLatency.add(res.timings.duration);
      const ok = check(res, { 'wallet: 200': (r) => r.status === 200 });
      overallErrorRate.add(!ok || res.status >= 500);
      serverErrorCount.add(res.status >= 500 ? 1 : 0);
      requestCount.add(1);
    });

    sleep(Math.random() * 2 + 0.5);
    return;
  }

  cumulative += WEIGHTS.profile;
  if (roll < cumulative) {
    group('stress_profile', () => {
      const res = http.get(
        `${BASE_URL}/api/v1/user/profile`,
        { headers: authHeader, tags: { name: 'stress_profile' } }
      );

      profileLatency.add(res.timings.duration);
      const ok = check(res, { 'profile: 200': (r) => r.status === 200 });
      overallErrorRate.add(!ok || res.status >= 500);
      serverErrorCount.add(res.status >= 500 ? 1 : 0);
      requestCount.add(1);
    });

    sleep(Math.random() * 2 + 0.5);
    return;
  }

  // Health check — remaining ~10%
  group('stress_health', () => {
    const res = http.get(
      `${BASE_URL}/health`,
      { tags: { name: 'stress_health' } }
    );

    const ok = check(res, { 'health: 200': (r) => r.status === 200 });
    overallErrorRate.add(!ok || res.status >= 500);
    serverErrorCount.add(res.status >= 500 ? 1 : 0);
    requestCount.add(1);
  });

  // Realistic think time between requests
  sleep(Math.random() * 2 + 0.5);
}
