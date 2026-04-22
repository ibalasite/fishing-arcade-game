/**
 * k6 WebSocket Shoot Performance Test
 *
 * Simulates a full game room of 6 concurrent VUs, each firing shoot messages
 * at 5 messages/second. Measures round-trip latency for shoot acknowledgements.
 *
 * NFR target: shoot latency P99 < 50ms
 *
 * Run: k6 run tests/performance/k6-websocket-shoot.js
 */

import ws from 'k6/ws';
import http from 'k6/http';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ---------- Custom metrics ----------
const wsShootLatency = new Trend('ws_shoot_latency', true);
const wsConnectLatency = new Trend('ws_connect_latency', true);
const wsErrorRate = new Rate('ws_error_rate');
const wsMessageCount = new Counter('ws_message_count');
const wsShootCount = new Counter('ws_shoot_count');

// ---------- Options ----------
export const options = {
  scenarios: {
    full_room_shoot: {
      executor: 'constant-vus',
      vus: 6,           // One full game room
      duration: '60s',
    },
  },
  thresholds: {
    ws_shoot_latency: ['p(99)<50', 'p(95)<30'],
    ws_connect_latency: ['p(99)<500'],
    ws_error_rate: ['rate<0.01'],
  },
};

// ---------- Config ----------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3000';
const TEST_PASSWORD = 'PerfTest1!';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// Fish IDs to cycle through in shoot messages
const FISH_IDS = [
  'fish-001', 'fish-002', 'fish-003', 'fish-004',
  'fish-005', 'fish-006', 'fish-007', 'fish-008',
];

const BULLET_TYPES = ['normal', 'rapid', 'heavy'];

// ---------- Setup: register VU accounts and get tokens ----------
export function setup() {
  const users = [];

  for (let i = 0; i < 6; i++) {
    const email = `ws-perf-vu${i}-${Date.now()}@example.com`;
    const password = TEST_PASSWORD;
    const nickname = `WSPerfVU${i}`;

    // Register user
    const regRes = http.post(
      `${BASE_URL}/api/v1/auth/register`,
      JSON.stringify({ email, password, nickname }),
      { headers: JSON_HEADERS, tags: { name: 'setup_register' } }
    );

    let accessToken = '';
    if (regRes.status === 201) {
      accessToken = JSON.parse(regRes.body).accessToken || '';
    } else {
      // Fallback to login
      const loginRes = http.post(
        `${BASE_URL}/api/v1/auth/login`,
        JSON.stringify({ email, password }),
        { headers: JSON_HEADERS, tags: { name: 'setup_login' } }
      );
      if (loginRes.status === 200) {
        accessToken = JSON.parse(loginRes.body).accessToken || '';
      }
    }

    users.push({ email, accessToken, vuIndex: i });
  }

  return { users };
}

// ---------- VU function ----------
export default function (data) {
  const vuIndex = (__VU - 1) % 6;
  const user = data.users[vuIndex] || data.users[0];
  const { accessToken } = user;

  // WebSocket URL with auth token as query param (common Colyseus pattern)
  const wsUrl = `${WS_URL}/?token=${encodeURIComponent(accessToken)}`;

  const connectStart = Date.now();
  let connected = false;
  let disconnectClean = false;

  // Pending shoots: map of requestId -> timestamp sent
  const pendingShots = {};
  let shotsSent = 0;
  const SHOTS_PER_SECOND = 5;
  const TOTAL_DURATION_MS = 55000; // 55s to fit within 60s scenario

  const res = ws.connect(wsUrl, {}, function (socket) {
    connected = true;
    const connectElapsed = Date.now() - connectStart;
    wsConnectLatency.add(connectElapsed);

    // Handle incoming messages (server acknowledgements)
    socket.on('message', (rawMsg) => {
      wsMessageCount.add(1);

      let msg;
      try {
        msg = JSON.parse(rawMsg);
      } catch (_) {
        return; // Non-JSON frame — ignore
      }

      // Measure shoot round-trip latency
      if (msg.type === 'shoot_ack' || msg.type === 'hit_result' || msg.type === 'shoot_result') {
        const requestId = msg.requestId || msg.req_id || msg.id;
        if (requestId && pendingShots[requestId] !== undefined) {
          const rtt = Date.now() - pendingShots[requestId];
          wsShootLatency.add(rtt);
          delete pendingShots[requestId];
        }
      }
    });

    // Handle errors
    socket.on('error', (err) => {
      wsErrorRate.add(1);
    });

    socket.on('close', () => {
      disconnectClean = true;
    });

    // Send shoot messages at SHOTS_PER_SECOND rate
    const intervalMs = Math.floor(1000 / SHOTS_PER_SECOND); // 200ms between shots

    socket.setInterval(() => {
      if (shotsSent * intervalMs >= TOTAL_DURATION_MS) {
        socket.close();
        return;
      }

      const requestId = `vu${vuIndex}-shot-${shotsSent}-${Date.now()}`;
      const fishId = FISH_IDS[shotsSent % FISH_IDS.length];
      const bulletType = BULLET_TYPES[shotsSent % BULLET_TYPES.length];

      const shootMsg = JSON.stringify({
        type: 'shoot',
        bulletType,
        targetFishId: fishId,
        requestId,
        timestamp: Date.now(),
      });

      try {
        socket.send(shootMsg);
        pendingShots[requestId] = Date.now();
        wsShootCount.add(1);
        shotsSent++;
      } catch (err) {
        wsErrorRate.add(1);
      }
    }, intervalMs);

    // Timeout safety — close after total duration
    socket.setTimeout(() => {
      socket.close();
    }, TOTAL_DURATION_MS + 2000);
  });

  check(res, {
    'ws: connection established': () => connected,
    'ws: clean disconnect': () => disconnectClean,
  });

  wsErrorRate.add(!connected ? 1 : 0);

  // Brief pause before next iteration
  sleep(Math.random() * 1 + 0.5);
}
