# Performance Tests

k6-based load and stress tests for the Fishing Arcade Game backend.

## Prerequisites

Install k6 (v0.46+):

```bash
# macOS
brew install k6

# npm (cross-platform)
npm install -g k6

# Linux (Debian/Ubuntu)
sudo gpg -k
sudo gpg --no-default-keyring \
  --keyring /usr/share/keyrings/k6-archive-keyring.gpg \
  --keyserver hkp://keyserver.ubuntu.com:80 \
  --recv-keys C5AD17C747E3415A3642D57D77C6C491D6AC1D69
echo "deb [signed-by=/usr/share/keyrings/k6-archive-keyring.gpg] https://dl.k6.io/deb stable main" \
  | sudo tee /etc/apt/sources.list.d/k6.list
sudo apt-get update && sudo apt-get install k6
```

Verify: `k6 version`

## Running Tests

### All tests (sequential)

```bash
BASE_URL=http://localhost:3000 WS_URL=ws://localhost:3000 \
  ./tests/performance/run-perf-tests.sh
```

Skip the long ramp-stress test:

```bash
SKIP_STRESS=1 ./tests/performance/run-perf-tests.sh
```

### Individual tests

```bash
# REST API load test (~2 min)
k6 run --env BASE_URL=http://localhost:3000 tests/performance/k6-api-load.js

# WebSocket shoot latency (~1 min)
k6 run --env BASE_URL=http://localhost:3000 \
       --env WS_URL=ws://localhost:3000 \
       tests/performance/k6-websocket-shoot.js

# Room lifecycle (~3 min)
k6 run --env BASE_URL=http://localhost:3000 \
       --env WS_URL=ws://localhost:3000 \
       tests/performance/k6-room-lifecycle.js

# Jackpot concurrent claim (~30 sec)
k6 run --env BASE_URL=http://localhost:3000 \
       tests/performance/k6-jackpot-concurrent.js

# Ramp-up stress test (~19 min)
k6 run --env BASE_URL=http://localhost:3000 \
       tests/performance/k6-ramp-stress.js
```

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `BASE_URL` | `http://localhost:3000` | REST API base URL |
| `WS_URL` | `ws://localhost:3000` | WebSocket base URL |
| `K6_OUT` | *(stdout)* | k6 `--out` destination (e.g. `influxdb=http://localhost:8086/k6`) |
| `SKIP_STRESS` | `0` | Set to `1` to skip the ramp-stress test |

## Test Descriptions

| Script | Scenario | Duration | NFR Target |
|--------|----------|----------|------------|
| `k6-api-load.js` | 100 RPS constant arrival rate across 4 endpoints | ~2 min | P99 < 200ms, error rate < 1% |
| `k6-websocket-shoot.js` | 6 VUs (full room) firing 5 shoot msg/s each | ~1 min | Shoot RTT P99 < 50ms |
| `k6-room-lifecycle.js` | 50 VUs create/join/leave rooms, stay 10–30s | ~3 min | Room create P99 < 500ms |
| `k6-jackpot-concurrent.js` | 100 VUs simultaneously claim jackpot | ~30 sec | Claim P99 < 100ms; exactly 1 success |
| `k6-ramp-stress.js` | Ramp 50→200→500→1000 VUs, find breaking point | ~19 min | Error rate < 1% at target load |

## Reading k6 Output

After each run k6 prints a summary table. Key metrics to watch:

```
http_req_duration............: avg=45ms   min=12ms  med=38ms   max=890ms  p(90)=89ms   p(95)=120ms p(99)=198ms
http_req_failed..............: 0.12%
ws_shoot_latency.............: avg=18ms   p(99)=47ms
```

- **`http_req_duration`** — REST response time distribution. The `p(99)` value must stay under 200ms for the API load test to pass.
- **`http_req_failed`** — Fraction of requests that received an error response or timed out. Must stay below 1%.
- **`ws_shoot_latency`** — Custom round-trip metric for WebSocket shoot messages. `p(99)` must be below 50ms.
- **`room_create_latency`** — Time to create a game room. `p(99)` must be below 500ms.
- **`jackpot_claim_latency`** — Time to process a jackpot claim. `p(99)` must be below 100ms.
- **`stress_error_rate`** — Combined error rate in the ramp-stress test. Exceeding 1% causes test failure, indicating the load inflection point.

A **green checkmark** beside a threshold means it passed; a **red X** means it was breached and the k6 process exits non-zero.

## CI Integration (GitHub Actions)

Add to `.github/workflows/perf.yml`:

```yaml
name: Performance Tests

on:
  push:
    branches: [main]
  schedule:
    - cron: '0 2 * * 1'   # Weekly Monday 02:00 UTC

jobs:
  k6-load:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - name: Start server
        run: |
          npm ci
          npm run build
          npm start &
          npx wait-on http://localhost:3000/health --timeout 30000

      - name: Run k6 API load test
        uses: grafana/k6-action@v0.3.1
        with:
          filename: tests/performance/k6-api-load.js
          flags: --env BASE_URL=http://localhost:3000
        env:
          K6_CLOUD_TOKEN: ${{ secrets.K6_CLOUD_TOKEN }}   # optional — for cloud results

      - name: Run k6 WebSocket shoot test
        uses: grafana/k6-action@v0.3.1
        with:
          filename: tests/performance/k6-websocket-shoot.js
          flags: --env BASE_URL=http://localhost:3000 --env WS_URL=ws://localhost:3000
```

For the long-running ramp-stress test, run it in a separate scheduled workflow with `SKIP_STRESS=0` and increase the runner timeout.
