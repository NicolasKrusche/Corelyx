/**
 * Admin authentication utilities.
 * 
 * Checks if user has admin privileges.
 */

import { createServiceClient } from "@/lib/api";

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
  
  return data.is_admin === true;
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
