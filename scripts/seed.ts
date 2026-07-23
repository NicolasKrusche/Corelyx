#!/usr/bin/env tsx
/**
 * Corelyx Demo Seed Script
 *
 * Populates the Supabase database with realistic demo data for development.
 * Idempotent — safe to run multiple times (uses deterministic IDs + upserts).
 *
 * Usage:
 *   pnpm seed          — seed demo data
 *   pnpm seed:reset    — wipe demo data then re-seed
 */

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@flowos/db";

// ── Env ──────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_KEY) {
  console.error(
    "❌  Missing env vars. Ensure NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are set.",
  );
  process.exit(1);
}

const db = createClient<Database>(SUPABASE_URL, SERVICE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false },
});

// ── Deterministic IDs ────────────────────────────────────────────────────────
const DEMO_USER_ID = "00000000-0000-0000-0000-000000000001";
const DEMO_WORKSPACE_ID = "00000000-0000-0000-0000-000000000010";

const PROGRAM_IDS = {
  emailToSlack: "10000000-0000-0000-0000-000000000001",
  githubIssueToNotion: "10000000-0000-0000-0000-000000000002",
  dailyDigest: "10000000-0000-0000-0000-000000000003",
} as const;

const CONNECTION_IDS = {
  gmail: "20000000-0000-0000-0000-000000000001",
  slack: "20000000-0000-0000-0000-000000000002",
  github: "20000000-0000-0000-0000-000000000003",
} as const;

const RUN_IDS = {
  run1: "30000000-0000-0000-0000-000000000001",
  run2: "30000000-0000-0000-0000-000000000002",
  run3: "30000000-0000-0000-0000-000000000003",
  run4: "30000000-0000-0000-0000-000000000004",
  run5: "30000000-0000-0000-0000-000000000005",
} as const;

// ── Helpers ──────────────────────────────────────────────────────────────────
function iso(hoursAgo: number): string {
  return new Date(Date.now() - hoursAgo * 3_600_000).toISOString();
}

function programSchema(
  programId: string,
  name: string,
  nodes: unknown[],
  edges: unknown[],
): Record<string, unknown> {
  return {
    version: "1.0",
    program_id: programId,
    program_name: name,
    created_at: iso(120),
    updated_at: iso(24),
    execution_mode: "autonomous",
    nodes,
    edges,
    triggers: nodes
      .filter((n: any) => n.type === "trigger")
      .map((n: any) => ({
        node_id: n.id,
        type: n.config?.trigger_type ?? "cron",
        is_active: true,
        last_fired: null,
        next_scheduled: null,
      })),
    version_history: [],
    metadata: {
      description: name,
      tags: ["demo"],
      is_active: true,
      last_run_id: null,
      last_run_status: null,
      last_run_timestamp: null,
    },
  };
}

// ── Seed data ────────────────────────────────────────────────────────────────

const demoWorkspace = {
  id: DEMO_WORKSPACE_ID,
  name: "Demo Workspace",
  created_by: DEMO_USER_ID,
  description: "A sample workspace for exploring Corelyx.",
  tier: "free",
  data_region: "eu",
  dpa_acknowledged_providers: [] as string[],
  purchased_credits: 100,
  default_program_visibility: "private",
  default_execution_mode: "autonomous",
  default_conflict_policy: "skip",
  compliance_mode: "standard",
  execution_log_retention_days: 30,
  prompt_retention_days: 30,
  output_retention_days: 30,
  approval_record_retention_days: 30,
  secret_rotation_reminder_days: 90,
  store_full_prompts: false,
  store_full_outputs: false,
  members_can_create_programs: true,
  allow_external_agents: false,
  agent_min_role: "admin",
  pii_mode: "redacted",
  bulk_write_approval_threshold: 10,
  bonus_runs: 0,
  is_beta_tester: false,
  genesis_uses_this_month: 0,
  bonus_genesis_uses: 0,
};

