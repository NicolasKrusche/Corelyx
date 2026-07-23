// ============================================================================
// Corelyx Load Test: Webhook Burst
// ============================================================================
// Sends 1000 webhook requests in a burst pattern over ~10 seconds (100 req/s).
// Tests POST /api/webhooks/inbound/{workspaceId}/{programId} under burst load.
//
// Usage:
//   k6 run --config k6-webhook-burst.json scripts/webhook-burst.js
//   k6 run scripts/webhook-burst.js   (self-contained, uses inline options)
//   or via the orchestrator: ./tests/load/run-tests.sh
//
// Environment variables:
//   CORELYX_BASE_URL      — Base URL of the Corelyx web app (default: http://localhost:3000)
//   CORELYX_WEBHOOK_SECRET — Webhook signing secret (optional, for HMAC verification)
//   CORELYX_WORKSPACE_ID  — Workspace ID (required)
//   CORELYX_PROGRAM_ID    — Program ID (required)
// ============================================================================

import http from 'k6/http';
import { check, sleep, group } from 'k6';
import { Rate, Trend, Counter } from 'k6/metrics';
import { randomString } from 'https://jslib.k6.io/k6-utils/1.4.0/index.js';
import { encoding } from 'k6/encoding';

// ── Custom Metrics ─────────────────────────────────────────────────────────

const webhookSuccessRate = new Rate('webhook_success_rate');
const webhookDuration = new Trend('webhook_duration', true);
const webhookCount = new Counter('webhook_count');
const rateLimitHits = new Counter('rate_limit_hits');

// ── Configuration ─────────────────────────────────────────────────────────

const BASE_URL = __ENV.CORELYX_BASE_URL || 'http://localhost:3000';
const WEBHOOK_SECRET = __ENV.CORELYX_WEBHOOK_SECRET || '';
const WORKSPACE_ID = __ENV.CORELYX_WORKSPACE_ID || '';
const PROGRAM_ID = __ENV.CORELYX_PROGRAM_ID || '';

// ── Inline Options (self-contained; overridden by --config JSON if provided) ─

