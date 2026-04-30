import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@flowos/db";
import { createServerClient } from "@/lib/supabase/server";
import type { User } from "@supabase/supabase-js";
import { genericErrorMessage, redactSecretText } from "@/lib/redaction";

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
  return createClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  );
}