// Program 1: Email → Slack Summary
const program1Nodes = [
  {
    id: "trigger-1",
    type: "trigger",
    label: "Every hour",
    description: "Check for new emails every hour.",
    config: { trigger_type: "cron", expression: "0 * * * *", timezone: "UTC" },
    position: { x: 100, y: 200 },
    status: "idle",
  },
  {
    id: "gmail-1",
    type: "connection",
    label: "Fetch unread emails",
    description: "Lists unread emails from Gmail inbox.",
    config: {
      scope_access: "read",
      scope_required: ["https://www.googleapis.com/auth/gmail.readonly"],
      operation: "list_emails",
      operation_params: { query: "is:unread label:inbox", max_results: 10 },
    },
    position: { x: 420, y: 200 },
    status: "idle",
  },
  {
    id: "filter-1",
    type: "step",
    label: "Skip if no emails",
    description: "Stops if inbox is empty.",
    config: {
      logic_type: "filter",
      condition: 'len(data.get("emails", [])) > 0',
    },
    position: { x: 740, y: 200 },
    status: "idle",
  },
  {
    id: "agent-1",
    type: "agent",
    label: "Summarize with AI",
    description: "Produce a concise summary of each email.",
    config: {
      model: "__USER_ASSIGNED__",
      api_key_ref: "__USER_ASSIGNED__",
      system_prompt: 'Summarize the email list in 3 bullet points. Return JSON: {"summary": "..."}',
      requires_approval: false,
      approval_timeout_hours: 24,
      scope_access: "read",
      retry: { max_attempts: 3, backoff: "exponential", backoff_base_seconds: 5, fail_program_on_exhaust: false },
      tools: [],
    },
    position: { x: 1060, y: 200 },
    status: "idle",
  },
  {
    id: "slack-1",
    type: "connection",
    label: "Post to Slack",
    description: "Send the summary to Slack.",
    config: {
      scope_access: "write",
      scope_required: ["chat:write"],
      operation: "send_message",
      operation_params: { channel: "__USER_ASSIGNED__", text: "*Email Summary*\n{{agent-1.summary}}" },
    },
    position: { x: 1380, y: 200 },
    status: "idle",
  },
];

const program1Edges = [
  { id: "e1", from: "trigger-1", to: "gmail-1", type: "data_flow" },
  { id: "e2", from: "gmail-1", to: "filter-1", type: "data_flow" },
  { id: "e3", from: "filter-1", to: "agent-1", type: "data_flow" },
  { id: "e4", from: "agent-1", to: "slack-1", type: "data_flow" },
];

// Program 2: GitHub Issue → Notion Page
const program2Nodes = [
  {
    id: "trigger-1",
    type: "trigger",
    label: "New GitHub issue",
    description: "Fires when a new issue is opened.",
    config: { trigger_type: "webhook", endpoint_id: "ep-gh-issue", method: "POST" },
    position: { x: 100, y: 200 },
    status: "idle",
  },
  {
    id: "github-1",
    type: "connection",
    label: "Get issue details",
    description: "Fetch full issue data from GitHub.",
    config: {
      scope_access: "read",
      scope_required: ["repo"],
      operation: "get_issue",
      operation_params: { owner: "__USER_ASSIGNED__", repo: "__USER_ASSIGNED__", issue_number: "{{trigger-1.issue.number}}" },
    },
    position: { x: 420, y: 200 },
    status: "idle",
  },
  {
    id: "notion-1",
    type: "connection",
    label: "Create Notion page",
    description: "Create a page in the configured Notion database.",
    config: {
      scope_access: "write",
      scope_required: [],
      operation: "create_database_entry",
      operation_params: { database_id: "__USER_ASSIGNED__", _title: "{{github-1.title}}", _body: "{{github-1.body}}" },
    },
    position: { x: 740, y: 200 },
    status: "idle",
  },
];

const program2Edges = [
  { id: "e1", from: "trigger-1", to: "github-1", type: "data_flow" },
  { id: "e2", from: "github-1", to: "notion-1", type: "data_flow" },
];

