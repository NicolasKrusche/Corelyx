// ============================================================================
// Corelyx Load Test: Concurrent Workflow Runs
// ============================================================================
// Ramp from 0 to 100 VUs over 30 seconds, sustain for 2 minutes, ramp down.
// Tests POST /api/programs/{id}/run under concurrent load.
//
// Usage:
//   k6 run --config k6-runs.json scripts/workflow-run.js
//   k6 run scripts/workflow-run.js   (self-contained, uses inline options)
//   or via the orchestrator: ./tests/load/run-tests.sh
//
// Environment variables:
//   CORELYX_BASE_URL    — Base URL of the Corelyx web app (default: http://localhost:3000)
//   CORELYX_AUTH_TOKEN  — Bearer token for authentication (required)
//   CORELYX_PROGRAM_ID  — Program ID to execute (required)
// ============================================================================

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomIntBetween } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';

// ── Custom Metrics ─────────────────────────────────────────────────────────

const runSuccessRate = new Rate('run_success_rate');
const runDuration = new Trend('run_duration', true);
const runCount = new Counter('run_count');
const statusCheckDuration = new Trend('status_check_duration', true);

// ── Configuration ─────────────────────────────────────────────────────────

const BASE_URL = __ENV.CORELYX_BASE_URL || 'http://localhost:3000';
const AUTH_TOKEN = __ENV.CORELYX_AUTH_TOKEN || '';
const PROGRAM_ID = __ENV.CORELYX_PROGRAM_ID || '';

const HEADERS = {
  'Content-Type': 'application/json',
  'Authorization': `Bearer ${AUTH_TOKEN}`,
  'User-Agent': 'CorelyxLoadTest/1.0',
};

// ── Inline Options (self-contained; overridden by --config JSON if provided) ─

