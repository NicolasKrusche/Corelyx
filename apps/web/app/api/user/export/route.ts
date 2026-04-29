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

type ProgramConnectionRow = {
  program_id: string;
  connection_id: string;
};

type VersionRow = {
  id: string;
  program_id: string;
  version: number;
  schema: unknown;
  change_summary: string | null;
  created_at: string;
};

type TriggerRow = {
  id: string;
  program_id: string;
  type: string;
  config: unknown;
  is_active: boolean;
  next_run_at: string | null;
  last_fired_at: string | null;
  created_at: string;
  updated_at: string | null;
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

type NodeExecutionRow = {
  id: string;
  run_id: string;
  node_id: string;
  status: string;
  input_payload: unknown;
  output_payload: unknown;
  error_message: string | null;
  retry_count: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  total_tokens: number | null;
  estimated_cost_usd: number | null;
  connector_api_calls: number | null;
  model_call_count: number | null;
  started_at: string | null;
  completed_at: string | null;
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

type ConnectionWebhookSecretRow = {
  id: string;
  connection_id: string;
  provider: string;
  secret_name: string;
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

type UsageRow = {
  id: string;
  org_id: string | null;
  period_start: string;
  period_end: string;
  program_count: number | null;
  execution_count: number | null;
  connection_count: number | null;
  created_at: string;
};

type DataSubjectRequestRow = {
  id: string;
  org_id: string | null;
  request_type: string;
  status: string;
  requester_email: string | null;
  details: string | null;
  response_summary: string | null;
  submitted_at: string;
  due_at: string;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type RedemptionRow = {
  id: string;
  redeemed_at: string;
  redemption_codes: {
    label: string | null;
    type: string;
    value: unknown;
  } | null;
};

type DbError = { message: string };

type AppLogTable = {
  insert(values: Record<string, unknown>): PromiseLike<{ error: DbError | null }>;
};

type ExportAuditClient = {
  from(table: "app_logs"): AppLogTable;
};

// GET /api/user/export - DSAR and data portability JSON export.
// Secrets (vault_secret_id, webhook tokens, raw tokens, raw keys) are never included.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const db = createServiceClient();

  const auth_profile = {
    id: user.id,
    email: user.email,
    created_at: user.created_at,
    last_sign_in_at: user.last_sign_in_at,
  };

  const [profileRes, programsRes, usageRes, dataRequestsRes, redemptionsRes] = await Promise.all([
    db
      .from("profiles")
      .select(
        "id, org_id, display_name, avatar_url, tier, plan_expires_at, bonus_runs, is_beta_tester, genesis_uses_this_month, genesis_month_reset_at, processing_restricted, processing_restricted_at, processing_restriction_reason, created_at, updated_at"
      )
      .eq("id", user.id)
      .single(),
    db
      .from("programs")
      .select(
        "id, name, description, schema, execution_mode, is_active, conflict_policy, schema_version, last_run_at, created_at, updated_at"
      )
      .eq("user_id", user.id)
      .order("created_at", { ascending: false }),
    db
      .from("usage")
      .select("id, org_id, period_start, period_end, program_count, execution_count, connection_count, created_at")
      .eq("user_id", user.id)
      .order("period_start", { ascending: false }),
    db
      .from("data_subject_requests")
      .select("id, org_id, request_type, status, requester_email, details, response_summary, submitted_at, due_at, completed_at, created_at, updated_at")
      .eq("user_id", user.id)
      .order("submitted_at", { ascending: false }),
    db
      .from("redemptions")
      .select("id, redeemed_at, redemption_codes(label, type, value)")
      .eq("user_id", user.id)
      .order("redeemed_at", { ascending: false }),
  ]);

  const account_profile = (profileRes.data ?? null) as unknown;
  const programs = (programsRes.data ?? []) as unknown as ProgramRow[];
  const programIds = programs.map((program) => program.id);

  let program_connections: ProgramConnectionRow[] = [];
  let program_versions: VersionRow[] = [];
  let triggers: TriggerRow[] = [];
  let runs: RunRow[] = [];

  if (programIds.length > 0) {
    const [programConnectionsRes, versionsRes, triggersRes, runsRes] = await Promise.all([
      db
        .from("program_connections")
        .select("program_id, connection_id")
        .in("program_id", programIds),
      db
        .from("program_versions")
        .select("id, program_id, version, schema, change_summary, created_at")
        .in("program_id", programIds)
        .order("created_at", { ascending: false }),
      db
        .from("triggers")
        .select("id, program_id, type, config, is_active, next_run_at, last_fired_at, created_at, updated_at")
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

    program_connections = (programConnectionsRes.data ?? []) as unknown as ProgramConnectionRow[];
    program_versions = (versionsRes.data ?? []) as unknown as VersionRow[];
    triggers = (triggersRes.data ?? []) as unknown as TriggerRow[];
    runs = (runsRes.data ?? []) as unknown as RunRow[];
  }

  const runIds = runs.map((run) => run.id);
  let node_executions: NodeExecutionRow[] = [];
  if (runIds.length > 0) {
    const { data } = await db
      .from("node_executions")
      .select(
        "id, run_id, node_id, status, input_payload, output_payload, error_message, retry_count, prompt_tokens, completion_tokens, total_tokens, estimated_cost_usd, connector_api_calls, model_call_count, started_at, completed_at, created_at"
      )
      .in("run_id", runIds)
      .order("created_at", { ascending: false });
    node_executions = (data ?? []) as unknown as NodeExecutionRow[];
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

  const connections = (connectionsRes.data ?? []) as unknown as ConnectionRow[];
  const connectionIds = connections.map((connection) => connection.id);
  let connection_webhook_secrets: ConnectionWebhookSecretRow[] = [];
  if (connectionIds.length > 0) {
    const { data } = await db
      .from("connection_webhook_secrets")
      .select("id, connection_id, provider, secret_name, created_at, updated_at")
      .in("connection_id", connectionIds)
      .order("created_at", { ascending: false });
    connection_webhook_secrets = (data ?? []) as unknown as ConnectionWebhookSecretRow[];
  }

  const bundle = {
    export_metadata: {
      exported_at: new Date().toISOString(),
      schema_version: 2,
      schema_document: "/data-export-schema",
      account_id: user.id,
      format: "application/json",
      exclusions: [
        "raw OAuth access and refresh tokens",
        "raw API keys",
        "Supabase Vault secret identifiers",
        "webhook trigger tokens",
        "third-party data held outside Corelyx subprocessors",
      ],
    },
    auth_profile,
    account_profile,
    usage: (usageRes.data ?? []) as unknown as UsageRow[],
    data_subject_requests: (dataRequestsRes.data ?? []) as unknown as DataSubjectRequestRow[],
    redemptions: (redemptionsRes.data ?? []) as unknown as RedemptionRow[],
    programs,
    program_connections,
    program_versions,
    triggers,
    runs,
    node_executions,
    approvals: (approvalsRes.data ?? []) as unknown as ApprovalRow[],
    logs: (logsRes.data ?? []) as unknown as LogRow[],
    connections,
    connection_webhook_secrets,
    api_keys: (apiKeysRes.data ?? []) as unknown as ApiKeyRow[],
  };

  const filename = `corelyx-export-${new Date().toISOString().slice(0, 10)}.json`;

  try {
    const auditDb = db as unknown as ExportAuditClient;
    const { error } = await auditDb.from("app_logs").insert({
      user_id: user.id,
      level: "info",
      source: "compliance",
      event: "data_export.downloaded",
      status: "completed",
      message: "User downloaded GDPR account data export.",
      details: {
        schema_version: 2,
        schema_document: "/data-export-schema",
        exported_sections: Object.keys(bundle).filter((key) => key !== "export_metadata"),
      },
    });
    if (error) console.warn("[compliance] failed to write data export app log:", error.message);
  } catch (error) {
    console.warn("[compliance] failed to write data export app log:", error);
  }

  return new Response(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "X-Corelyx-Export-Schema-Version": "2",
    },
  });
}
