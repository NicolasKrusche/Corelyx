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
  // Cloudflare Turnstile (signup CAPTCHA) — only when the site key is set.
  const turnstileEnabled = Boolean(process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY);
  const turnstileOrigin = "https://challenges.cloudflare.com";
  const connectSrc = [
    "'self'",
    appOrigin,
    supabaseOrigin,
    "https://*.supabase.co",
    "wss://*.supabase.co",
    // Vercel Analytics beacons
    "https://va.vercel-scripts.com",
    "https://vitals.vercel-insights.com",
    turnstileEnabled ? turnstileOrigin : null,
  ].filter(Boolean);

  // Vercel Analytics loads its script from va.vercel-scripts.com (debug build
  // in dev; production serves from /_vercel/insights on the same origin).
  const analyticsScriptSrc = "https://va.vercel-scripts.com";
  const extraScriptSrc = turnstileEnabled ? ` ${turnstileOrigin}` : "";

  // Next.js development mode uses eval-source-map which wraps modules in eval().
  // We allow unsafe-eval only in development so buttons and interactivity work.
  const isDev = process.env.NODE_ENV === "development";
  const scriptSrc = isDev
    ? `script-src 'self' 'nonce-${nonce}' 'unsafe-eval' ${analyticsScriptSrc}${extraScriptSrc}`
    : `script-src 'self' 'nonce-${nonce}' ${analyticsScriptSrc}${extraScriptSrc}`;

  return [
    "default-src 'self'",
    scriptSrc,
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https:",
    "font-src 'self' data:",
    `connect-src ${connectSrc.join(" ")}`,
    "base-uri 'self'",
    "object-src 'none'",
    // Turnstile renders its challenge in an iframe from challenges.cloudflare.com.
    // When disabled, omit frame-src entirely (falls back to default-src 'self',
    // the pre-existing behavior).
    ...(turnstileEnabled ? [`frame-src 'self' ${turnstileOrigin}`] : []),
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
