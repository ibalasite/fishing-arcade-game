/**
 * k6 Room Lifecycle Test
 *
 * Simulates 50 VUs continuously creating/joining/leaving game rooms over 3 minutes.
 * Measures room creation and join latency.
 *
 * NFR targets:
 *   - Room creation P99 < 500ms
 *   - Graceful disconnect rate > 99%
 *
 * Run: k6 run tests/performance/k6-room-lifecycle.js
 */

import http from 'k6/http';
import ws from 'k6/ws';
import { check, sleep } from 'k6';
import { Trend, Rate, Counter } from 'k6/metrics';

// ---------- Custom metrics ----------
const roomCreateLatency = new Trend('room_create_latency', true);
const roomJoinLatency = new Trend('room_join_latency', true);
const roomStayDuration = new Trend('room_stay_duration', true);
const gracefulDisconnectRate = new Rate('room_graceful_disconnect_rate');
const roomCreateErrorRate = new Rate('room_create_error_rate');
const roomJoinErrorRate = new Rate('room_join_error_rate');
const roomLifecycleCount = new Counter('room_lifecycle_count');

// ---------- Options ----------
export const options = {
  scenarios: {
    room_lifecycle: {
      executor: 'constant-vus',
      vus: 50,
      duration: '3m',
    },
  },
  thresholds: {
    room_create_latency: ['p(99)<500', 'p(95)<300'],
    room_join_latency: ['p(99)<500', 'p(95)<300'],
    room_create_error_rate: ['rate<0.05'],
    room_join_error_rate: ['rate<0.05'],
    graceful_disconnect_rate: ['rate>0.99'],
    http_req_failed: ['rate<0.05'],
  },
};

// ---------- Config ----------
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WS_URL = __ENV.WS_URL || 'ws://localhost:3000';
const TEST_PASSWORD = 'PerfTest1!';

const JSON_HEADERS = { 'Content-Type': 'application/json' };

// ---------- Setup ----------
export function setup() {
  const users = [];

  // Create 50 test user accounts
  for (let i = 0; i < 50; i++) {
    const email = `lifecycle-vu${i}-${Date.now()}@example.com`;
    const nickname = `LifecycleVU${i}`;

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

    users.push({ email, accessToken, refreshToken, vuIndex: i });
  }

  return { users };
}

// ---------- Helper: create a room via HTTP ----------
function createRoom(accessToken) {
  const start = Date.now();
  const res = http.post(
    `${BASE_URL}/api/v1/game/rooms`,
    JSON.stringify({
      roomType: 'standard',
      maxPlayers: 6,
      isPrivate: false,
    }),
    {
      headers: {
        ...JSON_HEADERS,
        Authorization: `Bearer ${accessToken}`,
      },
      tags: { name: 'room_create' },
    }
  );

  const elapsed = Date.now() - start;
  roomCreateLatency.add(elapsed);

  const ok = check(res, {
    'room create: status 200 or 201': (r) => r.status === 200 || r.status === 201,
    'room create: has roomId': (r) => {
      try {
        return !!(JSON.parse(r.body).roomId || JSON.parse(r.body).id);
      } catch (_) {
        return false;
      }
    },
  });

  roomCreateErrorRate.add(!ok);

  if (!ok) return null;

  try {
    const body = JSON.parse(res.body);
    return body.roomId || body.id || null;
  } catch (_) {
    return null;
  }
}

// ---------- Helper: list available rooms and pick one ----------
function findOrCreateRoom(accessToken) {
  const listRes = http.get(
    `${BASE_URL}/api/v1/game/rooms?status=waiting`,
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
      tags: { name: 'room_list' },
    }
  );

  if (listRes.status === 200) {
    try {
      const body = JSON.parse(listRes.body);
      const rooms = body.rooms || body.data || [];
      if (rooms.length > 0) {
        // Pick a random available room
        const room = rooms[Math.floor(Math.random() * rooms.length)];
        return room.roomId || room.id;
      }
    } catch (_) {}
  }

  // No available rooms — create one
  return createRoom(accessToken);
}

// ---------- Helper: join room via WebSocket ----------
function joinRoomViaWs(roomId, accessToken) {
  const wsUrl = `${WS_URL}/colyseus/${roomId}?token=${encodeURIComponent(accessToken)}`;
  // Stay 10–30 seconds
  const stayMs = Math.floor(Math.random() * 20000) + 10000;

  let joined = false;
  let disconnectedClean = false;
  const joinStart = Date.now();

  const result = ws.connect(wsUrl, {}, function (socket) {
    socket.on('open', () => {
      const joinElapsed = Date.now() - joinStart;
      roomJoinLatency.add(joinElapsed);
      joined = true;
    });

    socket.on('message', (rawMsg) => {
      // Process incoming game state updates
      try {
        const msg = JSON.parse(rawMsg);
        // Handle room join confirmation
        if (msg.type === 'room_joined' || msg.type === 'state_sync') {
          joined = true;
        }
      } catch (_) {}
    });

    socket.on('error', () => {
      roomJoinErrorRate.add(1);
    });

    socket.on('close', () => {
      disconnectedClean = true;
    });

    // Stay in room for stayMs, then leave gracefully
    socket.setTimeout(() => {
      // Send leave message before closing
      try {
        socket.send(JSON.stringify({ type: 'leave', reason: 'voluntary' }));
      } catch (_) {}
      socket.close(1000, 'Voluntary leave');
    }, stayMs);
  });

  const stayed = Date.now() - joinStart;
  roomStayDuration.add(stayed);

  check(result, {
    'room join: ws opened': () => joined,
  });

  gracefulDisconnectRate.add(disconnectedClean);
  roomJoinErrorRate.add(!joined);

  return joined;
}

// ---------- VU function ----------
export default function (data) {
  const vuIndex = (__VU - 1) % data.users.length;
  const user = data.users[vuIndex] || data.users[0];
  const { accessToken } = user;

  // 1. Find or create a room
  const roomId = findOrCreateRoom(accessToken);

  if (!roomId) {
    // Room creation failed — skip this iteration
    sleep(Math.random() * 2 + 1);
    return;
  }

  // 2. Join room via WebSocket (stays 10–30s)
  joinRoomViaWs(roomId, accessToken);

  roomLifecycleCount.add(1);

  // Brief pause between lifecycle iterations
  sleep(Math.random() * 2 + 0.5);
}
