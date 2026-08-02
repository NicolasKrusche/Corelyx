import { NextResponse } from "next/server";
import { apiError, getAuthUser } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { createServerClient } from "@/lib/supabase/server";

/**
 * POST /api/runs/query — Natural-language query over the user's run history.
 *
 * Accepts { query: string } and translates it into Supabase filters via a
 * simple pattern-mapping approach (no external LLM dependency).
 * Guardrails: SELECT-only, scoped to active workspace, max 100 rows.
 */

// ─── NL → filter mapping ────────────────────────────────────────────────────

type RunFilter = {
  status?: string;
  min_created_at?: string;
  max_created_at?: string;
  program_id?: string;
  trigger_source?: string;
  min_cost?: number;
  max_cost?: number;
  order_by: string;
  ascending: boolean;
  limit: number;
};

const STATUS_PATTERNS: Array<[RegExp, string]> = [
  [/failed|failure|error|errors|failures/i, "failed"],
  [/completed|success|succeeded|ok|clean/i, "completed"],
  [/running|in.progress|active|executing/i, "running"],
  [/cancelled|canceled|aborted/i, "cancelled"],
  [/waiting|approval|pending/i, "waiting_approval"],
];

const TRIGGER_PATTERNS: Array<[RegExp, string]> = [
  [/manual|manual(ly)?|hand/i, "manual"],
  [/webhook|http|api[- ]?call/i, "webhook"],
  [/cron|schedule|scheduled|timer|every/i, "cron"],
  [/trigger|triggered/i, "trigger"],
];

function parseRelativeDays(text: string): number | null {
  // "last 7 days", "past 3 days", "24 hours", "48 hr"
  const dayMatch = text.match(/(\d+)\s*(?:days?|d)\b/i);
  if (dayMatch) return parseInt(dayMatch[1], 10);

  const hourMatch = text.match(/(\d+)\s*(?:hours?|hrs?|h)\b/i);
  if (hourMatch) return parseInt(hourMatch[1], 10) / 24;

  // Common shortcuts
  if (/\btoday\b/i.test(text)) return 1;
  if (/\byesterday\b/i.test(text)) return 2;
  if (/\blast\s*week\b/i.test(text)) return 7;
  if (/\blast\s*month\b/i.test(text)) return 30;
  if (/\bthis\s*week\b/i.test(text)) return 7;
  if (/\bthis\s*month\b/i.test(text)) return new Date().getDate(); // days so far in month

  return null;
}

function extractProgramId(text: string): string | null {
  // "for program <uuid>" or "program <uuid>" or "for <uuid>"
  const m = text.match(/(?:for\s+)?program[:\s]+([0-9a-f-]{36})/i);
  if (m) return m[1];
  // Bare UUID
  const uuid = text.match(/\b([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})\b/i);
  if (uuid) return uuid[1];
  return null;
}

function extractCostThreshold(text: string): { min?: number; max?: number } {
  // "cost > $5" or "more than $10" or "over $3"
  const overMatch = text.match(/(?:more\s+than|over|exceed|cost\s*[>≥]|greater)\s*\$?([\d.]+)/i);
  if (overMatch) return { min: parseFloat(overMatch[1]) };

  const underMatch = text.match(/(?:less\s+than|under|below|cost\s*[<≤]|cheaper)\s*\$?([\d.]+)/i);
  if (underMatch) return { max: parseFloat(underMatch[1]) };

  return {};
}

function parseQuery(query: string): RunFilter {
  const filter: RunFilter = {
    order_by: "created_at",
    ascending: false,
    limit: 50,
  };

  const q = query.trim();

  // Status
  for (const [re, status] of STATUS_PATTERNS) {
    if (re.test(q)) {
      filter.status = status;
      break;
    }
  }

  // Time window
  const days = parseRelativeDays(q);
  if (days !== null) {
    filter.min_created_at = new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
  }

  // Program
  const pid = extractProgramId(q);
  if (pid) filter.program_id = pid;

  // Trigger source
  for (const [re, source] of TRIGGER_PATTERNS) {
    if (re.test(q)) {
      filter.trigger_source = source;
      break;
    }
  }

  // Cost threshold
  const cost = extractCostThreshold(q);
  if (cost.min !== undefined) filter.min_cost = cost.min;
  if (cost.max !== undefined) filter.max_cost = cost.max;

  // Sorting
  if (/\bmost\s+expensive|costliest|highest\s+cost|expensive\b/i.test(q)) {
    filter.order_by = "billed_cost_usd";
    filter.ascending = false;
  } else if (/\bleast\s+expensive|cheapest|lowest\s+cost\b/i.test(q)) {
    filter.order_by = "billed_cost_usd";
    filter.ascending = true;
  } else if (/\blongest\b/i.test(q)) {
    filter.order_by = "started_at"; // rough proxy
    filter.ascending = false;
  } else if (/\bnewest|latest|recent\b/i.test(q)) {
    filter.order_by = "created_at";
    filter.ascending = false;
  } else if (/\boldest|first\b/i.test(q)) {
    filter.order_by = "created_at";
    filter.ascending = true;
  }

  // Limit: "top 10", "show 25"
  const limitMatch = q.match(/\b(?:top|show|first|limit)\s+(\d+)\b/i);
  if (limitMatch) {
    filter.limit = Math.min(parseInt(limitMatch[1], 10), 100);
  }

  // "count" / "how many" — user wants a number, not rows (we'll handle in response)
  // We keep max 100 rows anyway.

  return filter;
}

