import { afterEach, describe, expect, it } from "vitest";
import {
  constantTimeEquals,
  sha256Hex,
  previewBypassConfigured,
  previewTokenMatches,
  generatePreviewToken,
} from "@/lib/maintenance-bypass";

const STRONG = "a".repeat(40);

afterEach(() => {
  delete process.env.MAINTENANCE_BYPASS_TOKEN;
});

describe("constantTimeEquals", () => {
  it("matches identical strings", () => {
    expect(constantTimeEquals("abc123", "abc123")).toBe(true);
  });
  it("rejects different strings, including length mismatches", () => {
    expect(constantTimeEquals("abc", "abd")).toBe(false);
    expect(constantTimeEquals("abc", "abcd")).toBe(false);
    expect(constantTimeEquals("", "x")).toBe(false);
  });
});

describe("sha256Hex", () => {
  it("produces the known digest for a known input", async () => {
    // SHA-256("abc")
    expect(await sha256Hex("abc")).toBe(
      "ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad"
    );
  });
});

describe("previewBypassConfigured", () => {
  it("is false with no DB hash and no env token", () => {
    expect(previewBypassConfigured(null)).toBe(false);
  });
  it("is true when a DB hash is present", () => {
    expect(previewBypassConfigured("deadbeef")).toBe(true);
  });
  it("is true when only the env fallback is set", () => {
    process.env.MAINTENANCE_BYPASS_TOKEN = STRONG;
    expect(previewBypassConfigured(null)).toBe(true);
  });
  it("ignores a too-short env token", () => {
    process.env.MAINTENANCE_BYPASS_TOKEN = "short";
    expect(previewBypassConfigured(null)).toBe(false);
  });
});

describe("previewTokenMatches", () => {
  it("matches a candidate against its DB hash", async () => {
    const hash = await sha256Hex(STRONG);
    expect(await previewTokenMatches(STRONG, hash)).toBe(true);
    expect(await previewTokenMatches("b".repeat(40), hash)).toBe(false);
  });
  it("falls back to the env token when the DB hash is absent", async () => {
    process.env.MAINTENANCE_BYPASS_TOKEN = STRONG;
    expect(await previewTokenMatches(STRONG, null)).toBe(true);
  });
  it("is false for empty candidates or when nothing is configured", async () => {
    expect(await previewTokenMatches(null, null)).toBe(false);
    expect(await previewTokenMatches("", null)).toBe(false);
    expect(await previewTokenMatches(STRONG, null)).toBe(false);
  });
});

describe("generatePreviewToken", () => {
  it("returns a long URL-safe token whose hash verifies", async () => {
    const { token, hash } = await generatePreviewToken();
    expect(token.length).toBeGreaterThanOrEqual(24);
    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(hash).toBe(await sha256Hex(token));
    expect(await previewTokenMatches(token, hash)).toBe(true);
  });
  it("produces a fresh token each call", async () => {
    const a = await generatePreviewToken();
    const b = await generatePreviewToken();
    expect(a.token).not.toBe(b.token);
  });
});