// Program 3: Daily Digest
const program3Nodes = [
  {
    id: "trigger-1",
    type: "trigger",
    label: "Daily at 7am",
    description: "Fires every day at 7am UTC.",
    config: { trigger_type: "cron", expression: "0 7 * * *", timezone: "UTC" },
    position: { x: 100, y: 200 },
    status: "idle",
  },
  {
    id: "gmail-1",
    type: "connection",
    label: "Search emails",
    description: "Finds unread emails.",
    config: {
      scope_access: "read",
      scope_required: ["https://www.googleapis.com/auth/gmail.readonly"],
      operation: "search_emails",
      operation_params: { query: "is:unread", max_results: 10 },
    },
    position: { x: 420, y: 200 },
    status: "idle",
  },
  {
    id: "filter-1",
    type: "step",
    label: "Skip if empty",
    description: "No emails = skip.",
    config: {
      logic_type: "filter",
      condition: 'len(data.get("emails", [])) > 0',
    },
    position: { x: 740, y: 200 },
    status: "idle",
  },
  {
    id: "step-1",
    type: "step",
    label: "Format digest",
    description: "Create digest text.",
    config: {
      logic_type: "format",
      template: "You have {count} unread emails today.",
      output_key: "digest_text",
    },
    position: { x: 1060, y: 200 },
    status: "idle",
  },
  {
    id: "gmail-2",
    type: "connection",
    label: "Send digest email",
    description: "Send the digest.",
    config: {
      scope_access: "read_write",
      scope_required: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
      operation: "send_email",
      operation_params: { to: "__USER_ASSIGNED__", subject: "Your daily email digest", body: "{{step-1.digest_text}}" },
    },
    position: { x: 1380, y: 200 },
    status: "idle",
  },
];

const program3Edges = [
  { id: "e1", from: "trigger-1", to: "gmail-1", type: "data_flow" },
  { id: "e2", from: "gmail-1", to: "filter-1", type: "data_flow" },
  { id: "e3", from: "filter-1", to: "step-1", type: "data_flow" },
  { id: "e4", from: "step-1", to: "gmail-2", type: "data_flow" },
];

const demoPrograms = [
  {
    id: PROGRAM_IDS.emailToSlack,
    user_id: DEMO_USER_ID,
    workspace_id: DEMO_WORKSPACE_ID,
    name: "Email → Slack Summary",
    description: "Summarize incoming emails with AI and post to Slack.",
    schema: programSchema(PROGRAM_IDS.emailToSlack, "Email → Slack Summary", program1Nodes, program1Edges),
    tags: ["email", "slack", "ai"],
    is_active: true,
    visibility: "private",
    execution_mode: "autonomous",
    ai_act_risk_level: "minimal",
    customer_role: "end_user",
    human_oversight_required: false,
    transparency_notice_required: false,
    high_risk_documentation_required: false,
    legal_review_override: false,
    program_type: "workflow",
    agent_discard_after_run: false,
    agent_saved_template: false,
    last_run_at: iso(2),
  },
  {
    id: PROGRAM_IDS.githubIssueToNotion,
    user_id: DEMO_USER_ID,
    workspace_id: DEMO_WORKSPACE_ID,
    name: "GitHub Issue → Notion",
    description: "When a new GitHub issue is created, automatically create a corresponding Notion page.",
    schema: programSchema(PROGRAM_IDS.githubIssueToNotion, "GitHub Issue → Notion", program2Nodes, program2Edges),
    tags: ["github", "notion", "issues"],
    is_active: true,
    visibility: "private",
    execution_mode: "autonomous",
    ai_act_risk_level: "minimal",
    customer_role: "end_user",
    human_oversight_required: false,
    transparency_notice_required: false,
    high_risk_documentation_required: false,
    legal_review_override: false,
    program_type: "workflow",
    agent_discard_after_run: false,
    agent_saved_template: false,
    last_run_at: iso(6),
  },
  {
    id: PROGRAM_IDS.dailyDigest,
    user_id: DEMO_USER_ID,
    workspace_id: DEMO_WORKSPACE_ID,
    name: "Daily Email Digest",
    description: "Each morning, collect unread emails, format into a digest, and send it to your inbox.",
    schema: programSchema(PROGRAM_IDS.dailyDigest, "Daily Email Digest", program3Nodes, program3Edges),
    tags: ["daily", "digest", "summary"],
    is_active: true,
    visibility: "private",
    execution_mode: "autonomous",
    ai_act_risk_level: "minimal",
    customer_role: "end_user",
    human_oversight_required: false,
    transparency_notice_required: false,
    high_risk_documentation_required: false,
    legal_review_override: false,
    program_type: "workflow",
    agent_discard_after_run: false,
    agent_saved_template: false,
    last_run_at: iso(1),
  },
];

