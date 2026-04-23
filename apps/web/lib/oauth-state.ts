import { randomUUID } from "crypto";

export function encodeOAuthState(payload: Record<string, unknown>) {
  return Buffer.from(JSON.stringify({
    ...payload,
    nonce: randomUUID(),
  }), "utf8").toString("base64url");
}

export function decodeOAuthState<T extends Record<string, unknown>>(state: string): T | null {
  try {
    return JSON.parse(Buffer.from(state, "base64url").toString("utf8")) as T;
  } catch {
    return null;
  }
}
