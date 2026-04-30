export function originFromEnv(value?: string) {
  try {
    return value ? new URL(value).origin : null;
  } catch {
    return null;
  }
}

export function buildContentSecurityPolicy(nonce: string) {
  const supabaseOrigin = originFromEnv(process.env.NEXT_PUBLIC_SUPABASE_URL);
  const appOrigin = originFromEnv(process.env.NEXT_PUBLIC_APP_URL);
  const connectSrc = [
    "'self'",
    appOrigin,
    supabaseOrigin,
    "https://*.supabase.co",
    "wss://*.supabase.co",
  ].filter(Boolean);

  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}'`,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    "form-action 'self'",
    "upgrade-insecure-requests",
  ].join("; ");
}

export function applySecurityHeaders(headers: Headers, nonce: string) {
  headers.set("X-Content-Type-Options", "nosniff");
  headers.set("X-Frame-Options", "DENY");
  headers.set("Referrer-Policy", "strict-origin-when-cross-origin");
  headers.set(
    "Permissions-Policy",
    "camera=(), microphone=(), geolocation=(), payment=()"
  );
  headers.set("Content-Security-Policy", buildContentSecurityPolicy(nonce));
}