const demoConnections = [
  {
    id: CONNECTION_IDS.gmail,
    user_id: DEMO_USER_ID,
    workspace_id: DEMO_WORKSPACE_ID,
    name: "Gmail (Demo)",
    provider: "gmail",
    auth_type: "oauth2",
    vault_secret_id: "demo-vault-gmail",
    scopes: ["https://www.googleapis.com/auth/gmail.readonly", "https://www.googleapis.com/auth/gmail.send"],
    is_valid: true,
  },
  {
    id: CONNECTION_IDS.slack,
    user_id: DEMO_USER_ID,
    workspace_id: DEMO_WORKSPACE_ID,
    name: "Slack (Demo)",
    provider: "slack",
    auth_type: "oauth2",
    vault_secret_id: "demo-vault-slack",
    scopes: ["chat:write"],
    is_valid: true,
  },
  {
    id: CONNECTION_IDS.github,
    user_id: DEMO_USER_ID,
    workspace_id: DEMO_WORKSPACE_ID,
    name: "GitHub (Demo)",
    provider: "github",
    auth_type: "oauth2",
    vault_secret_id: "demo-vault-github",
    scopes: ["repo"],
    is_valid: true,
  },
];

// Runs — a mix of completed, failed, and in-progress
const demoRuns = [
  {
    id: RUN_IDS.run1,
    program_id: PROGRAM_IDS.emailToSlack,
    triggered_by: DEMO_USER_ID,
    status: "completed",
    started_at: iso(3),
    completed_at: iso(2.5),
    user_id: DEMO_USER_ID,
    prompt_tokens: 842,
    completion_tokens: 215,
    total_tokens: 1057,
    estimated_cost_usd: 0.0032,
    connector_api_calls: 2,
    model_call_count: 1,
    execution_mode: "autonomous",
  },
  {
    id: RUN_IDS.run2,
    program_id: PROGRAM_IDS.emailToSlack,
    triggered_by: DEMO_USER_ID,
    status: "completed",
    started_at: iso(27),
    completed_at: iso(26.5),
    user_id: DEMO_USER_ID,
    prompt_tokens: 610,
    completion_tokens: 180,
    total_tokens: 790,
    estimated_cost_usd: 0.0024,
    connector_api_calls: 2,
    model_call_count: 1,
    execution_mode: "autonomous",
  },
  {
    id: RUN_IDS.run3,
    program_id: PROGRAM_IDS.githubIssueToNotion,
    triggered_by: DEMO_USER_ID,
    status: "completed",
    started_at: iso(8),
    completed_at: iso(7.8),
    user_id: DEMO_USER_ID,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0.0001,
    connector_api_calls: 2,
    model_call_count: 0,
    execution_mode: "autonomous",
  },
  {
    id: RUN_IDS.run4,
    program_id: PROGRAM_IDS.dailyDigest,
    triggered_by: DEMO_USER_ID,
    status: "failed",
    started_at: iso(31),
    completed_at: iso(31),
    error_message: "Connector authentication expired: Gmail OAuth token needs refresh.",
    user_id: DEMO_USER_ID,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    estimated_cost_usd: 0,
    connector_api_calls: 1,
    model_call_count: 0,
    execution_mode: "autonomous",
  },
  {
    id: RUN_IDS.run5,
    program_id: PROGRAM_IDS.dailyDigest,
    triggered_by: DEMO_USER_ID,
    status: "completed",
    started_at: iso(7),
    completed_at: iso(6.9),
    user_id: DEMO_USER_ID,
    prompt_tokens: 450,
    completion_tokens: 120,
    total_tokens: 570,
    estimated_cost_usd: 0.0018,
    connector_api_calls: 2,
    model_call_count: 1,
    execution_mode: "autonomous",
  },
];

