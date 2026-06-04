import { createSign, generateKeyPairSync } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { verifyGooglePubSubOidc } from "../pubsub-auth";

const { privateKey, publicKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
});

const keyId = "test-pubsub-key";
const audience = "https://example.test/api/webhooks/gmail";
const serviceAccountEmail = "gmail-push@example-project.iam.gserviceaccount.com";

function base64urlJson(value: unknown) {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

function signJwt(payloadOverrides: Record<string, unknown> = {}) {
  const header = base64urlJson({ alg: "RS256", typ: "JWT", kid: keyId });
  const payload = base64urlJson({
    iss: "https://accounts.google.com",
    aud: audience,
    exp: Math.floor(Date.now() / 1000) + 300,
    email: serviceAccountEmail,
    email_verified: true,
    ...payloadOverrides,
  });
  const signature = createSign("RSA-SHA256")
    .update(`${header}.${payload}`)
    .sign(privateKey, "base64url");

  return `${header}.${payload}.${signature}`;
}

describe("pubsub auth", () => {
  beforeEach(() => {
    const jwk = publicKey.export({ format: "jwk" }) as unknown as JsonWebKey & {
      kid: string;
      use: string;
      alg: string;
    };
    jwk.kid = keyId;
    jwk.use = "sig";
    jwk.alg = "RS256";

    vi.stubGlobal(
      "fetch",
      vi.fn(async () => Response.json({ keys: [jwk] }))
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("accepts a Google-signed Pub/Sub OIDC token for the expected audience and service account", async () => {
    await expect(
      verifyGooglePubSubOidc(`Bearer ${signJwt()}`, {
        audience,
        serviceAccountEmail,
      })
    ).resolves.toBe(true);
  });

  it("rejects tokens for a different service account", async () => {
    await expect(
      verifyGooglePubSubOidc(`Bearer ${signJwt({ email: "other@example.com" })}`, {
        audience,
        serviceAccountEmail,
      })
    ).resolves.toBe(false);
  });

  it("rejects tokens for a different audience", async () => {
    await expect(
      verifyGooglePubSubOidc(`Bearer ${signJwt({ aud: "https://attacker.test" })}`, {
        audience,
        serviceAccountEmail,
      })
    ).resolves.toBe(false);
  });

  it("accepts a token whose audience is in the configured allow-list", async () => {
    await expect(
      verifyGooglePubSubOidc(`Bearer ${signJwt({ aud: "https://www.corelyx.app/api/webhooks/gmail" })}`, {
        audience: ["https://corelyx.app/api/webhooks/gmail", "https://www.corelyx.app/api/webhooks/gmail"],
        serviceAccountEmail,
      })
    ).resolves.toBe(true);
  });

  it("still rejects an out-of-list audience even with an allow-list", async () => {
    await expect(
      verifyGooglePubSubOidc(`Bearer ${signJwt({ aud: "https://attacker.test" })}`, {
        audience: [audience, "https://www.corelyx.app/api/webhooks/gmail"],
        serviceAccountEmail,
      })
    ).resolves.toBe(false);
  });
});
