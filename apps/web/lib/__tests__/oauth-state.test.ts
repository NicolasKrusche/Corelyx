import { afterEach, describe, expect, it, vi } from "vitest";
import {
  getOAuthStateCookieName,
  issueOAuthState,
  verifyOAuthState,
  verifyOAuthStateWithNonceStore,
} from "../oauth-state";

const ORIGINAL_OAUTH_STATE_SECRET = process.env.OAUTH_STATE_SECRET;
const ORIGINAL_INTERNAL_SERVICE_AUTH_SECRET =
  process.env.INTERNAL_SERVICE_AUTH_SECRET;
const ORIGINAL_SUPABASE_SERVICE_ROLE_KEY =
  process.env.SUPABASE_SERVICE_ROLE_KEY;

describe("oauth state", () => {
  afterEach(() => {
    vi.useRealTimers();

    if (ORIGINAL_OAUTH_STATE_SECRET === undefined) {
      delete process.env.OAUTH_STATE_SECRET;
    } else {
      process.env.OAUTH_STATE_SECRET = ORIGINAL_OAUTH_STATE_SECRET;
    }

    if (ORIGINAL_INTERNAL_SERVICE_AUTH_SECRET === undefined) {
      delete process.env.INTERNAL_SERVICE_AUTH_SECRET;
    } else {
      process.env.INTERNAL_SERVICE_AUTH_SECRET =
        ORIGINAL_INTERNAL_SERVICE_AUTH_SECRET;
    }

    if (ORIGINAL_SUPABASE_SERVICE_ROLE_KEY === undefined) {
      delete process.env.SUPABASE_SERVICE_ROLE_KEY;
    } else {
      process.env.SUPABASE_SERVICE_ROLE_KEY =
        ORIGINAL_SUPABASE_SERVICE_ROLE_KEY;
    }
  });

  it("issues signed state that validates against the browser nonce cookie", () => {
    process.env.OAUTH_STATE_SECRET = "test-oauth-state-secret";

    const issued = issueOAuthState("user-123", {
      label: "gmail:primary",
      service: "gmail",
    });

    const result = verifyOAuthState(
      issued.state,
      issued.cookieValue,
      "user-123"
    );

    expect(result.ok).toBe(true);
    if (!result.ok) {
      return;
    }

    expect(result.value.userId).toBe("user-123");
    expect(result.value.payload).toEqual({
      label: "gmail:primary",
      service: "gmail",
    });
    expect(issued.cookieName).toBe(getOAuthStateCookieName(result.value.flowId));
  });

  it("rejects tampered OAuth state payloads", () => {
    process.env.OAUTH_STATE_SECRET = "test-oauth-state-secret";

    const issued = issueOAuthState("user-123", { label: "github:primary" });
    const [encodedPayload, signature] = issued.state.split(".");
    const envelope = JSON.parse(
      Buffer.from(encodedPayload, "base64url").toString("utf8")
    ) as Record<string, unknown>;

    envelope.payload = { label: "github:attacker" };

    const tamperedState = `${Buffer.from(
      JSON.stringify(envelope),
      "utf8"
    ).toString("base64url")}.${signature}`;

    expect(
      verifyOAuthState(tamperedState, issued.cookieValue, "user-123")
    ).toMatchObject({
      ok: false,
      reason: "invalid_signature",
    });
  });

  it("rejects expired OAuth state", () => {
    process.env.OAUTH_STATE_SECRET = "test-oauth-state-secret";
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    const issued = issueOAuthState("user-123", { label: "slack:primary" });

    vi.setSystemTime(new Date("2026-01-01T00:11:00.000Z"));

    expect(
      verifyOAuthState(issued.state, issued.cookieValue, "user-123")
    ).toMatchObject({
      ok: false,
      reason: "expired",
    });
  });

  it("rejects cookie or session mismatches", () => {
    process.env.OAUTH_STATE_SECRET = "test-oauth-state-secret";

    const issued = issueOAuthState("user-123", { label: "notion:primary" });

    expect(verifyOAuthState(issued.state, null, "user-123")).toMatchObject({
      ok: false,
      reason: "nonce_mismatch",
    });

    expect(
      verifyOAuthState(issued.state, issued.cookieValue, "user-999")
    ).toMatchObject({
      ok: false,
      reason: "user_mismatch",
    });
  });

  it("rejects replay after a server-side nonce is consumed", async () => {
    process.env.OAUTH_STATE_SECRET = "test-oauth-state-secret";

    const issued = issueOAuthState("user-123", { label: "gmail:primary" });
    const consumedFlows = new Set<string>();
    const consumeNonce = vi.fn(
      async ({
        flowId,
        userId,
        nonce,
      }: {
        flowId: string;
        userId: string;
        nonce: string;
      }) => {
        const key = `${userId}:${flowId}:${nonce}`;
        if (consumedFlows.has(key)) {
          return false;
        }

        consumedFlows.add(key);
        return true;
      }
    );

    await expect(
      verifyOAuthStateWithNonceStore(
        issued.state,
        issued.cookieValue,
        "user-123",
        consumeNonce
      )
    ).resolves.toMatchObject({ ok: true });

    await expect(
      verifyOAuthStateWithNonceStore(
        issued.state,
        issued.cookieValue,
        "user-123",
        consumeNonce
      )
    ).resolves.toMatchObject({
      ok: false,
      reason: "nonce_mismatch",
    });
    expect(consumeNonce).toHaveBeenCalledTimes(2);
  });
});
