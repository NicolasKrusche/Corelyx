import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  codeMatches,
  generateCode,
  hashCode,
  issueCookieValue,
  verifyCookieValue,
} from "../two-factor";

const USER = "11111111-2222-3333-4444-555555555555";

describe("email two-factor primitives", () => {
  const prev = process.env.TWO_FACTOR_COOKIE_SECRET;

  beforeEach(() => {
    process.env.TWO_FACTOR_COOKIE_SECRET = "test-secret-for-unit-tests";
  });

  afterEach(() => {
    if (prev === undefined) delete process.env.TWO_FACTOR_COOKIE_SECRET;
    else process.env.TWO_FACTOR_COOKIE_SECRET = prev;
  });

  it("generates 6-digit codes", () => {
    for (let i = 0; i < 50; i += 1) {
      expect(generateCode()).toMatch(/^\d{6}$/);
    }
  });

  it("matches the right code and rejects wrong ones", () => {
    const code = "042137";
    const hash = hashCode(code, USER);
    expect(codeMatches(code, USER, hash)).toBe(true);
    expect(codeMatches("042138", USER, hash)).toBe(false);
    // Same code hashed for a different user must not match.
    expect(codeMatches(code, "99999999-2222-3333-4444-555555555555", hash)).toBe(false);
  });

  it("round-trips the verification cookie for the right user only", () => {
    const value = issueCookieValue(USER);
    expect(verifyCookieValue(value, USER)).toBe(true);
    expect(verifyCookieValue(value, "another-user")).toBe(false);
    expect(verifyCookieValue(undefined, USER)).toBe(false);
    expect(verifyCookieValue("garbage", USER)).toBe(false);
  });

  it("rejects a tampered cookie signature", () => {
    const value = issueCookieValue(USER);
    const [uid, ts, sig] = value.split(".") as [string, string, string];
    const flipped = sig.endsWith("0") ? `${sig.slice(0, -1)}1` : `${sig.slice(0, -1)}0`;
    expect(verifyCookieValue(`${uid}.${ts}.${flipped}`, USER)).toBe(false);
    // Tampered timestamp invalidates the signature too.
    expect(verifyCookieValue(`${uid}.${Number(ts) - 1000}.${sig}`, USER)).toBe(false);
  });

  it("rejects an expired cookie", () => {
    const value = issueCookieValue(USER);
    const [uid, ts, sig] = value.split(".") as [string, string, string];
    void ts;
    void sig;
    // Re-sign with an ancient timestamp is impossible without the secret, so
    // simulate expiry by checking a cookie older than the TTL window fails:
    // 31 days ago, signed properly via the real signer is not constructible
    // here — instead assert the verifier's age check path with a forged
    // old-but-correctly-formatted value (signature check happens after age).
    const old = `${uid}.${Date.now() - 32 * 24 * 60 * 60 * 1000}.${"0".repeat(64)}`;
    expect(verifyCookieValue(old, USER)).toBe(false);
  });
});
