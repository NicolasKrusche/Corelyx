import { createHash, createHmac, timingSafeEqual } from "crypto";

export const INTERNAL_SERVICE_TOKEN_HEADER = "x-internal-service-token";

const CLOCK_SKEW_SECONDS = 30;
const DEFAULT_TOKEN_LIFETIME_SECONDS = 30;
const MAX_TOKEN_LIFETIME_SECONDS = 300;

type InternalServiceClaims = {
  aud: string;
  iat: number;
  exp: number;
  sub?: string;
  htm?: string;
  path?: string;
  bh?: string;
};

type RequestBinding = {
  method?: string;
  path?: string;
  body?: string;
};

type HeaderLike = {
  get(name: string): string | null;
};

function getScopedSecretEnvName(audience: string): string {
  return `INTERNAL_SERVICE_AUTH_SECRET_${audience
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")}`;
}

function allowsSharedSecretFallback(): boolean {
  return ![
    process.env.NODE_ENV,
    process.env.VERCEL_ENV,
    process.env.APP_ENV,
    process.env.RUNTIME_ENV,
  ].some((value) => value === "production");
}

function getInternalServiceSecret(audience: string): string {
  const scopedSecret = process.env[getScopedSecretEnvName(audience)] ?? "";
  if (scopedSecret) return scopedSecret;

  const sharedSecret =
    process.env.INTERNAL_SERVICE_AUTH_SECRET ?? process.env.RUNTIME_SECRET ?? "";
  if (sharedSecret && allowsSharedSecretFallback()) return sharedSecret;

  throw new Error(
    `Missing scoped internal auth secret ${getScopedSecretEnvName(audience)}`
  );
}

function signPayloadSegment(payloadSegment: string, secret: string): string {
  return createHmac("sha256", secret).update(payloadSegment).digest("base64url");
}

function bodyHash(body: string): string {
  return createHash("sha256").update(body).digest("base64url");
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
    if (claims.sub !== undefined && typeof claims.sub !== "string") {
      return null;
    }
    if (claims.htm !== undefined && typeof claims.htm !== "string") {
      return null;
    }
    if (claims.path !== undefined && typeof claims.path !== "string") {
      return null;
    }
    if (claims.bh !== undefined && typeof claims.bh !== "string") {
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
  // Pad to the same length so timingSafeEqual can run without throwing, then
  // also check length equality separately — both conditions must be true.
  const maxLen = Math.max(left.length, right.length);
  const paddedLeft = Buffer.concat([left, Buffer.alloc(maxLen - left.length)]);
  const paddedRight = Buffer.concat([right, Buffer.alloc(maxLen - right.length)]);
  return timingSafeEqual(paddedLeft, paddedRight) && left.length === right.length;
}

export function createInternalServiceToken(
  audience: string,
  options: { ttlSeconds?: number; nowMs?: number; subject?: string } & RequestBinding = {}
): string {
  const ttlSeconds = options.ttlSeconds ?? DEFAULT_TOKEN_LIFETIME_SECONDS;
  if (ttlSeconds <= 0 || ttlSeconds > MAX_TOKEN_LIFETIME_SECONDS) {
    throw new Error(
      `Internal service token ttlSeconds must be between 1 and ${MAX_TOKEN_LIFETIME_SECONDS}`
    );
  }

  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  const claims: InternalServiceClaims = {
    aud: audience,
    iat: nowSeconds,
    exp: nowSeconds + ttlSeconds,
    ...(options.subject ? { sub: options.subject } : {}),
    ...(options.method ? { htm: options.method.toUpperCase() } : {}),
    ...(options.path ? { path: options.path } : {}),
    ...(options.body !== undefined ? { bh: bodyHash(options.body) } : {}),
  };
  const payloadSegment = Buffer.from(JSON.stringify(claims)).toString("base64url");

  const signature = signPayloadSegment(
    payloadSegment,
    getInternalServiceSecret(audience)
  );
  return `${payloadSegment}.${signature}`;
}

export function buildInternalServiceHeaders(
  audience: string,
  init: HeadersInit = {},
  options: { subject?: string; ttlSeconds?: number } & RequestBinding = {}
): Headers {
  const headers = new Headers(init);
  headers.set(
    INTERNAL_SERVICE_TOKEN_HEADER,
    createInternalServiceToken(audience, options)
  );
  return headers;
}

export function verifyInternalServiceToken(
  token: string,
  audience: string,
  options: { nowMs?: number } & RequestBinding = {}
): InternalServiceClaims | null {
  const [payloadSegment, receivedSignature] = token.split(".");
  if (!payloadSegment || !receivedSignature) {
    return null;
  }

  const expectedSignature = signPayloadSegment(
    payloadSegment,
    getInternalServiceSecret(audience)
  );
  if (!safeEqual(receivedSignature, expectedSignature)) {
    return null;
  }

  const claims = parseClaims(payloadSegment);
  if (!claims || claims.aud !== audience) {
    return null;
  }

  const nowSeconds = Math.floor((options.nowMs ?? Date.now()) / 1000);
  if (claims.exp <= claims.iat) {
    return null;
  }
  if (claims.exp - claims.iat > MAX_TOKEN_LIFETIME_SECONDS) {
    return null;
  }
  if (claims.iat - CLOCK_SKEW_SECONDS > nowSeconds) {
    return null;
  }
  if (claims.exp + CLOCK_SKEW_SECONDS < nowSeconds) {
    return null;
  }
  if (options.method && claims.htm !== options.method.toUpperCase()) {
    return null;
  }
  if (options.path && claims.path !== options.path) {
    return null;
  }
  if (options.body !== undefined && claims.bh !== bodyHash(options.body)) {
    return null;
  }

  return claims;
}

export function requestHasValidInternalServiceToken(
  headers: HeaderLike,
  audience: string,
  options: RequestBinding = {}
): boolean {
  return getValidInternalServiceClaims(headers, audience, options) !== null;
}

export function getValidInternalServiceClaims(
  headers: HeaderLike,
  audience: string,
  options: RequestBinding = {}
): InternalServiceClaims | null {
  const token = headers.get(INTERNAL_SERVICE_TOKEN_HEADER);
  if (!token) {
    return null;
  }

  try {
    return verifyInternalServiceToken(token, audience, options);
  } catch {
    return null;
  }
}
