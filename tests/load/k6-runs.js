// =============================================================================
// Corelyx k6 Load Test: 100 Concurrent Workflow Runs
// =============================================================================
// Tests system resilience under sustained concurrent load.
//
// Usage:
//   k6 run tests/load/k6-runs.js
//   k6 run --out csv=results.csv tests/load/k6-runs.js
//
// Prerequisites:
//   - k6 installed (https://k6.io/docs/get-started/installation/)
//   - Corelyx web app running and accessible
//   - Valid auth token (set via K6_AUTH_TOKEN env var)
// =============================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Rate, Trend } from 'k6/metrics';

// ── Custom Metrics ─────────────────────────────────────────────────────────
const runSuccessRate = new Rate('run_success_rate');
const runDuration = new Trend('run_duration', true);

// ── Configuration ──────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const PROGRAM_ID = __ENV.PROGRAM_ID || '10000000-0000-0000-0000-000000000001';
const AUTH_TOKEN = __ENV.K6_AUTH_TOKEN || '';

export const options = {
  scenarios: {
    workflow_runs: {
      executor: 'ramping-vus',
      startVUs: 1,
      stages: [
        { duration: '2m', target: 50 },   // ramp up
        { duration: '5m', target: 100 },  // sustained load
        { duration: '2m', target: 100 },  // hold
        { duration: '1m', target: 50 },   // ramp down
        { duration: '1m', target: 0 },    // drain
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<5000', 'p(99)<10000'],
    http_req_failed: ['rate<0.05'],
    http_reqs: ['rate>10'],
    run_success_rate: ['rate>0.95'],
    run_duration: ['p(95)<8000'],
  },
};

// ── Setup (runs once before test) ──────────────────────────────────────────
export function setup() {
  // Verify connectivity
  const res = http.get(`${BASE_URL}/api/health`, {
    headers: { Authorization: `Bearer ${AUTH_TOKEN}` },
  });
  if (res.status !== 200) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return { token: AUTH_TOKEN };
}

// ── Main VU Function ───────────────────────────────────────────────────────
export default function triggerRun(data) {
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${data.token}`,
  };

  // Trigger a workflow run
  const runRes = http.post(
    `${BASE_URL}/api/programs/${PROGRAM_ID}/run`,
    JSON.stringify({
      trigger_payload: {
        test: true,
        timestamp: new Date().toISOString(),
        vu_id: __VU,
        iteration: __ITER,
      },
    }),
    { headers, tags: { name: 'trigger_run' } }
  );

  const runOk = check(runRes, {
    'run triggered (200 or 202)': (r) => r.status === 200 || r.status === 202,
    'run has run_id': (r) => {
      try {
        const body = JSON.parse(r.body);
        return body.run_id !== undefined;
      } catch {
        return false;
      }
    },
  });

  runSuccessRate.add(runOk);
  runDuration.add(runRes.timings.duration);

  // If run was triggered, poll for completion (with timeout)
  if (runOk) {
    const runId = JSON.parse(runRes.body).run_id;
    let completed = false;
    const maxPolls = 30; // max 30 polls * 2s = 60s timeout

    for (let i = 0; i < maxPolls; i++) {
      sleep(2);

      const statusRes = http.get(
        `${BASE_URL}/api/programs/${PROGRAM_ID}/runs/${runId}`,
        { headers, tags: { name: 'poll_run_status' } }
      );

      if (statusRes.status === 200) {
        try {
          const status = JSON.parse(statusRes.body);
          if (status.status === 'completed' || status.status === 'failed') {
            completed = true;
            check(statusRes, {
              'run completed successfully': (r) => {
                const s = JSON.parse(r.body);
                return s.status === 'completed';
              },
            });
            break;
          }
        } catch {
          // ignore parse errors during polling
        }
      }
    }

    if (!completed) {
      console.warn(`Run ${runId} did not complete within timeout (VU ${__VU})`);
    }
  }

  sleep(1); // brief pause between iterations
}

// ── Teardown (runs once after test) ────────────────────────────────────────
export function teardown(data) {
  console.log('Load test completed.');
  console.log(`Total VUs: ${options.scenarios.workflow_runs.stages.reduce(
    (max, s) => Math.max(max, s.target), 0
  )}`);
}
