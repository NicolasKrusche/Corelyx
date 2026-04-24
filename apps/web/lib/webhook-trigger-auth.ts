import { createHmac, randomUUID, timingSafeEqual } from "crypto";

export const WEBHOOK_SIGNATURE_HEADER = "x-flowos-webhook-signature";
export const WEBHOOK_TIMESTAMP_HEADER = "x-flowos-webhook-timestamp";
export const WEBHOOK_SIGNATURE_ALGORITHM = "hmac-sha256";
export const WEBHOOK_SIGNATURE_WINDOW_SECONDS = 300;

type ClientTriggerShape = {
  type: string;
  webhook_token?: string | null;
};

function getWebhookSigningSecretSeed(): string {
  const secret =
    process.env.WEBHOOK_SIGNING_SECRET ??
    process.env.INTERNAL_SERVICE_AUTH_SECRET ??
    process.env.RUNTIME_SECRET ??
    "";

  if (!secret) {
    throw new Error(
      "Missing WEBHOOK_SIGNING_SECRET (or INTERNAL_SERVICE_AUTH_SECRET / RUNTIME_SECRET fallback)"
    );
  }

  return secret;
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

function normalizeSignature(signature: string): string | null {
  const trimmed = signature.trim();
  if (!trimmed) {
    return null;
  }

  if (trimmed.startsWith("v1=")) {
    return trimmed.slice(3);
  }

  return trimmed;
}

export function rotateWebhookToken(): string {
  return randomUUID();
}

export function deriveWebhookSigningSecret(webhookToken: string): string {
  return createHmac("sha256", getWebhookSigningSecretSeed())
    .update(webhookToken)
    .digest("hex");
}

export function createWebhookSignature(
  body: string,
  webhookToken: string,
  timestamp: string = Math.floor(Date.now() / 1000).toString()
): { timestamp: string; signature: string } {
  const secret = deriveWebhookSigningSecret(webhookToken);
  const digest = createHmac("sha256", secret)
    .update(`${timestamp}.${body}`)
    .digest("hex");

  return {
    timestamp,
    signature: `v1=${digest}`,
  };
}

export function verifyWebhookSignature(input: {
  body: string;
  webhookToken: string;
  timestamp: string;
  signature: string;
  nowMs?: number;
}): boolean {
  const normalizedSignature = normalizeSignature(input.signature);
  if (!normalizedSignature) {
    return false;
  }

  const parsedTimestamp = Number(input.timestamp);
  if (!Number.isFinite(parsedTimestamp)) {
    return false;
  }

  const nowSeconds = Math.floor((input.nowMs ?? Date.now()) / 1000);
  if (
    Math.abs(nowSeconds - parsedTimestamp) > WEBHOOK_SIGNATURE_WINDOW_SECONDS
  ) {
    return false;
  }

  const expectedSignature = createWebhookSignature(
    input.body,
    input.webhookToken,
    input.timestamp
  ).signature;

  const normalizedExpected = normalizeSignature(expectedSignature);
  if (!normalizedExpected) {
    return false;
  }

  return safeEqual(normalizedSignature, normalizedExpected);
}

export function enrichWebhookTriggerForClient<T extends ClientTriggerShape>(
  trigger: T,
  appUrl: string,
  options: { includeSigningSecret?: boolean } = {}
): Omit<T, "webhook_token"> & {
  webhook_url: string | null;
  webhook_token: undefined;
  webhook_signing: {
    required: true;
    algorithm: string;
    signature_header: string;
    timestamp_header: string;
    max_age_seconds: number;
    secret?: string;
  } | null;
} {
  const webhookUrl =
    trigger.type === "webhook" && trigger.webhook_token
      ? `${appUrl}/api/triggers/webhook/${trigger.webhook_token}`
      : null;

  const webhookSigning =
    trigger.type === "webhook" && trigger.webhook_token
      ? {
          required: true as const,
          algorithm: WEBHOOK_SIGNATURE_ALGORITHM,
          signature_header: WEBHOOK_SIGNATURE_HEADER,
          timestamp_header: WEBHOOK_TIMESTAMP_HEADER,
          max_age_seconds: WEBHOOK_SIGNATURE_WINDOW_SECONDS,
          ...(options.includeSigningSecret
            ? { secret: deriveWebhookSigningSecret(trigger.webhook_token) }
            : {}),
        }
      : null;

  return {
    ...trigger,
    webhook_url: webhookUrl,
    webhook_token: undefined,
    webhook_signing: webhookSigning,
  };
}
