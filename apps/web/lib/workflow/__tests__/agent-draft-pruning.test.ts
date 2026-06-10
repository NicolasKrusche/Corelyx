import { describe, it, expect } from "vitest";
import {
  normalizeProgramDraft,
  pruneUnresolvedReferences,
  validateProgramDraft,
} from "../normalize";

// Faithful reconstruction of what buildAgentSystemPrompt asks the model to emit
// for "Show me my last 20 runs, and flag any that failed." — a single read-only
// agent_task that lists runs and reports back.
function agentJson(opts?: { dupTriggerId?: boolean; danglingEdge?: boolean }) {
  const nodes: any[] = [
    {
      id: "n1",
      type: "trigger",
      label: "Manual start",
      description: "Run once on demand.",
      connection: null,
      config: { trigger_type: "manual" },
      position: { x: 100, y: 200 },
      status: "idle",
    },
    {
      id: opts?.dupTriggerId ? "n1" : "n2",
      type: "agent_task",
      label: "Review recent runs",
      description: "List the last 20 runs and flag failures.",
      connection: null,
      config: {
        objective: "List the last 20 runs and report which failed.",
        model: "__USER_ASSIGNED__",
        api_key_ref: "__USER_ASSIGNED__",
        max_iterations: 6,
        tools: ["corelyx.list_runs", "corelyx.report_to_user"],
        scope_access: "read",
        requires_approval: false,
        approval_timeout_hours: 24,
        input_schema: null,
        output_schema: null,
        retry: { max_attempts: 2, backoff: "exponential", backoff_base_seconds: 5, fail_program_on_exhaust: false },
      },
      position: { x: 420, y: 200 },
      status: "idle",
    },
  ];
  const edges: any[] = [{ id: "e1", from: "n1", to: "n2", type: "data_flow" }];
  // Model "be THOROUGH" over-generation: an error-handling branch to a node it
  // never actually emitted.
  if (opts?.danglingEdge) edges.push({ id: "e2", from: "n2", to: "n_missing", type: "data_flow" });
  return {
    version: "1.0",
    program_id: "__GENERATED__",
    program_name: "Recent run review",
    program_type: "agent",
    created_at: "2026-06-10T00:00:00Z",
    updated_at: "2026-06-10T00:00:00Z",
    execution_mode: "autonomous",
    nodes,
    edges,
    triggers: [{ node_id: "n1", type: "manual", is_active: true, last_fired: null, next_scheduled: null }],
    version_history: [],
    metadata: { description: "x", genesis_model: "m", genesis_timestamp: "2026-06-10T00:00:00Z", tags: [] },
  };
}

describe("agent draft generation", () => {
  it("a clean agent graph validates", () => {
    const res = validateProgramDraft(normalizeProgramDraft(agentJson()));
    expect(res.success).toBe(true);
  });

  it("an edge to a missing node fails validation before pruning", () => {
    const res = validateProgramDraft(normalizeProgramDraft(agentJson({ danglingEdge: true })));
    expect(res.success).toBe(false);
  });

  it("pruning unresolved references lets a near-valid generated plan validate", () => {
    const norm = normalizeProgramDraft(agentJson({ danglingEdge: true }));
    const { removedEdges } = pruneUnresolvedReferences(norm);
    expect(removedEdges).toBe(1);
    const res = validateProgramDraft(norm);
    expect(res.success).toBe(true);
    // The legitimate trigger→task edge survives; only the dangling one is gone.
    expect(norm.edges).toHaveLength(1);
    expect(norm.edges[0].to).toBe("n2");
  });

  it("recovers when a duplicate node id orphans an edge target", () => {
    // normalizeProgramDraft regenerates the colliding id, leaving e1 dangling.
    const norm = normalizeProgramDraft(agentJson({ dupTriggerId: true }));
    expect(validateProgramDraft(norm).success).toBe(false);
    pruneUnresolvedReferences(norm);
    expect(validateProgramDraft(norm).success).toBe(true);
  });
});
