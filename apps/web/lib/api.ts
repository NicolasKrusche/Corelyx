import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@flowos/db";
import { createServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { genericErrorMessage, redactSecretText } from "@/lib/redaction";

export async function writeNotification(
  userId: string,
  notification: { type: string; title: string; body: string; href?: string }
): Promise<void> {
  const service = createServiceClient();
  await (service as unknown as {
    from(t: string): { insert(v: Record<string, unknown>): Promise<unknown> };
  })
    .from("notifications")
    .insert({ user_id: userId, ...notification });
}

export function apiError(message: string, status: number, code?: string) {
  const safeMessage =
    status >= 500 ? genericErrorMessage(status) : redactSecretText(message);
  return NextResponse.json(
    { error: safeMessage, ...(code ? { code } : {}) },
    { status }
  );
}

export async function getAuthUser(): Promise<User | null> {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  return user;
}

/**
 * Service-role Supabase client — bypasses RLS for Vault and admin operations.
 * NEVER expose this client or its results to the browser.
 */
export function createServiceClient() {
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!serviceRoleKey) {
    throw new Error("SUPABASE_SERVICE_ROLE_KEY is not configured.");
  }

  assertServiceRoleKey(serviceRoleKey);

  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    serviceRoleKey,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}

function assertServiceRoleKey(key: string) {
  const parts = key.split(".");
  if (parts.length < 2) return;

  try {
    const payload = parts[1]!;
    const padded = payload.padEnd(payload.length + ((4 - (payload.length % 4)) % 4), "=");
    const json = Buffer.from(padded.replace(/-/g, "+").replace(/_/g, "/"), "base64").toString("utf8");
    const claims = JSON.parse(json) as { role?: unknown };
    if (claims.role && claims.role !== "service_role") {
      throw new Error("SUPABASE_SERVICE_ROLE_KEY must be a Supabase service_role key.");
    }
  } catch (error) {
    if (error instanceof Error && error.message.includes("service_role")) {
      throw error;
    }
  }
}
