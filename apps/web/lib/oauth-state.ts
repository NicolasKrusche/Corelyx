import {
  createHmac,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from "crypto";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";

const OAUTH_STATE_TTL_SECONDS = 10 * 60;
const OAUTH_STATE_COOKIE_PREFIX = "flowos_oauth_state";
const OAUTH_STATE_VERSION = 1;
const UUID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

type OAuthStateEnvelope = {
  v: number;
  flowId: string;
  nonce: string;
  userId: string;
  issuedAt: number;
  expiresAt: number;
  payload: Record<string, unknown>;
};

export type IssuedOAuthState = {
  state: string;
  flowId: string;
  cookieName: string;
  cookieValue: string;
  maxAge: number;
  issuedAt: number;
  expiresAt: number;
};

export type OAuthStateFailureReason =
  | "invalid_format"
  | "invalid_signature"
  | "invalid_payload"
  | "expired"
  | "nonce_mismatch"
  | "session_missing"
  | "user_mismatch";

export type OAuthStateVerificationResult =
  | {
      ok: true;
      value: {
        flowId: string;
        userId: string;
        payload: Record<string, unknown>;
      };
    }
  | {
      ok: false;
      reason: OAuthStateFailureReason;
      flowId?: string;
    };

function getOAuthStateSecret() {
  const secret =
    process.env.OAUTH_STATE_SECRET ??
    process.env.INTERNAL_SERVICE_AUTH_SECRET ??
    process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!secret) {
    throw new Error(
      "Missing OAuth state signing secret. Set OAUTH_STATE_SECRET, INTERNAL_SERVICE_AUTH_SECRET, or SUPABASE_SERVICE_ROLE_KEY."
    );
  }

  return secret;
}

function signOAuthState(encodedPayload: string) {
  return createHmac("sha256", getOAuthStateSecret())
    .update(encodedPayload)
    .digest("base64url");
}

function hashOAuthStateNonce(nonce: string) {
  return createHmac("sha256", getOAuthStateSecret())
    .update(`oauth-state-nonce:${nonce}`)
    .digest("base64url");
}

function safeEquals(left: string, right: string) {
  const leftBuffer = Buffer.from(left, "utf8");
  const rightBuffer = Buffer.from(right, "utf8");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function parseEnvelopeRecord(value: unknown): OAuthStateEnvelope | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  if (
    record.v !== OAUTH_STATE_VERSION ||
    typeof record.flowId !== "string" ||
    !UUID_PATTERN.test(record.flowId) ||
    typeof record.nonce !== "string" ||
    record.nonce.length < 32 ||
    typeof record.userId !== "string" ||
    !record.userId ||
    typeof record.issuedAt !== "number" ||
    typeof record.expiresAt !== "number" ||
    !record.payload ||
    typeof record.payload !== "object" ||
    Array.isArray(record.payload)
  ) {
    return null;
  }

  return {
    v: record.v,
    flowId: record.flowId,
    nonce: record.nonce,
    userId: record.userId,
    issuedAt: record.issuedAt,
    expiresAt: record.expiresAt,
    payload: record.payload as Record<string, unknown>,
  };
}

function decodeEnvelope(state: string) {
  const [encodedPayload, signature] = state.split(".");
  if (!encodedPayload || !signature || state.split(".").length !== 2) {
    return null;
  }

  let envelope: OAuthStateEnvelope | null = null;
  try {
    envelope = parseEnvelopeRecord(
      JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"))
    );
  } catch {
    return null;
  }

  if (!envelope) {
    return null;
  }

  return { encodedPayload, signature, envelope };
}

export function getOAuthStateCookieName(flowId: string) {
  return `${OAUTH_STATE_COOKIE_PREFIX}_${flowId}`;
}

export function issueOAuthState(
  userId: string,
  payload: Record<string, unknown>
): IssuedOAuthState {
  const issuedAt = Math.floor(Date.now() / 1000);
  const expiresAt = issuedAt + OAUTH_STATE_TTL_SECONDS;
  const flowId = randomUUID();
  const nonce = randomBytes(32).toString("base64url");

  const envelope: OAuthStateEnvelope = {
    v: OAUTH_STATE_VERSION,
    flowId,
    nonce,
    userId,
    issuedAt,
    expiresAt,
    payload,
  };

  const encodedPayload = Buffer.from(
    JSON.stringify(envelope),
    "utf8"
  ).toString("base64url");

  return {
    state: `${encodedPayload}.${signOAuthState(encodedPayload)}`,
    flowId,
    cookieName: getOAuthStateCookieName(flowId),
    cookieValue: nonce,
    maxAge: OAUTH_STATE_TTL_SECONDS,
    issuedAt,
    expiresAt,
  };
}