const demoNodeExecutions = [
  // Run 1 — Email → Slack (all completed)
  { id: "40000000-0000-0000-0000-000000000001", run_id: RUN_IDS.run1, node_id: "trigger-1", status: "completed", started_at: iso(3), completed_at: iso(3), prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, connector_api_calls: 0, model_call_count: 0, stored_full_prompt: false, stored_full_input: false, stored_full_output: false },
  { id: "40000000-0000-0000-0000-000000000002", run_id: RUN_IDS.run1, node_id: "gmail-1", status: "completed", started_at: iso(3), completed_at: iso(2.9), prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, connector_api_calls: 1, model_call_count: 0, stored_full_prompt: false, stored_full_input: false, stored_full_output: false },
  { id: "40000000-0000-0000-0000-000000000003", run_id: RUN_IDS.run1, node_id: "filter-1", status: "completed", started_at: iso(2.9), completed_at: iso(2.9), prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, connector_api_calls: 0, model_call_count: 0, stored_full_prompt: false, stored_full_input: false, stored_full_output: false },
  { id: "40000000-0000-0000-0000-000000000004", run_id: RUN_IDS.run1, node_id: "agent-1", status: "completed", started_at: iso(2.9), completed_at: iso(2.6), prompt_tokens: 842, completion_tokens: 215, total_tokens: 1057, estimated_cost_usd: 0.0032, connector_api_calls: 0, model_call_count: 1, stored_full_prompt: false, stored_full_input: false, stored_full_output: false },
  { id: "40000000-0000-0000-0000-000000000005", run_id: RUN_IDS.run1, node_id: "slack-1", status: "completed", started_at: iso(2.6), completed_at: iso(2.5), prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, connector_api_calls: 1, model_call_count: 0, stored_full_prompt: false, stored_full_input: false, stored_full_output: false },
  // Run 3 — GitHub → Notion (completed)
  { id: "40000000-0000-0000-0000-000000000006", run_id: RUN_IDS.run3, node_id: "trigger-1", status: "completed", started_at: iso(8), completed_at: iso(8), prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, connector_api_calls: 0, model_call_count: 0, stored_full_prompt: false, stored_full_input: false, stored_full_output: false },
  { id: "40000000-0000-0000-0000-000000000007", run_id: RUN_IDS.run3, node_id: "github-1", status: "completed", started_at: iso(8), completed_at: iso(7.9), prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, connector_api_calls: 1, model_call_count: 0, stored_full_prompt: false, stored_full_input: false, stored_full_output: false },
  { id: "40000000-0000-0000-0000-000000000008", run_id: RUN_IDS.run3, node_id: "notion-1", status: "completed", started_at: iso(7.9), completed_at: iso(7.8), prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, connector_api_calls: 1, model_call_count: 0, stored_full_prompt: false, stored_full_input: false, stored_full_output: false },
  // Run 4 — Daily Digest (failed at Gmail step)
  { id: "40000000-0000-0000-0000-000000000009", run_id: RUN_IDS.run4, node_id: "trigger-1", status: "completed", started_at: iso(31), completed_at: iso(31), prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, connector_api_calls: 0, model_call_count: 0, stored_full_prompt: false, stored_full_input: false, stored_full_output: false },
  { id: "40000000-0000-0000-0000-000000000010", run_id: RUN_IDS.run4, node_id: "gmail-1", status: "failed", started_at: iso(31), completed_at: iso(31), error_message: "Connector authentication expired", prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, connector_api_calls: 1, model_call_count: 0, stored_full_prompt: false, stored_full_input: false, stored_full_output: false },
  // Run 5 — Daily Digest (completed)
  { id: "40000000-0000-0000-0000-000000000011", run_id: RUN_IDS.run5, node_id: "trigger-1", status: "completed", started_at: iso(7), completed_at: iso(7), prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, connector_api_calls: 0, model_call_count: 0, stored_full_prompt: false, stored_full_input: false, stored_full_output: false },
  { id: "40000000-0000-0000-0000-000000000012", run_id: RUN_IDS.run5, node_id: "gmail-1", status: "completed", started_at: iso(7), completed_at: iso(6.98), prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, connector_api_calls: 1, model_call_count: 0, stored_full_prompt: false, stored_full_input: false, stored_full_output: false },
  { id: "40000000-0000-0000-0000-000000000013", run_id: RUN_IDS.run5, node_id: "filter-1", status: "completed", started_at: iso(6.98), completed_at: iso(6.98), prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, connector_api_calls: 0, model_call_count: 0, stored_full_prompt: false, stored_full_input: false, stored_full_output: false },
  { id: "40000000-0000-0000-0000-000000000014", run_id: RUN_IDS.run5, node_id: "step-1", status: "completed", started_at: iso(6.98), completed_at: iso(6.95), prompt_tokens: 450, completion_tokens: 120, total_tokens: 570, estimated_cost_usd: 0.0018, connector_api_calls: 0, model_call_count: 1, stored_full_prompt: false, stored_full_input: false, stored_full_output: false },
  { id: "40000000-0000-0000-0000-000000000015", run_id: RUN_IDS.run5, node_id: "gmail-2", status: "completed", started_at: iso(6.95), completed_at: iso(6.9), prompt_tokens: 0, completion_tokens: 0, total_tokens: 0, estimated_cost_usd: 0, connector_api_calls: 1, model_call_count: 0, stored_full_prompt: false, stored_full_input: false, stored_full_output: false },
];

