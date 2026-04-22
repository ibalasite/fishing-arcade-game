/**
 * k6 REST API Load Test
 *
 * Tests all critical REST endpoints at 100 RPS constant arrival rate.
 * NFR target: P99 < 200ms, error rate < 1%
 *
 * Run: k6 run tests/performance/k6-api-load.js
 */

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';

// ---------- Custom metrics ----------
const loginLatency = new Trend('api_login_latency', true);
const refreshLatency = new Trend('api_refresh_latency', true);
const jackpotPoolLatency = new Trend('api_jackpot_pool_latency', true);
const walletBalanceLatency = new Trend('api_wallet_balance_latency', true);
const errorRate = new Rate('api_error_rate');
const requestCount = new Counter('api_request_count');

// ---------- Options ----------
export const options = {
  scenarios: {
    api_load: {
      executor: 'constant-arrival-rate',
      rate: 100,
      timeUnit: '1s',
      duration: '2m',
      preAllocatedVUs: 50,
      maxVUs: 100,
    },
  },
  thresholds: {
    http_req_duration: ['p(99)<200', 'p(95)<100'],
    http_req_failed: ['rate<0.01'],
    api_error_rate: ['rate<0.01'],
    api_login_latency: ['p(99)<200'],
    api_refresh_latency: ['p(99)<200'],
    api_jackpot_pool_latency: ['p(99)<200'],
    api_wallet_balance_latency: ['p(99)<200'],
  },
};

// ---------- Config ----------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TEST_EMAIL = `perf-test-${Date.now()}@example.com`;
const TEST_PASSWORD = 'PerfTest1!';
const TEST_NICKNAME = 'PerfTester';

const JSON_HEADERS = {
  'Content-Type': 'application/json',
};

// ---------- Setup: register test user and obtain tokens ----------
export function setup() {
  // Register a dedicated test user
  const registerRes = http.post(
    `${BASE_URL}/api/v1/auth/register`,
    JSON.stringify({
      email: TEST_EMAIL,
      password: TEST_PASSWORD,
      nickname: TEST_NICKNAME,
    }),
    { headers: JSON_HEADERS, tags: { name: 'setup_register' } }
  );

  let accessToken = '';
  let refreshToken = '';

  if (registerRes.status === 201) {
    const body = JSON.parse(registerRes.body);
    accessToken = body.accessToken || '';
    refreshToken = body.refreshToken || '';
  } else {
    // Account may already exist — fall back to login
    const loginRes = http.post(
      `${BASE_URL}/api/v1/auth/login`,
      JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
      { headers: JSON_HEADERS, tags: { name: 'setup_login' } }
    );
    if (loginRes.status === 200) {
      const body = JSON.parse(loginRes.body);
      accessToken = body.accessToken || '';
      refreshToken = body.refreshToken || '';
    }
  }

  return { accessToken, refreshToken, email: TEST_EMAIL };
}

// ---------- VU function ----------
export default function (data) {
  const { accessToken, refreshToken } = data;

  // Weighted traffic distribution:
  //   10% login, 20% refresh, 40% jackpot pool, 30% wallet balance
  const roll = Math.random();

  if (roll < 0.10) {
    // 10% — POST /api/v1/auth/login
    group('auth_login', () => {
      const res = http.post(
        `${BASE_URL}/api/v1/auth/login`,
        JSON.stringify({ email: TEST_EMAIL, password: TEST_PASSWORD }),
        {
          headers: JSON_HEADERS,
          tags: { name: 'auth_login' },
        }
      );

      const ok = check(res, {
        'login: status 200': (r) => r.status === 200,
        'login: has accessToken': (r) => {
          try {
            return !!JSON.parse(r.body).accessToken;
          } catch (_) {
            return false;
          }
        },
        'login: has refreshToken': (r) => {
          try {
            return !!JSON.parse(r.body).refreshToken;
          } catch (_) {
            return false;
          }
        },
      });

      loginLatency.add(res.timings.duration);
      errorRate.add(!ok);
      requestCount.add(1);
    });

  } else if (roll < 0.30) {
    // 20% — POST /api/v1/auth/refresh
    group('auth_refresh', () => {
      const res = http.post(
        `${BASE_URL}/api/v1/auth/refresh`,
        JSON.stringify({ refreshToken }),
        {
          headers: JSON_HEADERS,
          tags: { name: 'auth_refresh' },
        }
      );

      // 200 on success, 401 if token already rotated by another VU — both acceptable
      const ok = check(res, {
        'refresh: status 200 or 401': (r) => r.status === 200 || r.status === 401,
        'refresh: response time < 200ms': (r) => r.timings.duration < 200,
      });

      refreshLatency.add(res.timings.duration);
      errorRate.add(res.status >= 500);
      requestCount.add(1);
    });

  } else if (roll < 0.70) {
    // 40% — GET /api/v1/game/jackpot (jackpot pool)
    group('jackpot_pool', () => {
      const res = http.get(
        `${BASE_URL}/api/v1/game/jackpot`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          tags: { name: 'jackpot_pool' },
        }
      );

      const ok = check(res, {
        'jackpot: status 200': (r) => r.status === 200,
        'jackpot: has jackpotPool': (r) => {
          try {
            const body = JSON.parse(r.body);
            return typeof body.jackpotPool === 'number';
          } catch (_) {
            return false;
          }
        },
        'jackpot: response time < 200ms': (r) => r.timings.duration < 200,
      });

      jackpotPoolLatency.add(res.timings.duration);
      errorRate.add(!ok);
      requestCount.add(1);
    });

  } else {
    // 30% — GET /api/v1/user/wallet (wallet balance)
    group('wallet_balance', () => {
      const res = http.get(
        `${BASE_URL}/api/v1/user/wallet`,
        {
          headers: {
            Authorization: `Bearer ${accessToken}`,
          },
          tags: { name: 'wallet_balance' },
        }
      );

      const ok = check(res, {
        'wallet: status 200': (r) => r.status === 200,
        'wallet: has gold field': (r) => {
          try {
            const body = JSON.parse(r.body);
            return typeof body.gold === 'number';
          } catch (_) {
            return false;
          }
        },
        'wallet: has diamonds field': (r) => {
          try {
            const body = JSON.parse(r.body);
            return typeof body.diamonds === 'number';
          } catch (_) {
            return false;
          }
        },
        'wallet: response time < 200ms': (r) => r.timings.duration < 200,
      });

      walletBalanceLatency.add(res.timings.duration);
      errorRate.add(!ok);
      requestCount.add(1);
    });
  }

  // Realistic think time between requests: 0.5–2.5 seconds
  sleep(Math.random() * 2 + 0.5);
}

// ---------- Teardown ----------
export function teardown(data) {
  // Optional: could delete test user here via DELETE /api/v1/privacy/account/delete
  // Skipped to avoid cleanup race conditions in load test
}
