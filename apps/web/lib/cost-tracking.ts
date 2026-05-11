/**
 * Cost tracking and billing alerts for LLM usage.
 * 
 * Tracks per-user and per-workspace spending with alerting.
 */

import { createServiceClient } from "@/lib/api";

export interface CostAlert {
  type: "warning" | "critical" | "limit_reached";
  userId: string;
  workspaceId?: string;
  currentSpend: number;
  limit: number;
  percentage: number;
  message: string;
}

export interface UsageStats {
  userId: string;
  period: "day" | "month";
  totalTokens: number;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
  runCount: number;
  modelBreakdown: Record<string, { tokens: number; cost: number }>;
}

type LlmUsageLogInsert = {
  user_id: string;
  workspace_id?: string;
  run_id: string;
  model: string;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  estimated_cost_usd: number;
};

type LlmUsageLogRow = {
  estimated_cost_usd: number | null;
  total_tokens: number | null;
  prompt_tokens: number | null;
  completion_tokens: number | null;
  model: string | null;
};

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

// Default limits (can be overridden per user/workspace)
const DEFAULT_DAILY_LIMIT_USD = 10;
const DEFAULT_MONTHLY_LIMIT_USD = 100;
const WARNING_THRESHOLD = 0.8;  // 80%
const CRITICAL_THRESHOLD = 0.95;  // 95%

/**
 * Track LLM usage for a run.
 */
export async function trackLLMUsage({
  userId,
  workspaceId,
  runId,
  model,
  promptTokens,
  completionTokens,
  estimatedCost,
}: {
  userId: string;
  workspaceId?: string;
  runId: string;
  model: string;
  promptTokens: number;
  completionTokens: number;
  estimatedCost: number;
}): Promise<void> {
  const db = createServiceClient();
  
  try {
    const usageLog: LlmUsageLogInsert = {
      user_id: userId,
      workspace_id: workspaceId,
      run_id: runId,
      model,
      prompt_tokens: promptTokens,
      completion_tokens: completionTokens,
      total_tokens: promptTokens + completionTokens,
      estimated_cost_usd: estimatedCost,
    };

    await db.from("llm_usage_logs").insert(usageLog as never);
  } catch (e) {
    console.error("[cost-tracking] Failed to log LLM usage:", e);
    // Don't throw - cost tracking should not break execution
  }
}

/**
 * Get daily usage for a user.
 */
export async function getDailyUsage(userId: string): Promise<{
  totalCost: number;
  totalTokens: number;
  runCount: number;
}> {
  const db = createServiceClient();
  
  const today = new Date().toISOString().split("T")[0];
  
  const { data, error } = await db
    .from("llm_usage_logs")
    .select("estimated_cost_usd, total_tokens")
    .eq("user_id", userId)
    .gte("created_at", today)
    .lt("created_at", today + "T23:59:59");
  
  if (error || !data) {
    return { totalCost: 0, totalTokens: 0, runCount: 0 };
  }
  const rows = asRows<LlmUsageLogRow>(data);
  
  return {
    totalCost: rows.reduce((sum, row) => sum + (row.estimated_cost_usd || 0), 0),
    totalTokens: rows.reduce((sum, row) => sum + (row.total_tokens || 0), 0),
    runCount: rows.length,
  };
}

/**
 * Get monthly usage for a user.
 */
export async function getMonthlyUsage(userId: string): Promise<{
  totalCost: number;
  totalTokens: number;
  runCount: number;
}> {
  const db = createServiceClient();
  
  const now = new Date();
  const monthStart = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`;
  
  const { data, error } = await db
    .from("llm_usage_logs")
    .select("estimated_cost_usd, total_tokens")
    .eq("user_id", userId)
    .gte("created_at", monthStart);
  
  if (error || !data) {
    return { totalCost: 0, totalTokens: 0, runCount: 0 };
  }
  const rows = asRows<LlmUsageLogRow>(data);
  
  return {
    totalCost: rows.reduce((sum, row) => sum + (row.estimated_cost_usd || 0), 0),
    totalTokens: rows.reduce((sum, row) => sum + (row.total_tokens || 0), 0),
    runCount: rows.length,
  };
}

/**
 * Check if user has exceeded spending limits.
 */
export async function checkSpendingLimits(userId: string): Promise<CostAlert | null> {
  const daily = await getDailyUsage(userId);
  
  // Get user's limit (default for now, could be from profile)
  const dailyLimit = DEFAULT_DAILY_LIMIT_USD;
  const percentage = daily.totalCost / dailyLimit;
  
  if (percentage >= 1.0) {
    return {
      type: "limit_reached",
      userId,
      currentSpend: daily.totalCost,
      limit: dailyLimit,
      percentage: 100,
      message: `Daily spending limit reached ($${daily.totalCost.toFixed(2)} / $${dailyLimit})`,
    };
  }
  
  if (percentage >= CRITICAL_THRESHOLD) {
    return {
      type: "critical",
      userId,
      currentSpend: daily.totalCost,
      limit: dailyLimit,
      percentage: percentage * 100,
      message: `Critical: Daily spending at ${(percentage * 100).toFixed(0)}%`,
    };
  }
  
  if (percentage >= WARNING_THRESHOLD) {
    return {
      type: "warning",
      userId,
      currentSpend: daily.totalCost,
      limit: dailyLimit,
      percentage: percentage * 100,
      message: `Warning: Daily spending at ${(percentage * 100).toFixed(0)}%`,
    };
  }
  
  return null;
}

/**
 * Check if a run should be allowed based on spending limits.
 */
export async function enforceSpendingLimits(userId: string): Promise<{
  allowed: boolean;
  alert?: CostAlert;
}> {
  const alert = await checkSpendingLimits(userId);
  
  if (!alert) {
    return { allowed: true };
  }
  
  // Block new runs if limit reached
  if (alert.type === "limit_reached") {
    return { allowed: false, alert };
  }
  
  // Warn but allow if just warning/critical
  return { allowed: true, alert };
}

/**
 * Get usage statistics for a date range.
 */
export async function getUsageStats({
  userId,
  startDate,
  endDate,
}: {
  userId: string;
  startDate: string;
  endDate: string;
}): Promise<UsageStats> {
  const db = createServiceClient();
  
  const { data, error } = await db
    .from("llm_usage_logs")
    .select("*")
    .eq("user_id", userId)
    .gte("created_at", startDate)
    .lte("created_at", endDate);
  
  if (error || !data) {
    return {
      userId,
      period: "day",
      totalTokens: 0,
      promptTokens: 0,
      completionTokens: 0,
      estimatedCost: 0,
      runCount: 0,
      modelBreakdown: {},
    };
  }
  const rows = asRows<LlmUsageLogRow>(data);
  
  const modelBreakdown: UsageStats["modelBreakdown"] = {};
  
  for (const row of rows) {
    const model = row.model || "unknown";
    if (!modelBreakdown[model]) {
      modelBreakdown[model] = { tokens: 0, cost: 0 };
    }
    modelBreakdown[model].tokens += row.total_tokens || 0;
    modelBreakdown[model].cost += row.estimated_cost_usd || 0;
  }
  
  return {
    userId,
    period: "day",
    totalTokens: rows.reduce((sum, r) => sum + (r.total_tokens || 0), 0),
    promptTokens: rows.reduce((sum, r) => sum + (r.prompt_tokens || 0), 0),
    completionTokens: rows.reduce((sum, r) => sum + (r.completion_tokens || 0), 0),
    estimatedCost: rows.reduce((sum, r) => sum + (r.estimated_cost_usd || 0), 0),
    runCount: rows.length,
    modelBreakdown,
  };
}
