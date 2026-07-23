// =============================================================================
// Corelyx k6 Load Test: Webhook Burst (1000 requests in 10 seconds)
// =============================================================================
// Tests webhook endpoint resilience under burst traffic patterns.
// Simulates external services sending rapid webhook notifications.
//
// Usage:
//   k6 run tests/load/k6-webhook-burst.js
//
// Prerequisites:
//   - k6 installed
//   - Corelyx web app running with webhook endpoint configured
//   - Valid webhook secret (set via K6_WEBHOOK_SECRET env var)
// =============================================================================

import http from 'k6/http';
import { check, sleep } from 'k6';
import { Counter, Rate, Trend } from 'k6/metrics';
import { sha256 } from 'k6/crypto';

// ── Custom Metrics ─────────────────────────────────────────────────────────
const webhookSuccessRate = new Rate('webhook_success_rate');
const webhookDuration = new Trend('webhook_duration', true);
const webhookRetries = new Counter('webhook_retries');

// ── Configuration ──────────────────────────────────────────────────────────
const BASE_URL = __ENV.BASE_URL || 'http://localhost:3000';
const WORKSPACE_ID = __ENV.WORKSPACE_ID || '00000000-0000-0000-0000-000000000010';
const PROGRAM_ID = __ENV.PROGRAM_ID || '10000000-0000-0000-0000-000000000001';
const WEBHOOK_SECRET = __ENV.K6_WEBHOOK_SECRET || 'test-webhook-secret';

export const options = {
  scenarios: {
    webhook_burst: {
      executor: 'ramping-arrival-rate',
      startRate: 100,
      timeUnit: '1s',
      preAllocatedVUs: 200,
      maxVUs: 500,
      stages: [
        { duration: '10s', target: 100 },  // burst: 100 req/s for 10s
        { duration: '5s', target: 10 },    // cool down
        { duration: '5s', target: 0 },     // drain
      ],
    },
  },
  thresholds: {
    http_req_duration: ['p(95)<2000', 'p(99)<5000'],
    http_req_failed: ['rate<0.02'],
    webhook_success_rate: ['rate>0.98'],
    webhook_duration: ['p(95)<3000'],
  },
};

// ── Helpers ────────────────────────────────────────────────────────────────
function generatePayload() {
  const timestamp = new Date().toISOString();
  const id = `evt_${Date.now()}_${__VU}_${__ITER}`;
  return JSON.stringify({
    id: id,
    type: 'test.webhook',
    created_at: timestamp,
    data: {
      object: {
        id: `obj_${id}`,
        type: 'test',
        attributes: {
          message: `Load test event from VU ${__VU}`,
          timestamp: timestamp,
        },
      },
    },
  });
}

function signPayload(payload) {
  // HMAC-SHA256 signature (common webhook pattern)
  return sha256(payload, 'hex');
}

// ── Setup ──────────────────────────────────────────────────────────────────
export function setup() {
  const res = http.get(`${BASE_URL}/api/health`);
  if (res.status !== 200) {
    throw new Error(`Health check failed: ${res.status}`);
  }
  return {};
}

// ── Main VU Function ───────────────────────────────────────────────────────
export default function sendWebhook() {
  const payload = generatePayload();
  const signature = signPayload(payload);

  const headers = {
    'Content-Type': 'application/json',
    'X-Webhook-Signature': `sha256=${signature}`,
    'X-Webhook-ID': `evt_${Date.now()}_${__VU}`,
    'X-Webhook-Timestamp': Math.floor(Date.now() / 1000).toString(),
  };

  const url = `${BASE_URL}/api/webhooks/inbound/${WORKSPACE_ID}/${PROGRAM_ID}`;

  const res = http.post(url, payload, {
    headers,
    tags: { name: 'webhook_inbound' },
    timeout: '10s',
  });

  const success = check(res, {
    'webhook accepted (200-202)': (r) => r.status >= 200 && r.status < 203,
    'response has body': (r) => r.body && r.body.length > 0,
  });

  webhookSuccessRate.add(success);
  webhookDuration.add(res.timings.duration);

  // Retry on 5xx (simulates webhook delivery retry)
  if (res.status >= 500) {
    webhookRetries.add(1);
    sleep(0.1);
    const retryRes = http.post(url, payload, {
      headers,
      tags: { name: 'webhook_inbound_retry' },
      timeout: '10s',
    });
    check(retryRes, {
      'retry succeeded': (r) => r.status >= 200 && r.status < 203,
    });
  }

  // Minimal sleep to not exceed arrival rate
  sleep(0.01);
}

// ── Teardown ───────────────────────────────────────────────────────────────
export function teardown() {
  console.log('Webhook burst test completed.');
}
