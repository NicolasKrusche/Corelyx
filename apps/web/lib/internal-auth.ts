import { createHmac, timingSafeEqual } from "crypto";

export const INTERNAL_SERVICE_TOKEN_HEADER = "x-internal-service-token";

const CLOCK_SKEW_SECONDS = 30;
const DEFAULT_TOKEN_LIFETIME_SECONDS = 60;
const MAX_TOKEN_LIFETIME_SECONDS = 300;

type InternalServiceClaims = {
  aud: string;
  iat: number;
  exp: number;
};

type HeaderLike = {
  get(name: string): string | null;
};

function getInternalServiceSecret(): string {
  const secret =
    process.env.INTERNAL_SERVICE_AUTH_SECRET ??
    process.env.RUNTIME_SECRET ??
    "";

  if (!secret) {
    throw new Error(
      "Missing INTERNAL_SERVICE_AUTH_SECRET (or RUNTIME_SECRET fallback) for internal auth"
    );
  }

  return secret;
}

function signPayloadSegment(payloadSegment: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadSegment).digest("base64url");
}

function parseClaims(payloadSegment: string): InternalServiceClaims | null {
  try {
    const json = Buffer.from(payloadSegment, "base64url").toString("utf-8");
    const parsed = JSON.parse(json);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }

    const claims = parsed as Partial<InternalServiceClaims>;
    if (
      typeof claims.aud !== "string" ||
      typeof claims.iat !== "number" ||
      typeof claims.exp !== "number"
    ) {
      return null;
    }

    return claims as InternalServiceClaims;
  } catch {
    return null;
  }
}

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) {
    return false;
  }
  return timingSafeEqual(left, right);
}

export function createInternalServiceToken(
  audience: string,
  options: { ttlSeconds?: number; nowMs?: number } = {}
): string {
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TOKEN_LIFETIME_SECONDS;
  if (ttlSeconds <= 0 || ttlSeconds > MAX_TOKEN_LIFETIME_SECONDS) {
    throw new Error(
      `Internal service token ttlSeconds must be between 1 and ${MAX_TOKEN_LIFETIME_SECONDS}`
    );
  }

  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const payloadSegment = Buffer.from(
    JSON.stringify({
      aud: audience,
      iat: nowSeconds,
      exp: nowSeconds + ttlSeconds,
    } satisfies InternalServiceClaims)
  ).toString("base64url");

  const signature = signPayloadSegment(payloadSegment, getInternalServiceSecret());
  return `${payloadSegment}.${signature}`;
}

export function buildInternalServiceHeaders(
  audience: string,
  init: HeadersInit = {}
): Headers {
  const headers = new Headers(init);
  headers.set(INTERNAL_SERVICE_TOKEN_HEADER, createInternalServiceToken(audience));
  return headers;
}

export function verifyInternalServiceToken(
  token: string,
  audience: string,
  options: { nowMs?: number } = {}
): boolean {
  const [payloadSegment, receivedSignature] = token.split(".");
  if (!payloadSegment || !receivedSignature) {
    return false;
  }

  const expectedSignature = signPayloadSegment(
    payloadSegment,
    getInternalServiceSecret()
  );
  if (!safeEqual(receivedSignature, expectedSignature)) {
    return false;
  }

  const claims = parseClaims(payloadSegment);
  if (!claims || claims.aud !== audience) {
    return false;
  }

  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (claims.exp <= claims.iat) {
    return false;
  }
  if (claims.exp - claims.iat > MAX_TOKEN_LIFETIME_SECONDS) {
    return false;
  }
  if (claims.iat - CLOCK_SKEW_SECONDS > nowSeconds) {
    return false;
  }
  if (claims.exp + CLOCK_SKEW_SECONDS < nowSeconds) {
    return false;
  }

  return true;
}

export function requestHasValidInternalServiceToken(
  headers: HeaderLike,
  audience: string
): boolean {
  const token = headers.get(INTERNAL_SERVICE_TOKEN_HEADER);
  if (!token) {
    return false;
  }

  try {
    return verifyInternalServiceToken(token, audience);
  } catch {
    return false;
  }
}