export async function issueOAuthStateForRequest(
  userId: string,
  payload: Record<string, unknown>
): Promise<IssuedOAuthState> {
  const issuedState = issueOAuthState(userId, payload);
  const serviceClient = createServiceClient();
  const { error } = await serviceClient.from("oauth_state_nonces").insert({
    flow_id: issuedState.flowId,
    user_id: userId,
    nonce_hash: hashOAuthStateNonce(issuedState.cookieValue),
    issued_at: new Date(issuedState.issuedAt * 1000).toISOString(),
    expires_at: new Date(issuedState.expiresAt * 1000).toISOString(),
  } as unknown as never);

  if (error) {
    throw new Error("Failed to persist OAuth state nonce");
  }

  return issuedState;
}

export function peekOAuthStateFlowId(state: string | null | undefined) {
  if (!state) {
    return undefined;
  }

  return decodeEnvelope(state)?.envelope.flowId;
}

export function verifyOAuthState(
  state: string,
  cookieValue: string | null | undefined,
  expectedUserId: string
): OAuthStateVerificationResult {
  const decoded = decodeEnvelope(state);
  if (!decoded) {
    return { ok: false, reason: "invalid_format" };
  }

  const { encodedPayload, signature, envelope } = decoded;
  const flowId = envelope.flowId;
  const expectedSignature = signOAuthState(encodedPayload);

  if (!safeEquals(signature, expectedSignature)) {
    return { ok: false, reason: "invalid_signature", flowId };
  }

  const now = Math.floor(Date.now() / 1000);
  if (
    envelope.expiresAt < now ||
    envelope.issuedAt > now + 60 ||
    envelope.expiresAt <= envelope.issuedAt
  ) {
    return { ok: false, reason: "expired", flowId };
  }

  if (!cookieValue || !safeEquals(cookieValue, envelope.nonce)) {
    return { ok: false, reason: "nonce_mismatch", flowId };
  }

  if (envelope.userId !== expectedUserId) {
    return { ok: false, reason: "user_mismatch", flowId };
  }

  return {
    ok: true,
    value: {
      flowId,
      userId: envelope.userId,
      payload: envelope.payload,
    },
  };
}

type OAuthStateNonceConsumer = (input: {
  flowId: string;
  userId: string;
  nonce: string;
}) => Promise<boolean>;

export async function verifyOAuthStateWithNonceStore(
  state: string,
  cookieValue: string | null | undefined,
  expectedUserId: string,
  consumeNonce: OAuthStateNonceConsumer
): Promise<OAuthStateVerificationResult> {
  const verifiedState = verifyOAuthState(state, cookieValue, expectedUserId);
  if (!verifiedState.ok) {
    return verifiedState;
  }

  const consumed = await consumeNonce({
    flowId: verifiedState.value.flowId,
    userId: verifiedState.value.userId,
    nonce: cookieValue!,
  });
  if (!consumed) {
    return {
      ok: false,
      reason: "nonce_mismatch",
      flowId: verifiedState.value.flowId,
    };
  }

  return verifiedState;
}

async function consumeOAuthStateNonce({
  flowId,
  userId,
  nonce,
}: {
  flowId: string;
  userId: string;
  nonce: string;
}) {
  const serviceClient = createServiceClient();
  const now = new Date().toISOString();
  const { data, error } = await serviceClient
    .from("oauth_state_nonces")
    .update({ consumed_at: now } as unknown as never)
    .eq("flow_id", flowId)
    .eq("user_id", userId)
    .eq("nonce_hash", hashOAuthStateNonce(nonce))
    .is("consumed_at", null)
    .gt("expires_at", now)
    .select("flow_id")
    .maybeSingle();

  if (error) {
    return false;
  }

  return Boolean(data);
}

export async function verifyOAuthStateFromRequest(
  state: string
): Promise<OAuthStateVerificationResult> {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const flowId = peekOAuthStateFlowId(state);
  if (!user) {
    return { ok: false, reason: "session_missing", flowId };
  }

  const cookieStore = await cookies();
  const cookieValue = flowId
    ? cookieStore.get(getOAuthStateCookieName(flowId))?.value ?? null
    : null;

  return verifyOAuthStateWithNonceStore(
    state,
    cookieValue,
    user.id,
    consumeOAuthStateNonce
  );
}

export function applyOAuthStateCookie(
  response: NextResponse,
  issuedState: IssuedOAuthState
) {
  response.cookies.set(issuedState.cookieName, issuedState.cookieValue, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: issuedState.maxAge,
  });
  return response;
}

export function clearOAuthStateCookie(response: NextResponse, flowId: string) {
  response.cookies.set(getOAuthStateCookieName(flowId), "", {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 0,
  });
  return response;
}

export function redirectWithClearedOAuthState(url: string, flowId?: string) {
  const response = NextResponse.redirect(url);
  if (flowId) {
    clearOAuthStateCookie(response, flowId);
  }
  return response;
}
