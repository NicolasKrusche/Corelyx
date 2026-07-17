import { createHash, createHmac } from "crypto";
import { describe, expect, it } from "vitest";
import {
  verifyHubSpotV1Signature,
  verifyTypeformSignature,
} from "@/lib/webhook-signatures";

describe("provider webhook signatures", () => {
  const body = JSON.stringify({ event: "created", id: 42 });
  const secret = "test-webhook-secret";

  it("accepts Typeform's base64 HMAC-SHA256 format", () => {
    const signature = `sha256=${createHmac("sha256", secret)
      .update(body)
      .digest("base64")}`;

    expect(verifyTypeformSignature(body, secret, signature)).toBe(true);
    expect(verifyTypeformSignature(`${body}x`, secret, signature)).toBe(false);
  });

  it("rejects the hexadecimal encoding Typeform does not send", () => {
    const wrongEncoding = `sha256=${createHmac("sha256", secret)
      .update(body)
      .digest("hex")}`;

    expect(verifyTypeformSignature(body, secret, wrongEncoding)).toBe(false);
  });

  it("accepts HubSpot's v1 SHA-256(secret + body) format", () => {
    const signature = createHash("sha256")
      .update(secret + body)
      .digest("hex");

    expect(verifyHubSpotV1Signature(body, secret, signature)).toBe(true);
    expect(verifyHubSpotV1Signature(`${body}x`, secret, signature)).toBe(false);
  });
});
