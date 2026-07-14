/**
 * API payload types. The mobile app talks to the Corelyx web API over HTTP, so
 * these are locally-declared mirrors of the JSON shapes those routes return
 * (there is no compile-time coupling to packages/schema). Keep in sync with:
 *   - apps/web/app/api/runs/route.ts + [id]/route.ts
 *   - apps/web/app/api/approvals/route.ts
 *   - apps/web/app/api/agents/route.ts + [id]/route.ts
 *   - apps/web/app/api/entitlements|credits/balance|sidebar-data|connections
 */

export type RunStatus =
  | "pending"
  | "running"
  | "completed"
  | "success"
  | "failed"
  | "cancelled"
  | "waiting_approval"
  | "paused"
  | "skipped";

export interface RunListItem {
  id: string;
  program_id: string;
  program_name?: string | null;
  status: RunStatus | string;
  triggered_by: string;
  started_at: string | null;
  completed_at: string | null;
  error_message: string | null;
  created_at: string;
}

export interface NodeExecution {
  id: string;
  node_id: string;
  status: string;
  input_payload: unknown;
  output_payload: unknown;
  error_message: string | null;
  retry_count: number | null;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
}

export interface RunDetail {
  run: {
    id: string;
    program_id: string;
    status: string;
    triggered_by: string;
    started_at: string | null;
    completed_at: string | null;
    error_message: string | null;
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
    estimated_cost_usd: number;
    created_at: string;
  };
  program: { id: string; name: string; schema: { nodes?: Array<{ id: string; label?: string; type?: string }> } };
  node_executions: NodeExecution[];
}

/** approvals + agent questions share one endpoint; discriminate on context.kind. */
export interface ApprovalContext {
  kind?: "question";
  question?: string;
  node_label?: string;
  program_id?: string;
  reason?: string;
  approver?: string;
  input?: unknown;
  requested_action?: string;
}

export interface ApprovalItem {
  id: string;
  status: "pending" | "approved" | "rejected";
  context: ApprovalContext | null;
  created_at: string;
  node_executions?: {
    run_id?: string;
    runs?: { program_id?: string; programs?: { name?: string } };
  } | null;
}

export interface AgentListItem {
  id: string;
  name: string;
  description: string | null;
  state: string;
  createdAt: string;
  scheduled: boolean;
  hasQuestion: boolean;
}

export interface AgentFlag {
  id: string;
  subject: string | null;
  snippet: string | null;
  reason: string | null;
  categories: string[];
  origin: "auto" | "agent";
  sourceProvider: string | null;
  createdAt: string;
}

export interface AgentReport {
  id: string;
  title: string;
  body: string;
  data: {
    metrics?: Array<{ label: string; value: string | number; tone?: "default" | "good" | "warn" | "bad" }>;
    outcome?: "success" | "partial" | "failed";
  } | null;
  dry_run: boolean;
  created_at: string;
}

export interface AgentDetail {
  agent: {
    id: string;
    name: string;
    description: string | null;
    state: string;
    createdAt: string;
    scheduled: boolean;
    capabilities?: {
      allow_writes?: boolean;
      max_cost_usd?: number | null;
      allow_spawning?: boolean;
      max_spawns?: number | null;
    };
  };
  latestRun: { id: string; status: string; created_at: string } | null;
  reports: AgentReport[];
  pendingQuestions: Array<{ id: string; question: string }>;
}

export type Tier = "free" | "plus" | "pro" | "builder" | "unlimited";

export interface Entitlements {
  tier: Tier;
  entitlements: { agents: boolean; [k: string]: unknown };
  usage: {
    runs: { current: number; total: number | null };
    genesis: { usesThisMonth: number; maxUses: number | null };
  };
}

export interface CreditBalance {
  availableIncluded: number | null;
  availablePurchased: number;
  total: number | null;
}

export interface SidebarData {
  pendingApprovalsCount: number;
  failedRunsCount: number;
  activeWorkspaceId: string | null;
  workspaces: Array<{ id: string; name: string; role?: string; tier?: string }>;
  usage: {
    runs: { current: number; total: number | null };
    genesis?: { usesThisMonth: number; maxUses: number | null };
    aiCredits: CreditBalance | null;
  };
}

export interface Connection {
  id: string;
  name: string;
  provider: string;
  auth_type: "oauth" | "api_key";
  is_valid: boolean;
  last_validated_at: string | null;
  created_at: string;
}
