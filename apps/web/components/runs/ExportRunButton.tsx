"use client";

import { useCallback } from "react";
import { Download } from "lucide-react";
import type { ProgramSchema } from "@flowos/schema";

// ─── Types ────────────────────────────────────────────────────────────────────

type NodeExecutionRow = {
  id: string;
  node_id: string;
  status: string;
  input_payload: unknown;
  output_payload: unknown;
  error_message: string | null;
  retry_count: number | null;
  started_at: string | null;
  completed_at: string | null;
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  billed_cost_usd: number;
  connector_api_calls: number;
  model_call_count: number;
  created_at: string;
};

interface ExportRunButtonProps {
  runId: string;
  programSchema: ProgramSchema;
  nodeExecutions: NodeExecutionRow[];
  runMetadata?: {
    status: string;
    triggered_by: string;
    started_at: string | null;
    completed_at: string | null;
    error_message: string | null;
    total_tokens: number;
    prompt_tokens: number;
    completion_tokens: number;
    billed_cost_usd: number;
    connector_api_calls: number;
    model_call_count: number;
  };
}

// ─── Component ────────────────────────────────────────────────────────────────

export function ExportRunButton({
  runId,
  programSchema,
  nodeExecutions,
  runMetadata,
}: ExportRunButtonProps) {
  const handleExport = useCallback(() => {
    const payload = {
      exported_at: new Date().toISOString(),
      run_id: runId,
      run: runMetadata ?? null,
      program_schema: programSchema,
      node_executions: nodeExecutions.map((exec) => ({
        id: exec.id,
        node_id: exec.node_id,
        status: exec.status,
        input_payload: exec.input_payload,
        output_payload: exec.output_payload,
        error_message: exec.error_message,
        retry_count: exec.retry_count,
        started_at: exec.started_at,
        completed_at: exec.completed_at,
        prompt_tokens: exec.prompt_tokens,
        completion_tokens: exec.completion_tokens,
        total_tokens: exec.total_tokens,
        billed_cost_usd: exec.billed_cost_usd,
        connector_api_calls: exec.connector_api_calls,
        model_call_count: exec.model_call_count,
        created_at: exec.created_at,
      })),
    };

    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `run-${runId}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, [runId, programSchema, nodeExecutions, runMetadata]);

  return (
    <button
      type="button"
      onClick={handleExport}
      className="inline-flex items-center gap-1.5 rounded-md border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground hover:bg-accent transition-colors"
    >
      <Download className="h-3.5 w-3.5" />
      Export
    </button>
  );
}
