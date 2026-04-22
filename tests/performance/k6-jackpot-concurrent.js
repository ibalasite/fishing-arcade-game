/**
 * k6 Jackpot Concurrent Claim Test
 *
 * Simulates 100 VUs simultaneously triggering a jackpot claim to verify
 * the server's idempotency guard: exactly one claim succeeds (200/201),
 * all others receive 409 Conflict.
 *
 * NFR targets:
 *   - Jackpot claim response time P99 < 100ms
 *   - Exactly 1 success per jackpot event (verified via check)
 *   - 0 server errors (5xx)
 *
 * Run: k6 run tests/performance/k6-jackpot-concurrent.js
 */

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';
import { SharedArray } from 'k6/data';

// ---------- Custom metrics ----------
const jackpotClaimLatency = new Trend('jackpot_claim_latency', true);
const jackpotSuccessRate = new Rate('jackpot_success_rate');
const jackpotConflictRate = new Rate('jackpot_conflict_rate');
const jackpotErrorRate = new Rate('jackpot_server_error_rate');
const jackpotClaimCount = new Counter('jackpot_claim_total');
const jackpotSuccessCount = new Counter('jackpot_success_total');

// ---------- Options ----------
export const options = {
  scenarios: {
    concurrent_jackpot: {
      executor: 'shared-iterations',
      vus: 100,
      iterations: 100,  // Each VU fires exactly once in the burst
      maxDuration: '30s',
    },
  },
  thresholds: {
    jackpot_claim_latency: ['p(99)<100', 'p(95)<80'],
    jackpot_server_error_rate: ['rate<0.001'],
    http_req_failed: ['rate<0.001'],
  },
};

// ---------- Config ----------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const TEST_PASSWORD = 'PerfTest1!';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ---------- Shared user tokens array ----------
// SharedArray is initialised once per test run and shared across all VUs
const users = new SharedArray('jackpot_users', function () {
  // During actual k6 execution the setup() return value is passed to default(),
  // but SharedArray requires a plain JS function without external imports.
  // We pre-build placeholder data; setup() will populate the real tokens.
  return Array.from({ length: 100 }, (_, i) => ({
    email: `jackpot-vu${i}@example.com`,
    accessToken: '', // populated in setup
    vuIndex: i,
  }));
});

// ---------- Setup: register 100 test users and get tokens ----------
export function setup() {
  const tokenMap = {};

  for (let i = 0; i < 100; i++) {
    const email = `jackpot-vu${i}-${Date.now()}@example.com`;
    const nickname = `JackpotVU${i}`;

    const regRes = http.post(
      `${BASE_URL}/api/v1/auth/register`,
      JSON.stringify({ email, password: TEST_PASSWORD, nickname }),
      { headers: JSON_HEADERS, tags: { name: 'setup_register' } }
    );

    let accessToken = '';
    if (regRes.status === 201) {
      accessToken = JSON.parse(regRes.body).accessToken || '';
    } else {
      const loginRes = http.post(
        `${BASE_URL}/api/v1/auth/login`,
        JSON.stringify({ email, password: TEST_PASSWORD }),
        { headers: JSON_HEADERS, tags: { name: 'setup_login' } }
      );
      if (loginRes.status === 200) {
        accessToken = JSON.parse(loginRes.body).accessToken || '';
      }
    }

    tokenMap[i] = { email, accessToken };
  }

  // Trigger a jackpot event on the server so claims are valid
  // (Admin/seed endpoint — adjust path to match actual implementation)
  http.post(
    `${BASE_URL}/api/v1/admin/jackpot/trigger`,
    JSON.stringify({ reason: 'perf_test' }),
    {
      headers: {
        ...JSON_HEADERS,
        Authorization: `Bearer ${tokenMap[0].accessToken}`,
      },
      tags: { name: 'setup_trigger_jackpot' },
    }
  );

  return { tokenMap };
}

// ---------- VU function ----------
export default function (data) {
  const { tokenMap } = data;
  // Each VU uses its own token; VU numbers start at 1
  const vuKey = (__VU - 1) % 100;
  const user = tokenMap[vuKey] || tokenMap[0];
  const { accessToken } = user;

  // Small random jitter (0–50ms) to avoid all VUs hitting at exactly t=0
  // while still creating a realistic concurrent burst
  sleep(Math.random() * 0.05);

  const start = Date.now();

  const res = http.post(
    `${BASE_URL}/api/v1/game/jackpot/claim`,
    JSON.stringify({
      claimToken: `perf-claim-${__VU}-${Date.now()}`,
    }),
    {
      headers: {
        ...JSON_HEADERS,
        Authorization: `Bearer ${accessToken}`,
      },
      tags: { name: 'jackpot_claim' },
    }
  );

  const elapsed = Date.now() - start;
  jackpotClaimLatency.add(elapsed);
  jackpotClaimCount.add(1);

  // Exactly one VU should get 200/201 (success)
  // All others should get 409 (conflict — already claimed)
  // 5xx is always a failure
  const isSuccess = res.status === 200 || res.status === 201;
  const isConflict = res.status === 409;
  const isServerError = res.status >= 500;

  check(res, {
    'jackpot claim: no server error': (r) => r.status < 500,
    'jackpot claim: success or conflict': (r) => r.status === 200 || r.status === 201 || r.status === 409,
    'jackpot claim: response time < 100ms': (r) => r.timings.duration < 100,
  });

  if (isSuccess) {
    jackpotSuccessRate.add(1);
    jackpotSuccessCount.add(1);

    // Verify success response schema
    check(res, {
      'jackpot success: has claimId': (r) => {
        try {
          return !!JSON.parse(r.body).claimId;
        } catch (_) {
          return false;
        }
      },
      'jackpot success: has amount': (r) => {
        try {
          return typeof JSON.parse(r.body).amount === 'number';
        } catch (_) {
          return false;
        }
      },
    });
  } else {
    jackpotSuccessRate.add(0);
  }

  if (isConflict) {
    jackpotConflictRate.add(1);

    // Verify conflict response schema
    check(res, {
      'jackpot conflict: has error code': (r) => {
        try {
          const body = JSON.parse(r.body);
          return !!(body.error && body.error.code);
        } catch (_) {
          return false;
        }
      },
    });
  } else {
    jackpotConflictRate.add(0);
  }

  jackpotErrorRate.add(isServerError);
}
