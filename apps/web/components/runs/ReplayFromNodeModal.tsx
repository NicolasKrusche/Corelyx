"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";

interface NodeExec {
  node_id: string;
  node_type: string;
  status: string;
  input_payload: unknown;
}

interface ReplayFromNodeModalProps {
  runId: string;
  programId: string;
  nodeExecutions: NodeExec[];
  trigger: React.ReactNode;
}

export function ReplayFromNodeModal({
  runId,
  programId,
  nodeExecutions,
  trigger,
}: ReplayFromNodeModalProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [selectedNode, setSelectedNode] = useState<string>("");
  const [editedInput, setEditedInput] = useState<string>("{}");
  const [state, setState] = useState<"idle" | "loading" | "error">("idle");
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Auto-select first non-trigger node
  useEffect(() => {
    if (open && !selectedNode && nodeExecutions.length > 0) {
      const first = nodeExecutions.find((e) => e.node_type !== "trigger");
      if (first) setSelectedNode(first.node_id);
    }
  }, [open, nodeExecutions, selectedNode]);

  // Pre-fill input with selected node's input
  useEffect(() => {
    if (selectedNode && nodeExecutions.length > 0) {
      const exec = nodeExecutions.find((e) => e.node_id === selectedNode);
      if (exec?.input_payload) {
        setEditedInput(JSON.stringify(exec.input_payload, null, 2));
      }
    }
  }, [selectedNode, nodeExecutions]);

  async function handleReplay() {
    if (!selectedNode) return;
    setState("loading");
    setErrorMsg(null);

    let parsedInput: Record<string, unknown>;
    try {
      parsedInput = JSON.parse(editedInput);
    } catch {
      setErrorMsg("Invalid JSON input");
      setState("error");
      return;
    }

    try {
      const res = await fetch(`/api/runs/${runId}/replay-from-node`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ node_id: selectedNode, edited_input: parsedInput }),
      });
      const data = await res.json();
      if (!res.ok) {
        setErrorMsg(data.message || "Failed to start replay");
        setState("error");
        return;
      }
      setOpen(false);
      router.push(`/programs/${programId}/runs/${data.run_id}`);
    } catch {
      setErrorMsg("Network error");
      setState("error");
    }
  }

  return (
    <>
      <span onClick={() => setOpen(true)} className="cursor-pointer">
        {trigger}
      </span>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
          <div className="bg-background rounded-lg border border-border shadow-xl w-full max-w-lg p-6 space-y-4">
            <h2 className="text-lg font-semibold">Replay from Node</h2>
            <p className="text-xs text-muted-foreground">
              Re-execute the workflow starting from a specific node with edited input data.
            </p>

            <div className="space-y-3">
              <div>
                <label className="text-xs font-medium text-muted-foreground">Start from node *</label>
                <select
                  value={selectedNode}
                  onChange={(e) => setSelectedNode(e.target.value)}
                  className="mt-1 h-9 w-full rounded-md border border-border bg-background px-2 text-sm outline-none focus:border-primary"
                >
                  <option value="">Select a node…</option>
                  {nodeExecutions.map((exec) => (
                    <option key={exec.node_id} value={exec.node_id}>
                      {exec.node_id} ({exec.node_type}) — {exec.status}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="text-xs font-medium text-muted-foreground">
                  Input payload (JSON)
                </label>
                <textarea
                  value={editedInput}
                  onChange={(e) => setEditedInput(e.target.value)}
                  rows={8}
                  className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-xs font-mono outline-none focus:border-primary resize-y"
                  placeholder='{"key": "value"}'
                />
              </div>

              {selectedNode && (
                <div className="rounded-md bg-muted/50 p-3 text-xs text-muted-foreground">
                  Nodes that will be re-executed:
                  <ul className="mt-1 space-y-0.5 list-disc list-inside">
                    {nodeExecutions
                      .filter((e) => e.node_id === selectedNode || 
                        nodeExecutions.indexOf(e) > nodeExecutions.findIndex((x) => x.node_id === selectedNode))
                      .map((e) => (
                        <li key={e.node_id} className="font-mono">
                          {e.node_id}
                        </li>
                      ))}
                  </ul>
                </div>
              )}
            </div>

            {errorMsg && (
              <p className="text-xs text-destructive">{errorMsg}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => {
                  setOpen(false);
                  setState("idle");
                  setErrorMsg(null);
                }}
                className="rounded-md px-3 py-1.5 text-xs font-medium hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleReplay}
                disabled={!selectedNode || state === "loading"}
                className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90 transition-colors disabled:opacity-50"
              >
                {state === "loading" ? "Starting…" : "Replay from Node"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
