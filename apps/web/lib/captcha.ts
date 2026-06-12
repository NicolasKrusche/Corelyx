import "server-only";

/**
 * Cloudflare Turnstile verification for abuse-prone public endpoints.
 *
 * Entirely env-gated: with TURNSTILE_SECRET_KEY unset the check is a no-op
 * and the UI renders no widget (NEXT_PUBLIC_TURNSTILE_SITE_KEY drives that
 * side), so local dev and self-hosted installs work without any Cloudflare
 * account.
 */

const VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";

export function captchaEnabled(): boolean {
  return Boolean(process.env.TURNSTILE_SECRET_KEY);
}

/** True when the token is valid (or the feature is disabled). */
export async function verifyCaptchaToken(
  token: string | undefined,
  remoteIp?: string | null
): Promise<boolean> {
  const secret = process.env.TURNSTILE_SECRET_KEY;
  if (!secret) return true;
  if (!token) return false;

  try {
    const params = new URLSearchParams({ secret, response: token });
    if (remoteIp) params.set("remoteip", remoteIp);
    const res = await fetch(VERIFY_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: params.toString(),
      cache: "no-store",
    });
    if (!res.ok) return false;
    const body = (await res.json()) as { success?: boolean };
    return body.success === true;
  } catch {
    // Verification outage: fail closed — the endpoint this protects is
    // abuse-prone by definition, and a retry costs the user one click.
    return false;
  }
}