function describeFilter(filter: RunFilter): string {
  const parts: string[] = [];
  if (filter.status) parts.push(`status = '${filter.status}'`);
  if (filter.min_created_at) parts.push(`created_at >= ${filter.min_created_at}`);
  if (filter.max_created_at) parts.push(`created_at <= ${filter.max_created_at}`);
  if (filter.program_id) parts.push(`program_id = ${filter.program_id}`);
  if (filter.trigger_source) parts.push(`trigger_source = '${filter.trigger_source}'`);
  if (filter.min_cost !== undefined) parts.push(`billed_cost_usd >= ${filter.min_cost}`);
  if (filter.max_cost !== undefined) parts.push(`billed_cost_usd <= ${filter.max_cost}`);
  parts.push(`ORDER BY ${filter.order_by} ${filter.ascending ? "ASC" : "DESC"}`);
  parts.push(`LIMIT ${filter.limit}`);
  return `SELECT * FROM runs WHERE ${parts.join(" AND ").replace(/ AND ORDER/, " ORDER").replace(/ AND LIMIT/, " LIMIT")}`;
}

// ─── Route handler ──────────────────────────────────────────────────────────

export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.query !== "string" || body.query.trim().length === 0) {
    return apiError("Missing or empty 'query' string", 400);
  }

  const query: string = body.query;
  const filter = parseQuery(query);
  const description = describeFilter(filter);

  // Resolve workspace scope
  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) {
    return apiError("No active workspace", 400);
  }

  // Get program IDs for this workspace
  const supabase = await createServerClient();
  const { data: programsRaw } = await supabase
    .from("programs")
    .select("id")
    .eq("workspace_id", activeWorkspace.workspaceId);

  const workspaceProgramIds = ((programsRaw ?? []) as Array<{ id: string }>).map((p) => p.id);
  if (workspaceProgramIds.length === 0) {
    return NextResponse.json({
      query,
      generated_sql: description,
      results: [],
      count: 0,
      hint: "No programs in this workspace yet.",
    });
  }

  // Build Supabase query. Cost exposed to users is billed_cost_usd (marked-up
  // platform charge / BYOK pass-through) — never raw estimated_cost_usd, which
  // would leak the platform margin.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let qb: any = supabase
    .from("runs")
    .select(
      "id, program_id, status, triggered_by, trigger_source, started_at, completed_at, error_message, prompt_tokens, completion_tokens, total_tokens, billed_cost_usd, connector_api_calls, model_call_count, created_at, workflow_version, data_region"
    )
    .in("program_id", workspaceProgramIds);

  if (filter.status) {
    qb = qb.eq("status", filter.status);
  }
  if (filter.min_created_at) {
    qb = qb.gte("created_at", filter.min_created_at);
  }
  if (filter.max_created_at) {
    qb = qb.lte("created_at", filter.max_created_at);
  }
  if (filter.program_id && workspaceProgramIds.includes(filter.program_id)) {
    qb = qb.eq("program_id", filter.program_id);
  }
  if (filter.trigger_source) {
    qb = qb.eq("trigger_source", filter.trigger_source);
  }
  if (filter.min_cost !== undefined) {
    qb = qb.gte("billed_cost_usd", filter.min_cost);
  }
  if (filter.max_cost !== undefined) {
    qb = qb.lte("billed_cost_usd", filter.max_cost);
  }

  qb = qb.order(filter.order_by, { ascending: filter.ascending }).limit(filter.limit);

  const { data: runsRaw, error: runsError } = await qb;

  if (runsError) {
    return apiError(`Query failed: ${runsError.message}`, 500);
  }

  const results = (runsRaw ?? []) as Record<string, unknown>[];

  // Enrich with program names
  const { data: progNamesRaw } = await supabase
    .from("programs")
    .select("id, name")
    .in("id", [...new Set(results.map((r) => r.program_id as string))]);

  const nameMap = new Map(
    ((progNamesRaw ?? []) as Array<{ id: string; name: string }>).map((p) => [p.id, p.name])
  );

  const enriched = results.map((r) => ({
    ...r,
    program_name: nameMap.get(r.program_id as string) ?? null,
  }));

  return NextResponse.json({
    query,
    generated_sql: description,
    results: enriched,
    count: enriched.length,
  });
}