export const options = {
  scenarios: {
    concurrent_runs: {
      executor: 'ramping-vus',
      startVUs: 0,
      stages: [
        { duration: '30s', target: 100 },  // ramp up
        { duration: '2m', target: 100 },   // sustain
        { duration: '30s', target: 0 },    // ramp down
      ],
      gracefulRampDown: '30s',
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<5000'],
    http_req_failed: ['rate<0.05'],
    checks: ['rate>0.95'],
  },
};

// ── Setup ──────────────────────────────────────────────────────────────────

export function setup() {
  if (!AUTH_TOKEN) {
    throw new Error('CORELYX_AUTH_TOKEN environment variable is required');
  }
  if (!PROGRAM_ID) {
    throw new Error('CORELYX_PROGRAM_ID environment variable is required');
  }

  // Verify connectivity
  const healthRes = http.get(`${BASE_URL}/api/health`, { headers: HEADERS });
  if (healthRes.status !== 200) {
    throw new Error(`Health check failed: HTTP ${healthRes.status}`);
  }

  // Verify program exists and is accessible
  const programRes = http.get(`${BASE_URL}/api/programs/${PROGRAM_ID}`, { headers: HEADERS });
  if (programRes.status !== 200) {
    throw new Error(`Program ${PROGRAM_ID} not accessible: HTTP ${programRes.status}`);
  }

  const program = JSON.parse(programRes.body);
  console.log(`Setup complete. Testing program: ${program.name || PROGRAM_ID}`);

  return {
    programId: PROGRAM_ID,
    startTime: new Date().toISOString(),
  };
}

// ── Main Test Function ─────────────────────────────────────────────────────

export default function workflowRun(data) {
  group('Workflow Run', () => {
    const runTag = `load-${Date.now()}-${randomIntBetween(1000, 9999)}`;

    // Step 1: Trigger a workflow run via POST /api/runs
    const runPayload = JSON.stringify({
      program_id: data.programId,
      trigger_payload: {
        source: 'load-test',
        run_id: runTag,
        timestamp: new Date().toISOString(),
        data: {
          message: `Load test iteration ${__VU}/${__ITER}`,
          vu_id: __VU,
          iter_id: __ITER,
        },
      },
    });

    const runStart = Date.now();
    const runRes = http.post(
      `${BASE_URL}/api/runs`,
      runPayload,
      {
        headers: {
          ...HEADERS,
          'X-Load-Test-Run': runTag,
        },
        timeout: '30s',
        tags: { name: 'POST /api/runs' },
      }
    );
    const runElapsed = Date.now() - runStart;

    // Record metrics
    runDuration.add(runElapsed);
    runCount.add(1);

    // Validate response
    const runSuccess = check(runRes, {
      'run status is 200 or 201': (r) => r.status === 200 || r.status === 201,
      'run response has id': (r) => {
        try {
          const body = JSON.parse(r.body);
          return body.id || body.run_id || body.runId;
        } catch {
          return false;
        }
      },
      'run response time < 5s': (r) => r.timings.duration < 5000,
    });

    runSuccessRate.add(runSuccess);

    // Step 2: Poll run status via GET /api/runs/:id/status
    if (runRes.status === 200 || runRes.status === 201) {
      try {
        const runBody = JSON.parse(runRes.body);
        const runId = runBody.id || runBody.run_id || runBody.runId;

        if (runId) {
          let attempts = 0;
          let status = 'pending';

          while (attempts < 5 && (status === 'pending' || status === 'running')) {
            sleep(Math.pow(2, attempts) * 0.5); // 0.5s, 1s, 2s, 4s, 8s

            const statusStart = Date.now();
            const statusRes = http.get(
              `${BASE_URL}/api/runs/${runId}/status`,
              {
                headers: HEADERS,
                timeout: '10s',
                tags: { name: 'GET /api/runs/:id/status' },
              }
            );
            statusCheckDuration.add(Date.now() - statusStart);

            if (statusRes.status === 200) {
              try {
                const statusBody = JSON.parse(statusRes.body);
                status = statusBody.status || 'unknown';
              } catch {
                status = 'unknown';
              }
            }

            attempts++;
          }

          check(null, {
            'run completed or still running': () =>
              status === 'completed' || status === 'running' || status === 'pending',
          });
        }
      } catch (e) {
        // Response parsing failed — non-critical for load test
      }
    }
  });

  // Think time between requests (100-300ms to simulate realistic usage)
  sleep(randomIntBetween(0.1, 0.3));
}

// ── Teardown ───────────────────────────────────────────────────────────────

export function teardown(data) {
  console.log(`Load test complete. Program: ${data.programId}`);
  console.log(`Start time: ${data.startTime}`);
  console.log(`End time: ${new Date().toISOString()}`);
}

// ── Handle Summary ─────────────────────────────────────────────────────────

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    test: 'Corelyx Concurrent Workflow Runs',
    metrics: {
      http_req_duration_p95: data.metrics.http_req_duration?.values?.p95,
      http_req_duration_p99: data.metrics.http_req_duration?.values?.p99,
      http_req_failed_rate: data.metrics.http_req_failed?.values?.rate,
      http_reqs_rate: data.metrics.http_reqs?.values?.rate,
      run_success_rate: data.metrics.run_success_rate?.values?.rate,
      run_duration_p95: data.metrics.run_duration?.values?.p95,
      run_count: data.metrics.run_count?.values?.count,
      checks_rate: data.metrics.checks?.values?.rate,
    },
    thresholds: {},
  };

  // Evaluate thresholds
  const thresholdResults = {};
  if (data.thresholds) {
    for (const [name, threshold] of Object.entries(data.thresholds)) {
      thresholdResults[name] = threshold.ok === true ? 'PASS' : 'FAIL';
    }
  }
  summary.thresholds = thresholdResults;

  const lines = [
    '\n══════════════════════════════════════════════════════════════════',
    '  Corelyx Concurrent Workflow Runs — Load Test Results',
    '══════════════════════════════════════════════════════════════════',
    '',
    `  Total requests:    ${data.metrics.http_reqs?.values?.count || 'N/A'}`,
    `  Request rate:      ${(data.metrics.http_reqs?.values?.rate || 0).toFixed(2)} req/s`,
    `  Duration p95:      ${(data.metrics.http_req_duration?.values?.p95 || 0).toFixed(2)} ms`,
    `  Duration p99:      ${(data.metrics.http_req_duration?.values?.p99 || 0).toFixed(2)} ms`,
    `  Failed requests:   ${((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`,
    '',
    `  Run success rate:  ${((data.metrics.run_success_rate?.values?.rate || 0) * 100).toFixed(2)}%`,
    `  Run duration p95:  ${(data.metrics.run_duration?.values?.p95 || 0).toFixed(2)} ms`,
    `  Total runs:        ${data.metrics.run_count?.values?.count || 0}`,
    '',
    '  Thresholds:',
  ];

  for (const [name, result] of Object.entries(thresholdResults)) {
    const icon = result === 'PASS' ? '✅' : '❌';
    lines.push(`    ${icon} ${name}: ${result}`);
  }

  lines.push('');
  lines.push('══════════════════════════════════════════════════════════════════');

  const output = {
    '/dev/stdout': lines.join('\n') + '\n' + JSON.stringify(summary, null, 2),
    'tests/load/results/runs-summary.json': JSON.stringify(summary, null, 2),
  };

  return output;
}
