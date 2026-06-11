import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";
import { isUserAdmin } from "@/lib/admin-auth";
import {
  applySecurityLock,
  releaseSecurityLock,
} from "@/lib/security/sentinel";
import type { SecurityScopeType } from "@/lib/security/sentinel-rules";
import { serverLog } from "@/lib/server-log";

/**
 * Admin visibility + manual control over the security sentinel:
 *   GET  → recent security events and active locks
 *   POST → { action: "release" | "lock", scope_type, scope_id, reason?, ttl_minutes? }
 *
 * The "big red button" (full maintenance mode) intentionally stays on the
 * existing system-flags admin surface — the sentinel only does scoped locks.
 */

const SCOPE_TYPES: SecurityScopeType[] = ["user", "program", "webhook_token", "route", "ip"];

async function requireAdminUser(): Promise<{ id: string } | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return null;
  if (!(isAdminEmail(user.email ?? undefined) || (await isUserAdmin(user.id)))) return null;
  return { id: user.id };
}

export async function GET() {
  const admin = await requireAdminUser();
  if (!admin) return apiError("Admin access required", 403);

  const db = createServiceClient() as unknown as { from(t: string): any };

  const [{ data: events, error: eventsError }, { data: locks, error: locksError }] =
    await Promise.all([
      db
        .from("security_events")
        .select("id, created_at, event, severity, scope_type, scope_id, user_id, details, action")
        .order("created_at", { ascending: false })
        .limit(200),
      db
        .from("security_locks")
        .select("id, scope_type, scope_id, reason, locked_by, created_at, expires_at")
        .is("released_at", null)
        .order("created_at", { ascending: false })
        .limit(100),
    ]);

  if (eventsError || locksError) {
    return apiError("Failed to load security data", 500);
  }

  return NextResponse.json({ events: events ?? [], locks: locks ?? [] });
}

export async function POST(request: Request) {
  const admin = await requireAdminUser();
  if (!admin) return apiError("Admin access required", 403);

  const body = (await request.json().catch(() => null)) as {
    action?: string;
    scope_type?: string;
    scope_id?: string;
    reason?: string;
    ttl_minutes?: number;
  } | null;

  if (!body || (body.action !== "release" && body.action !== "lock")) {
    return apiError("action must be 'release' or 'lock'", 400);
  }
  const scopeType = body.scope_type as SecurityScopeType;
  if (!SCOPE_TYPES.includes(scopeType) || typeof body.scope_id !== "string" || !body.scope_id) {
    return apiError("Valid scope_type and scope_id are required", 400);
  }

  if (body.action === "release") {
    const released = await releaseSecurityLock(scopeType, body.scope_id, admin.id);
    serverLog({
      level: "info",
      event: "sentinel.lock_released_by_admin",
      message: "Admin released a security lock.",
      details: { scopeType, scopeId: body.scope_id, released },
    });
    return NextResponse.json({ ok: true, released });
  }

  const ttlMinutes =
    typeof body.ttl_minutes === "number" && body.ttl_minutes > 0
      ? Math.min(body.ttl_minutes, 7 * 24 * 60)
      : null;
  const applied = await applySecurityLock({
    scopeType,
    scopeId: body.scope_id,
    reason: (body.reason ?? "Manually locked by admin").slice(0, 500),
    lockedBy: admin.id,
    ttlSeconds: ttlMinutes === null ? null : ttlMinutes * 60,
  });
  serverLog({
    level: "warn",
    event: "sentinel.lock_applied_by_admin",
    message: "Admin applied a security lock.",
    details: { scopeType, scopeId: body.scope_id, ttlMinutes },
  });
  return NextResponse.json({ ok: applied });
}
