import { createServiceClient } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";

type AdminProfileRow = {
  is_admin: boolean | null;
};

/**
 * Check if a user is an admin.
 */
export async function isUserAdmin(userId: string): Promise<boolean> {
  const db = createServiceClient();
  
  const { data, error } = await db
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .single();
  
  if (error || !data) {
    console.error("[admin] Failed to check admin status:", error);
    return false;
  }
  
  const profile = data as unknown as AdminProfileRow;
  return profile.is_admin === true;
}

/** Returns true if the user can access technical/engineering pages (founder or dev). */
export async function hasTechnicalAccess(userId: string, email?: string | null): Promise<boolean> {
  if (isAdminEmail(email ?? undefined)) return true;
  const db = createServiceClient();
  const { data } = await db.from("profiles").select("team_role").eq("id", userId).single();
  const role = (data as { team_role: string | null } | null)?.team_role ?? null;
  return role === "founder" || role === "dev";
}

/** Returns true if the user can access the costs page (founder, dev, or marketing). */
export async function hasCostsAccess(userId: string, email?: string | null): Promise<boolean> {
  if (isAdminEmail(email ?? undefined)) return true;
  const db = createServiceClient();
  const { data } = await db.from("profiles").select("team_role").eq("id", userId).single();
  const role = (data as { team_role: string | null } | null)?.team_role ?? null;
  return role === "founder" || role === "dev" || role === "marketing";
}

/** Returns true if the user is a founder (email admin OR team_role=founder). */
export async function hasFounderAccess(userId: string, email?: string | null): Promise<boolean> {
  if (isAdminEmail(email ?? undefined)) return true;
  const db = createServiceClient();
  const { data } = await db.from("profiles").select("is_admin, team_role").eq("id", userId).single();
  const p = data as { is_admin: boolean | null; team_role: string | null } | null;
  return p?.is_admin === true && p.team_role === "founder";
}

/**
 * Middleware to require admin access.
 * Use in API routes and page components.
 */
export async function requireAdmin(userId: string | null): Promise<{
  authorized: boolean;
  error?: string;
}> {
  if (!userId) {
    return { authorized: false, error: "Authentication required" };
  }
  
  const isAdmin = await isUserAdmin(userId);
  
  if (!isAdmin) {
    console.warn(`[admin] Unauthorized access attempt by ${userId}`);
    return { authorized: false, error: "Admin access required" };
  }
  
  return { authorized: true };
}
