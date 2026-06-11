import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";

// GET /api/export — full data takeout (anti-lock-in).
//
// Returns every program (including the complete canonical workflow schema and
// version history) plus connection/API-key METADATA the user can access, as a
// downloadable JSON file. Credentials are never included: no OAuth tokens, no
// API key values, no Vault references — only names/providers so the user knows
// what to reconnect elsewhere.
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  // Explicitly scoped to the requesting user (in addition to RLS): a takeout
  // must only ever contain the user's own rows, never other workspace members'.
  const [programs, connections, apiKeys] = await Promise.all([
    supabase
      .from("programs")
      .select("id, name, description, execution_mode, is_active, schema, schema_version, visibility, workspace_id, created_at, updated_at")
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false }),
    supabase
      .from("connections")
      .select("id, name, provider, scopes, is_valid, created_at")
      .eq("user_id", user.id),
    supabase
      .from("api_keys")
      .select("id, name, provider, is_valid, created_at")
      .eq("user_id", user.id),
  ]);

  const firstError = programs.error ?? connections.error ?? apiKeys.error;
  if (firstError) return apiError(firstError.message, 500);

  // Version history only for the user's own programs fetched above.
  const programIds = (programs.data ?? []).map((p: { id: string }) => p.id);
  const versions = programIds.length
    ? await supabase
        .from("program_versions")
        .select("program_id, version, schema, change_summary, created_at")
        .in("program_id", programIds)
        .order("version", { ascending: true })
    : { data: [], error: null };
  if (versions.error) return apiError(versions.error.message, 500);

  const exportPayload = {
    format: "corelyx-export",
    format_version: 1,
    exported_at: new Date().toISOString(),
    note:
      "Programs include the full canonical workflow schema (version 1.0) and are " +
      "re-importable. Connections and API keys are metadata only — credentials " +
      "are never exported; reconnect accounts and re-enter keys after import.",
    programs: programs.data ?? [],
    program_versions: versions.data ?? [],
    connections: connections.data ?? [],
    api_keys: apiKeys.data ?? [],
  };

  const filename = `corelyx-export-${new Date().toISOString().slice(0, 10)}.json`;
  return new NextResponse(JSON.stringify(exportPayload, null, 2), {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Cache-Control": "no-store",
    },
  });
}
