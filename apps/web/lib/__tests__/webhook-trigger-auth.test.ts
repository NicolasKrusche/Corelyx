import { afterEach, describe, expect, it } from "vitest";
import {
  WEBHOOK_SIGNATURE_HEADER,
  WEBHOOK_TIMESTAMP_HEADER,
  WEBHOOK_SIGNATURE_WINDOW_SECONDS,
  createWebhookSignature,
  enrichWebhookTriggerForClient,
  verifyWebhookSignature,
} from "../webhook-trigger-auth";

const originalWebhookSigningSecret = process.env.WEBHOOK_SIGNING_SECRET;
const originalInternalAuthSecret = process.env.INTERNAL_SERVICE_AUTH_SECRET;
const originalRuntimeSecret = process.env.RUNTIME_SECRET;
const originalNodeEnv = process.env.NODE_ENV;
const mutableEnv = process.env as Record<string, string | undefined>;

afterEach(() => {
  if (originalWebhookSigningSecret === undefined) {
    delete process.env.WEBHOOK_SIGNING_SECRET;
  } else {
    process.env.WEBHOOK_SIGNING_SECRET = originalWebhookSigningSecret;
  }

  if (originalInternalAuthSecret === undefined) {
    delete process.env.INTERNAL_SERVICE_AUTH_SECRET;
  } else {
    process.env.INTERNAL_SERVICE_AUTH_SECRET = originalInternalAuthSecret;
  }

  if (originalRuntimeSecret === undefined) {
    delete process.env.RUNTIME_SECRET;
  } else {
    process.env.RUNTIME_SECRET = originalRuntimeSecret;
  }

  if (originalNodeEnv === undefined) {
    delete mutableEnv.NODE_ENV;
  } else {
    mutableEnv.NODE_ENV = originalNodeEnv;
  }
});

describe("webhook trigger auth", () => {
  it("verifies a valid signed webhook request", () => {
    process.env.WEBHOOK_SIGNING_SECRET = "webhook-signing-test-secret";

    const body = JSON.stringify({ hello: "world" });
    const webhookToken = "trigger-token";
    const { timestamp, signature } = createWebhookSignature(body, webhookToken, "1000");

    expect(
      verifyWebhookSignature({
        body,
        webhookToken,
        timestamp,
        signature,
        nowMs: 1_000_000,
      })
    ).toBe(true);
  });

  it("rejects stale signatures outside the replay window", () => {
    process.env.WEBHOOK_SIGNING_SECRET = "webhook-signing-test-secret";

    const body = JSON.stringify({ hello: "world" });
    const webhookToken = "trigger-token";
    const { timestamp, signature } = createWebhookSignature(body, webhookToken, "1000");

    expect(
      verifyWebhookSignature({
        body,
        webhookToken,
        timestamp,
        signature,
        nowMs: (1000 + WEBHOOK_SIGNATURE_WINDOW_SECONDS + 1) * 1000,
      })
    ).toBe(false);
  });

  it("does not expose the derived signing secret unless explicitly requested", () => {
    process.env.WEBHOOK_SIGNING_SECRET = "webhook-signing-test-secret";

    const hidden = enrichWebhookTriggerForClient(
      { type: "webhook", webhook_token: "trigger-token" },
      "http://localhost:3000"
    );
    expect(hidden.webhook_signing?.signature_header).toBe(WEBHOOK_SIGNATURE_HEADER);
    expect(hidden.webhook_signing?.timestamp_header).toBe(WEBHOOK_TIMESTAMP_HEADER);
    expect(hidden.webhook_signing && "secret" in hidden.webhook_signing).toBe(false);

    const revealed = enrichWebhookTriggerForClient(
      { type: "webhook", webhook_token: "trigger-token" },
      "http://localhost:3000",
      { includeSigningSecret: true }
    );
    expect(revealed.webhook_signing?.secret).toBeTruthy();
  });

  it("requires the dedicated webhook signing secret in production", () => {
    mutableEnv.NODE_ENV = "production";
    delete process.env.WEBHOOK_SIGNING_SECRET;
    process.env.INTERNAL_SERVICE_AUTH_SECRET = "broad-secret";
    process.env.RUNTIME_SECRET = "runtime-secret";

    expect(() =>
      createWebhookSignature("{}", "trigger-token", "1000")
    ).toThrow("WEBHOOK_SIGNING_SECRET");
  });
});
