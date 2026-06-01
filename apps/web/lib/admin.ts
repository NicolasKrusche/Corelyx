/**
 * Admin auth helpers.
 * Admin access is gated by ADMIN_EMAILS env var (comma-separated list)
 * OR by the profiles.is_admin DB flag — both grant the same access.
 * Never expose these checks client-side.
 */

import { createServiceClient } from "@/lib/api";

export function isAdminEmail(email: string | undefined): boolean {
  if (!email) return false;
  const adminEmails = (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return adminEmails.includes(email.toLowerCase());
}

/**
 * Returns true if the user is an admin via either the email allow-list
 * or the profiles.is_admin DB flag. Use this for all admin route guards.
 */
export async function isAdmin(userId: string, email: string | undefined): Promise<boolean> {
  if (isAdminEmail(email)) return true;

  try {
    const service = createServiceClient() as unknown as {
      from(t: string): { select(c: string): { eq(k: string, v: string): { maybeSingle(): Promise<{ data: unknown }> } } };
    };
    const { data } = await service
      .from("profiles")
      .select("is_admin")
      .eq("id", userId)
      .maybeSingle();
    return (data as { is_admin?: boolean } | null)?.is_admin === true;
  } catch {
    return false;
  }
}