// ── Core functions ───────────────────────────────────────────────────────────

const SEED_TABLES = [
  "node_executions",
  "runs",
  "connections",
  "programs",
  "workspaces",
] as const;

async function wipe() {
  console.log("🧹  Wiping demo data …");
  for (const table of SEED_TABLES) {
    // Delete rows that match our deterministic demo IDs
    if (table === "node_executions") {
      const ids = demoNodeExecutions.map((n) => n.id);
      await db.from(table).delete().in("id", ids);
    } else if (table === "runs") {
      const ids = demoRuns.map((r) => r.id);
      await db.from(table).delete().in("id", ids);
    } else if (table === "connections") {
      const ids = demoConnections.map((c) => c.id);
      await db.from(table).delete().in("id", ids);
    } else if (table === "programs") {
      const ids = demoPrograms.map((p) => p.id);
      await db.from(table).delete().in("id", ids);
    } else if (table === "workspaces") {
      await db.from(table).delete().eq("id", DEMO_WORKSPACE_ID);
    }
  }
  console.log("✅  Demo data wiped.");
}

async function seed() {
  console.log("🌱  Seeding demo data …");

  // 1. Workspace
  const { error: wsErr } = await db
    .from("workspaces")
    .upsert(demoWorkspace, { onConflict: "id" });
  if (wsErr) throw new Error(`Workspace: ${wsErr.message}`);
  console.log("   ✔ workspace");

  // 2. Programs
  for (const prog of demoPrograms) {
    const { error } = await db
      .from("programs")
      .upsert(prog, { onConflict: "id" });
    if (error) throw new Error(`Program "${prog.name}": ${error.message}`);
  }
  console.log(`   ✔ ${demoPrograms.length} programs`);

  // 3. Connections
  for (const conn of demoConnections) {
    const { error } = await db
      .from("connections")
      .upsert(conn, { onConflict: "id" });
    if (error) throw new Error(`Connection "${conn.name}": ${error.message}`);
  }
  console.log(`   ✔ ${demoConnections.length} connections`);

  // 4. Runs
  for (const run of demoRuns) {
    const { error } = await db
      .from("runs")
      .upsert(run, { onConflict: "id" });
    if (error) throw new Error(`Run ${run.id}: ${error.message}`);
  }
  console.log(`   ✔ ${demoRuns.length} runs`);

  // 5. Node executions
  for (const ne of demoNodeExecutions) {
    const { error } = await db
      .from("node_executions")
      .upsert(ne, { onConflict: "id" });
    if (error) throw new Error(`NodeExec ${ne.id}: ${error.message}`);
  }
  console.log(`   ✔ ${demoNodeExecutions.length} node executions`);

  console.log("\n🎉  Demo seed complete!");
  console.log(`   Workspace:  ${DEMO_WORKSPACE_ID}`);
  console.log(`   Programs:   ${demoPrograms.map((p) => p.name).join(", ")}`);
  console.log(`   Runs:       ${demoRuns.length} (${demoRuns.filter((r) => r.status === "completed").length} completed, ${demoRuns.filter((r) => r.status === "failed").length} failed)`);
}

// ── CLI entry ────────────────────────────────────────────────────────────────
const command = process.argv[2] ?? "seed";

async function main() {
  try {
    if (command === "reset") {
      await wipe();
      await seed();
    } else {
      await seed();
    }
  } catch (err) {
    console.error("\n❌  Seed failed:", err);
    process.exit(1);
  }
}

main();
