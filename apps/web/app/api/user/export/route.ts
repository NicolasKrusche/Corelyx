import { apiError, createServiceClient, getAuthUser } from "@/lib/api";

type ProgramRow = {
  id: string;
  name: string;
  description: string | null;
  schema: unknown;
  execution_mode: string;
  is_active: boolean;
  conflict_policy: string | null;
  schema_version: number | null;
  last_run_at: string | null;
  created_at: string;
  updated_at: string;
};

type VersionRow = {
  id: string;
  program_id: string;
  version: number;
  schema: unknown;
  change_summary: string | null;
  created_at: string;
};

type RunRow = {
  id: string;
  program_id: string;
  triggered_by: string;
  status: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  connector_api_calls: number | null;
  model_call_count: number | null;
  created_at: string;
};

type ApprovalRow = {
  id: string;
  node_execution_id: string;
  status: string;
  context: unknown;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string;
};

type LogRow = {
  id: string;
  program_id: string | null;
  run_id: string | null;
  level: string;
  source: string | null;
  event: string | null;
  status: string | null;
  message: string;
  details: unknown;
  duration_ms: number | null;
  created_at: string;
};

type ConnectionRow = {
  id: string;
  name: string;
  provider: string;
  auth_type: string;
  scopes: string[] | null;
  metadata: unknown;
  is_valid: boolean;
  last_validated_at: string | null;
  created_at: string;
  updated_at: string;
};

type ApiKeyRow = {
  id: string;
  name: string;
  provider: string;
  is_valid: boolean;
  last_validated_at: string | null;
  created_at: string;
};

// GET /api/user/export — DSAR data export bundle
// Returns a JSON file containing all personal data for the authenticated user.
// Secrets (vault_secret_id, raw tokens, raw keys) are never included.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const db = createServiceClient();

  const profile = {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
  };

  const { data: programsRaw } = await db
    .from("programs")
    .select(
      "id, name, description, schema, execution_mode, is_active, conflict_policy, schema_version, last_run_at, created_at, updated_at"
    )
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  const programs = (programsRaw ?? []) as unknown as ProgramRow[];
  const programIds = programs.map((p) => p.id);

  let versions: VersionRow[] = [];
  let runs: RunRow[] = [];

  if (programIds.length > 0) {
    const [versionsRes, runsRes] = await Promise.all([
      db
        .from("program_versions")
        .select("id, program_id, version, schema, change_summary, created_at")
        .in("program_id", programIds)
        .order("created_at", { ascending: false }),
      db
        .from("runs")
        .select(
          "id, program_id, triggered_by, status, started_at, completed_at, error_message, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, connector_api_calls, model_call_count, created_at"
        )
        .in("program_id", programIds)
        .order("created_at", { ascending: false }),
    ]);
    versions = (versionsRes.data ?? []) as unknown as VersionRow[];
    runs = (runsRes.data ?? []) as unknown as RunRow[];
  }

  const [approvalsRes, logsRes, connectionsRes, apiKeysRes] = await Promise.all([
    db
      .from("approvals")
      .select("id, node_execution_id, status, context, decision_note, decided_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    db
      .from("app_logs")
      .select(
        "id, program_id, run_id, level, source, event, status, message, details, duration_ms, created_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    db
      .from("connections")
      .select(
        "id, name, provider, auth_type, scopes, metadata, is_valid, last_validated_at, created_at, updated_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    db
      .from("api_keys")
      .select("id, name, provider, is_valid, last_validated_at, created_at")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
  ]);

  const bundle = {
    exported_at: new Date().toISOString(),
    schema_version: 1,
    profile,
    programs,
    program_versions: versions,
    runs,
    approvals: (approvalsRes.data ?? []) as unknown as ApprovalRow[],
    logs: (logsRes.data ?? []) as unknown as LogRow[],
    connections: (connectionsRes.data ?? []) as unknown as ConnectionRow[],
    api_keys: (apiKeysRes.data ?? []) as unknown as ApiKeyRow[],
  };

  const filename = `nexflow-export-${new Date().toISOString().slice(0, 10)}.json`;

  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
    },
  });
}
