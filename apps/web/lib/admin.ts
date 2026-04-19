/**
 * Admin auth helpers.
 * Admin access is gated by ADMIN_EMAILS env var (comma-separated list).
 * Never expose this check client-side.
 */

export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email.toLowerCase());
}
