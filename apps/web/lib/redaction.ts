const REDACTED = "[redacted]";

const SECRET_KEY_MARKERS = [
  "access_token",
  "refresh_token",
  "id_token",
  "api_key",
  "apikey",
  "authorization",
  "client_secret",
  "cookie",
  "password",
  "private_key",
  "secret",
  "session_token",
  "webhook_token",
];

const TOKEN_PATTERNS = [
  /Bearer\s+[A-Za-z0-9._~+/=-]{16,}/gi,
  /\b(?:sk|rk|pk|ghp|gho|ghu|ghs|github_pat)_[A-Za-z0-9_]{16,}\b/g,
  /\bxox(?:b|p|o|a|r)-[A-Za-z0-9-]{16,}\b/g,
  /\bya29\.[A-Za-z0-9_-]{20,}\b/g,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g,
];

export function isSecretKey(key: string) {
  const normalized = key.toLowerCase().replace(/[-\s]+/g, "_");
  return SECRET_KEY_MARKERS.some((marker) => normalized.includes(marker));
}

export function redactSecretText(value: string) {
  return TOKEN_PATTERNS.reduce(
    (text, pattern) => text.replace(pattern, REDACTED),
    value
  );
}

export function redactSecrets(value: unknown, depth = 0): unknown {
  if (depth > 8) return value;
  if (typeof value === "string") return redactSecretText(value);
  if (Array.isArray(value)) return value.map((item) => redactSecrets(item, depth + 1));
  if (!value || typeof value !== "object") return value;

  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>).map(([key, item]) => [
      key,
      isSecretKey(key) ? REDACTED : redactSecrets(item, depth + 1),
    ])
  );
}

export function genericErrorMessage(status: number) {
  if (status >= 500) return "Internal server error";
  return "Request failed";
}
