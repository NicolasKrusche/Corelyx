import { createHash, createHmac, timingSafeEqual } from "crypto";

function constantTimeEqual(expected: string, received: string): boolean {
  const expectedBuffer = Buffer.from(expected, "utf8");
  const receivedBuffer = Buffer.from(received, "utf8");
  return (
    expectedBuffer.length === receivedBuffer.length &&
    timingSafeEqual(expectedBuffer, receivedBuffer)
  );
}

/** Typeform signs the raw request body with HMAC-SHA256 encoded as base64. */
export function verifyTypeformSignature(
  rawBody: string,
  secret: string,
  receivedSignature: string,
): boolean {
  const expected = `sha256=${createHmac("sha256", secret)
    .update(rawBody)
    .digest("base64")}`;
  return constantTimeEqual(expected, receivedSignature);
}

/** HubSpot webhook signature v1 is SHA-256(client secret + raw request body). */
export function verifyHubSpotV1Signature(
  rawBody: string,
  clientSecret: string,
  receivedSignature: string,
): boolean {
  const expected = createHash("sha256")
    .update(clientSecret + rawBody)
    .digest("hex");
  return constantTimeEqual(expected, receivedSignature);
}