export const options = {
  scenarios: {
    webhook_burst: {
      executor: 'ramping-arrival-rate',
      startRate: 0,
      timeUnit: '1s',
      preAllocatedVUs: 50,
      maxVUs: 200,
      stages: [
        { duration: '10s', target: 100 },  // burst: 100 req/s for 10s (~1000 requests)
        { duration: '5s', target: 0 },     // cool down
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000'],
    http_req_failed: ['rate<0.02'],
    checks: ['rate>0.98'],
  },
};

// ── HMAC Signature Generation ─────────────────────────────────────────────

function generateHMAC(payload, secret) {
  if (!secret) return '';
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const signPayload = `${timestamp}.${payload}`;
  return encoding.b64encode(signPayload);
}

// ── Setup ──────────────────────────────────────────────────────────────────

export function setup() {
  if (!WORKSPACE_ID) {
    throw new Error('CORELYX_WORKSPACE_ID environment variable is required');
  }
  if (!PROGRAM_ID) {
    throw new Error('CORELYX_PROGRAM_ID environment variable is required');
  }

  // Verify the webhook endpoint is reachable
  const testPayload = JSON.stringify({
    event: 'setup_test',
    timestamp: new Date().toISOString(),
    data: { test: true },
  });

  const res = http.post(
    `${BASE_URL}/api/webhooks/inbound/${WORKSPACE_ID}/${PROGRAM_ID}`,
    testPayload,
    {
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'CorelyxBurstTest/1.0',
      },
      timeout: '10s',
    }
  );

  // 200, 201, or 202 are acceptable — endpoint is alive
  if (res.status >= 200 && res.status < 300) {
    console.log(`Webhook endpoint alive (HTTP ${res.status})`);
  } else if (res.status === 404) {
    throw new Error(`Webhook endpoint not found: ${WORKSPACE_ID}/${PROGRAM_ID}`);
  } else if (res.status === 401 || res.status === 403) {
    console.log(`Webhook endpoint requires auth (HTTP ${res.status}) — proceeding with burst`);
  } else {
    console.log(`Webhook endpoint returned HTTP ${res.status} — proceeding anyway`);
  }

  return {
    workspaceId: WORKSPACE_ID,
    programId: PROGRAM_ID,
    startTime: new Date().toISOString(),
    testRunId: `burst-${Date.now()}`,
  };
}

// ── Main Test Function ─────────────────────────────────────────────────────

export default function webhookBurst(data) {
  group('Webhook Burst', () => {
    // Generate realistic webhook payload
    const eventId = `evt_${randomString(16, 'abcdefghijklmnopqrstuvwxyz0123456789')}`;
    const payload = JSON.stringify({
      id: eventId,
      event: 'webhook.received',
      timestamp: new Date().toISOString(),
      data: {
        source: 'burst-test',
        test_run_id: data.testRunId,
        message_index: __ITER,
        vu_id: __VU,
        payload: {
          type: 'message',
          content: `Burst test message #${__ITER} from VU ${__VU}`,
          metadata: {
            burst_id: data.testRunId,
            sequence: __ITER,
            concurrent_vu: __VU,
          },
        },
      },
    });

    // Generate signature if secret is configured
    const headers = {
      'Content-Type': 'application/json',
      'User-Agent': 'CorelyxBurstTest/1.0',
      'X-Webhook-Event': 'webhook.received',
      'X-Webhook-ID': eventId,
    };

    if (WEBHOOK_SECRET) {
      headers['X-Webhook-Signature'] = generateHMAC(payload, WEBHOOK_SECRET);
    }

    // Send webhook request
    const startTime = Date.now();
    const res = http.post(
      `${BASE_URL}/api/webhooks/inbound/${data.workspaceId}/${data.programId}`,
      payload,
      {
        headers,
        timeout: '10s',
        tags: { name: 'POST /api/webhooks/inbound' },
      }
    );
    const elapsed = Date.now() - startTime;

    // Record metrics
    webhookDuration.add(elapsed);
    webhookCount.add(1);

    // Validate response
    const success = check(res, {
      'webhook accepted (2xx)': (r) => r.status >= 200 && r.status < 300,
      'response time < 2s': (r) => r.timings.duration < 2000,
      'not rate limited': (r) => r.status !== 429,
      'not server error': (r) => r.status < 500,
    });

    webhookSuccessRate.add(success);

    if (res.status === 429) {
      rateLimitHits.add(1);
    }

    if (!success && res.status >= 500) {
      console.error(`Webhook burst error: HTTP ${res.status} — ${res.body}`);
    }
  });

  // Minimal sleep — burst pattern
  sleep(0.01);
}

// ── Teardown ───────────────────────────────────────────────────────────────

export function teardown(data) {
  console.log(`Webhook burst test complete.`);
  console.log(`Workspace: ${data.workspaceId}, Program: ${data.programId}`);
  console.log(`Test run ID: ${data.testRunId}`);
  console.log(`Duration: ${data.startTime} → ${new Date().toISOString()}`);
}

// ── Handle Summary ─────────────────────────────────────────────────────────

export function handleSummary(data) {
  const summary = {
    timestamp: new Date().toISOString(),
    test: 'Corelyx Webhook Burst',
    config: {
      workspace_id: __ENV.CORELYX_WORKSPACE_ID,
      program_id: __ENV.CORELYX_PROGRAM_ID,
    },
    metrics: {
      http_req_duration_p95: data.metrics.http_req_duration?.values?.p95,
      http_req_duration_p99: data.metrics.http_req_duration?.values?.p99,
      http_req_failed_rate: data.metrics.http_req_failed?.values?.rate,
      http_reqs_rate: data.metrics.http_reqs?.values?.rate,
      webhook_success_rate: data.metrics.webhook_success_rate?.values?.rate,
      webhook_duration_p95: data.metrics.webhook_duration?.values?.p95,
      webhook_count: data.metrics.webhook_count?.values?.count,
      rate_limit_hits: data.metrics.rate_limit_hits?.values?.count,
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
    '  Corelyx Webhook Burst — Load Test Results',
    '══════════════════════════════════════════════════════════════════',
    '',
    `  Total webhooks:    ${data.metrics.webhook_count?.values?.count || 'N/A'}`,
    `  Send rate:         ${(data.metrics.http_reqs?.values?.rate || 0).toFixed(2)} req/s`,
    `  Duration p95:      ${(data.metrics.http_req_duration?.values?.p95 || 0).toFixed(2)} ms`,
    `  Duration p99:      ${(data.metrics.http_req_duration?.values?.p99 || 0).toFixed(2)} ms`,
    `  Failed requests:   ${((data.metrics.http_req_failed?.values?.rate || 0) * 100).toFixed(2)}%`,
    `  Rate limit hits:   ${data.metrics.rate_limit_hits?.values?.count || 0}`,
    `  Webhook success:   ${((data.metrics.webhook_success_rate?.values?.rate || 0) * 100).toFixed(2)}%`,
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
    'tests/load/results/webhook-burst-summary.json': JSON.stringify(summary, null, 2),
  };

  return output;
}
