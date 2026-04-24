import { createVerify, createPublicKey } from "node:crypto";

type JwkEntry = JsonWebKey & { kid: string };
type JwtHeader = { kid?: string; alg?: string };
type OidcPayload = {
  iss?: string;
  aud?: string;
  exp?: number;
  email?: string;
  email_verified?: boolean;
};

type GooglePubSubOidcOptions = {
  audience: string;
  serviceAccountEmail: string;
};

let _jwksCache: { keys: JwkEntry[]; fetchedAt: number } | null = null;
const JWKS_TTL_MS = 5 * 60 * 1000;

async function fetchGoogleJwks(): Promise<JwkEntry[]> {
  const now = Date.now();
  if (_jwksCache && now - _jwksCache.fetchedAt < JWKS_TTL_MS) return _jwksCache.keys;
  const res = await fetch("https://www.googleapis.com/oauth2/v3/certs", { cache: "no-store" });
  if (!res.ok) throw new Error(`JWKS fetch failed: ${res.status}`);
  const body = (await res.json()) as { keys: JwkEntry[] };
  _jwksCache = { keys: body.keys, fetchedAt: now };
  return body.keys;
}

const GOOGLE_ISSUERS = new Set(["accounts.google.com", "https://accounts.google.com"]);

export async function verifyGooglePubSubOidc(
  authHeader: string | null,
  options: GooglePubSubOidcOptions
): Promise<boolean> {
  if (!authHeader?.startsWith("Bearer ")) return false;
  const token = authHeader.slice(7).trim();
  const parts = token.split(".");
  if (parts.length !== 3) return false;

  let header: JwtHeader, payload: OidcPayload;
  try {
    header = JSON.parse(Buffer.from(parts[0], "base64url").toString()) as JwtHeader;
    payload = JSON.parse(Buffer.from(parts[1], "base64url").toString()) as OidcPayload;
  } catch {
    return false;
  }

  const now = Math.floor(Date.now() / 1000);
  if (header.alg !== "RS256") return false;
  if (!payload.exp || payload.exp < now) return false;
  if (!payload.iss || !GOOGLE_ISSUERS.has(payload.iss)) return false;
  if (payload.aud !== options.audience) return false;
  if (payload.email_verified !== true) return false;
  if (
    !payload.email ||
    payload.email.toLowerCase() !== options.serviceAccountEmail.toLowerCase()
  ) {
    return false;
  }
  if (!header.kid) return false;

  let keys: JwkEntry[];
  try {
    keys = await fetchGoogleJwks();
  } catch {
    return false;
  }

  const jwk = keys.find((k) => k.kid === header.kid);
  if (!jwk) return false;

  try {
    const publicKey = createPublicKey({ key: jwk as JsonWebKey, format: "jwk" });
    const verifier = createVerify("RSA-SHA256");
    verifier.update(`${parts[0]}.${parts[1]}`);
    return verifier.verify(publicKey, parts[2], "base64url");
  } catch {
    return false;
  }
}
