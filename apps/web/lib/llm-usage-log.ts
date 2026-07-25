import { after } from "next/server";
import { createServiceClient } from "@/lib/api";

/* Web-side LLM usage logging — the counterpart of the runtime's
   _log_llm_usage. Genesis (and any future web-side LLM caller) appends one
   llm_usage_logs row per model call so the admin cost/finance pages see the
   full picture, not just workflow/agent runs.

   estimated_cost_usd is RAW provider cost. It is only known exactly when the
   provider reports it (OpenRouter with usage accounting); for other providers
   we record tokens with cost 0 rather than guessing. Fire-and-forget: a
   logging failure must never fail the call that produced it. */

export type LlmUsageLike = {
  // OpenAI-compatible
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
  // Anthropic
  input_tokens?: number | null;
  output_tokens?: number | null;
  // OpenRouter usage accounting
  cost?: number | null;
} | null | undefined;

function nonNegative(value: unknown): number {
  const n = Number(value);
  return Number.isFinite(n) && n > 0 ? n : 0;
}

export function recordLlmUsage(opts: {
  userId: string;
  model: string;
  usage: LlmUsageLike;
  billing: "platform" | "byok";
  source: string; // e.g. "genesis"
  workspaceId?: string | null;
}): void {
  if (!opts.userId) return;

  const usage = opts.usage ?? {};
  const promptTokens = nonNegative(usage.prompt_tokens ?? usage.input_tokens);
  const completionTokens = nonNegative(usage.completion_tokens ?? usage.output_tokens);
  let totalTokens = nonNegative(usage.total_tokens);
  if (totalTokens === 0) totalTokens = promptTokens + completionTokens;
  const costUsd = Math.round(nonNegative(usage.cost) * 1e6) / 1e6;

  const baseRow = {
    user_id: opts.userId,
    workspace_id: opts.workspaceId ?? null,
    run_id: null,
    model: opts.model,
    prompt_tokens: promptTokens,
    completion_tokens: completionTokens,
    total_tokens: totalTokens,
    estimated_cost_usd: costUsd,
  };
  // Genesis usage is metered via genesis_uses_* quotas, not credits, so
  // billed_credits stays 0 — the finances page shows it as unbilled platform
  // cost rather than pretending it was charged.
  const enrichedRow = { ...baseRow, source: opts.source, billing: opts.billing, billed_credits: 0 };

  const db = createServiceClient();
  const insertTask = async () => {
    const enriched = await (db as any).from("llm_usage_logs").insert(enrichedRow);
    if (!enriched.error) return;
    const message = String(enriched.error.message ?? "").toLowerCase();
    const missingBillingColumns =
      message.includes("column") &&
      ["source", "billing", "billed_credits"].some((column) => message.includes(column));
    if (!missingBillingColumns) {
      console.warn("[llm-usage] insert failed:", enriched.error.message);
      return;
    }
    // Billing columns not migrated yet (20260708120000): keep the base row.
    const base = await (db as any).from("llm_usage_logs").insert(baseRow);
    if (base.error) console.warn("[llm-usage] insert failed:", base.error.message);
  };

  // Schedule with after() so the insert survives the serverless freeze that can
  // follow the response (a bare fire-and-forget promise loses the usage row and
  // undermines cost tracking). Falls back to a detached promise if called
  // outside a request scope, where after() is unavailable.
  try {
    after(() => insertTask().catch((error) => {
      console.warn("[llm-usage] insert failed:", error instanceof Error ? error.message : "unknown error");
    }));
  } catch {
    void insertTask().catch(() => undefined);
  }
}
