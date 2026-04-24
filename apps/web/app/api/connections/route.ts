import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";

const COMMON_METADATA_KEYS = ["email"] as const;
const METADATA_RESPONSE_KEYS: Record<string, readonly string[]> = {
  asana: ["email", "name"],
  calendar: COMMON_METADATA_KEYS,
  docs: COMMON_METADATA_KEYS,
  drive: COMMON_METADATA_KEYS,
  github: ["login", "email", "account_type"],
  gmail: COMMON_METADATA_KEYS,
  google: COMMON_METADATA_KEYS,
  hubspot: ["hub_domain", "user"],
  notion: ["workspace"],
  outlook: COMMON_METADATA_KEYS,
  sheets: COMMON_METADATA_KEYS,
  slack: ["team"],
  typeform: ["email", "alias"],
};

type ConnectionRow = {
  id: string;
  name: string;
  provider: string;
  auth_type: "oauth" | "api_key";
  scopes: string[] | null;
  metadata: Record<string, unknown> | null;
  is_valid: boolean;
  last_validated_at: string | null;
  created_at: string;
};

function sanitizeMetadataForClient(
  provider: string,
  metadata: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!metadata) return null;
  const allowedKeys = METADATA_RESPONSE_KEYS[provider] ?? [];
  const out: Record<string, unknown> = {};

  for (const key of allowedKeys) {
    const value = metadata[key];
    if (
      typeof value === "string" ||
      typeof value === "number" ||
      typeof value === "boolean" ||
      value === null
    ) {
      out[key] = value;
    }
  }

  return Object.keys(out).length > 0 ? out : null;
}

// GET /api/connections
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { data, error } = await supabase
    .from("connections")
    .select("id, name, provider, auth_type, scopes, metadata, is_valid, last_validated_at, created_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) return apiError(error.message, 500);

  const rows = (data ?? []) as unknown as ConnectionRow[];
  const sanitized = rows.map((conn) => ({
    ...conn,
    metadata: sanitizeMetadataForClient(conn.provider, conn.metadata),
  }));
  return NextResponse.json(sanitized);
}
