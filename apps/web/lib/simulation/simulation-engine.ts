/**
 * TypeScript wrapper for the Python simulation engine.
 * This will be called from the Next.js API route.
 */

export interface NodeSimulationState {
  node_id: string;
  status: "pending" | "running" | "completed" | "failed" | "skipped";
  input_data: Record<string, unknown>;
  output_data: Record<string, unknown>;
  error_message: string | null;
  started_at: string | null;
  completed_at: string | null;
  duration_ms: number;
  estimated_cost_usd: number;
  estimated_tokens: number;
  is_mock: boolean;
}

export interface SimulationResult {
  program_id: string;
  simulation_id: string;
  status: "completed" | "failed" | "partial";
  started_at: string;
  completed_at: string | null;
  total_duration_ms: number;
  nodes: Record<string, NodeSimulationState>;
  edges_traversed: Array<{
    edge_id: string;
    source: string;
    target: string;
    type: string;
    mapping: Record<string, unknown>;
  }>;
  errors: string[];
  total_estimated_cost_usd: number;
  total_estimated_tokens: number;
}

/**
 * Runs a program simulation by calling the Python simulation engine.
 * In a real implementation, this would call a Python subprocess or API.
 * For now, we provide a TypeScript implementation that mirrors the Python logic.
 */
export async function runProgramSimulation(
  schema: {
    program_id: string;
    program_name: string;
    nodes: Array<{
      id: string;
      type: string;
      label: string;
      description: string;
      position: { x: number; y: number };
      status: string;
      connection: string | null;
      config: Record<string, unknown>;
    }>;
    edges: Array<{
      id: string;
      from_node: string;
      to: string;
      type: string;
      data_mapping: Record<string, unknown> | null;
      condition: string | null;
      label: string | null;
    }>;
    execution_mode: string;
  },
  triggerPayload: Record<string, unknown> | null = null
): Promise<SimulationResult> {
  // Import the Python simulation engine dynamically
  // For now, we'll implement a TypeScript version that mirrors the Python logic
  
  const simulationId = `sim_${Date.now()}`;
  const startedAt = new Date().toISOString();
  const startTime = Date.now();

  // Build node and edge maps
  const nodesById = new Map(schema.nodes.map(n => [n.id, n]));
  const edges = schema.edges;

  // Node states
  const nodeStates: Record<string, NodeSimulationState> = {};
  const edgesTraversed: SimulationResult["edges_traversed"] = [];
  const errors: string[] = [];

  // Helper to get dependencies
  const getDependencies = (nodeId: string): string[] => {
    return edges.filter(e => e.to === nodeId).map(e => e.from_node);
  };

  // Helper to get downstream nodes
  const getDownstream = (nodeId: string): string[] => {
    return edges.filter(e => e.from_node === nodeId).map(e => e.to);
  };

  // Find trigger node
  const triggerNode = schema.nodes.find(n => n.type === "trigger");
  if (!triggerNode) {
    return {
      program_id: schema.program_id,
      simulation_id: simulationId,
      status: "failed",
      started_at: startedAt,
      completed_at: new Date().toISOString(),
      total_duration_ms: Date.now() - startTime,
      nodes: {},
      edges_traversed: [],
      errors: ["No trigger node found in schema"],
      total_estimated_cost_usd: 0,
      total_estimated_tokens: 0,
    };
  }

  // Initialize all node states
  for (const node of schema.nodes) {
    nodeStates[node.id] = {
      node_id: node.id,
      status: "pending",
      input_data: {},
      output_data: {},
      error_message: null,
      started_at: null,
      completed_at: null,
      duration_ms: 0,
      estimated_cost_usd: 0,
      estimated_tokens: 0,
      is_mock: true,
    };
  }

  // Topological execution using BFS from trigger
  const executed = new Set<string>();
  const queue = [triggerNode.id];

  // Mock response generators
  const getMockResponse = (provider: string, operation: string, config: Record<string, unknown>) => {
    const mockResponses: Record<string, Record<string, unknown>> = {
      gmail: {
        list_emails: { emails: [{ id: "mock_1", threadId: "thread_1", subject: "Test Email", from: "sender@example.com", received_at: new Date().toISOString(), preview: "Preview...", is_read: false }] },
        read_email: { id: "mock_1", subject: "Test Email", from: "sender@example.com", body: "Email body content", labels: ["INBOX"] },
        send_email: { id: "sent_mock_1", threadId: "thread_sent" },
      },
      slack: {
        send_message: { ts: "1234567890.123", channel: "C123456" },
        list_channels: { channels: [{ id: "C123456", name: "general" }, { id: "C789012", name: "random" }] },
      },
      notion: {
        create_database_entry: { id: "notion_mock_1", url: "https://notion.so/mock_1" },
        query_database: { results: [{ id: "result_1", properties: {} }] },
      },
      github: {
        create_issue: { number: 1, url: "https://github.com/owner/repo/issues/1" },
        list_prs: { pull_requests: [] },
      },
      sheets: {
        read_range: { range: "A1:C3", values: [["Header1", "Header2", "Header3"], ["Row1Col1", "Row1Col2", "Row1Col3"]] },
        append_row: { updatedRange: "A4:C4", updatedRows: 1 },
      },
      http_generic: {
        request: { status_code: 200, data: { mock: true, message: "HTTP Generic mock response" }, headers: { "content-type": "application/json" } },
      },
      postgresql: {
        query: { rows: [{ id: 1, name: "Test" }, { id: 2, name: "Test 2" }], row_count: 2, columns: ["id", "name"] },
        execute: { rows_affected: 1 },
        list_tables: { tables: ["users", "orders", "products"] },
      },
      redis: {
        get: { value: "mock_value", exists: true },
        set: { ok: true },
        incr: { value: 42 },
      },
    };

    const providerLower = provider.toLowerCase().replace("http_generic", "http_generic");
    const opLower = operation.toLowerCase();
    
    if (mockResponses[providerLower] && mockResponses[providerLower][opLower]) {
      return mockResponses[providerLower][opLower];
    }
    return { mock: true, provider: providerLower, operation: opLower };
  };

  // Execute nodes in topological order
  while (queue.length > 0) {
    const nodeId = queue.shift()!;
    
    if (executed.has(nodeId)) continue;
    
    const node = nodesById.get(nodeId);
    if (!node) continue;

    // Check dependencies
    const deps = getDependencies(nodeId);
    if (!deps.every(d => executed.has(d))) {
      queue.push(nodeId); // Re-queue for later
      continue;
    }

    // Mark as running
    nodeStates[nodeId].status = "running";
    nodeStates[nodeId].started_at = new Date().toISOString();
    const nodeStartTime = Date.now();

    // Resolve input data from upstream
    let inputData: Record<string, unknown> = { ...(triggerPayload || {}) };
    
    for (const depId of deps) {
      const depOutput = nodeStates[depId].output_data;
      // Find edge mapping
      const edge = edges.find(e => e.from_node === depId && e.to === nodeId);
      if (edge && edge.data_mapping) {
        for (const [targetKey, sourceExpr] of Object.entries(edge.data_mapping)) {
          if (typeof sourceExpr === "string" && sourceExpr.startsWith("{{") && sourceExpr.endsWith("}}")) {
            // Expression - for mock, just use a sample value
            const expr = sourceExpr.slice(2, -2).trim();
            if (expr.includes(".")) {
              const parts = expr.split(".");
              let val: unknown = depOutput;
              for (const part of parts) {
                val = (val as Record<string, unknown>)?.[part];
              }
              inputData[targetKey] = val;
            }
          } else {
            inputData[targetKey] = depOutput[sourceExpr as string];
          }
        }
      } else {
        // No mapping, merge all
        inputData = { ...inputData, ...depOutput };
      }
    }

    nodeStates[nodeId].input_data = inputData;

    // Simulate based on node type
    let outputData: Record<string, unknown> = {};
    let estimatedCost = 0;
    let estimatedTokens = 0;

    switch (node.type) {
      case "trigger":
        outputData = {
          triggered: true,
          payload: triggerPayload,
          trigger_type: node.config.trigger_type || "manual",
          is_mock: true,
        };
        break;

      case "connection":
        const provider = (node.config.provider as string) || (node.config.connector_type as string) || "unknown";
        const operation = (node.config.operation as string) || (node.config.method as string) || "list";
        outputData = getMockResponse(provider, operation, node.config);
        outputData.is_mock = true;
        break;

      case "agent":
      case "agent_task":
        outputData = {
          response: `[MOCK AGENT] Processed input with keys: ${Object.keys(inputData).join(", ")}`,
          model: node.config.model || "gpt-4o-mini",
          estimated_tokens: JSON.stringify(inputData).length / 4 + 50,
          estimated_cost_usd: 0.001,
          is_mock: true,
        };
        estimatedTokens = outputData.estimated_tokens as number;
        estimatedCost = outputData.estimated_cost_usd as number;
        break;

      case "step":
        const logicType = (node.config.logic_type as string) || "transform";
        switch (logicType) {
          case "transform":
            outputData = { result: `[MOCK TRANSFORM] Input keys: ${Object.keys(inputData).join(", ")}`, is_mock: true };
            break;
          case "filter":
            outputData = { passed: true, filtered_data: inputData, is_mock: true };
            break;
          case "branch":
            outputData = { branch: "default", data: inputData, is_mock: true };
            break;
          case "loop":
            outputData = { iterations: 2, item_var: node.config.item_var || "item", is_mock: true };
            break;
          case "delay":
            outputData = { delayed_seconds: node.config.seconds || 1, is_mock: true };
            break;
          default:
            outputData = { result: `[MOCK STEP ${logicType.toUpperCase()}]`, is_mock: true };
        }
        break;

      case "note":
        outputData = { note: (node.config.content as string) || "", is_mock: true };
        break;

      case "group":
        outputData = { group_id: node.id, child_count: ((node.config.childIds as string[]) || []).length, is_mock: true };
        break;

      default:
        outputData = { error: `Unknown node type: ${node.type}`, is_mock: true };
    }

    // Update node state
    nodeStates[nodeId].output_data = outputData;
    nodeStates[nodeId].status = "completed";
    nodeStates[nodeId].completed_at = new Date().toISOString();
    nodeStates[nodeId].duration_ms = Date.now() - nodeStartTime;
    nodeStates[nodeId].estimated_cost_usd = estimatedCost;
    nodeStates[nodeId].estimated_tokens = estimatedTokens;

    // Record edges traversed
    for (const edge of edges) {
      if (edge.from_node === nodeId && executed.has(edge.to)) {
        edgesTraversed.push({
          edge_id: edge.id,
          source: edge.from_node,
          target: edge.to,
          type: edge.type,
          mapping: edge.data_mapping || {},
        });
      }
    }

    executed.add(nodeId);

    // Add downstream to queue
    for (const downstream of getDownstream(nodeId)) {
      if (!executed.has(downstream)) {
        queue.push(downstream);
      }
    }
  }

  const completedAt = new Date().toISOString();
  const totalDuration = Date.now() - startTime;

  // Calculate totals
  let totalCost = 0;
  let totalTokens = 0;
  for (const state of Object.values(nodeStates)) {
    totalCost += state.estimated_cost_usd;
    totalTokens += state.estimated_tokens;
  }

  // Check for failures
  const failedNodes = Object.values(nodeStates).filter(s => s.status === "failed");
  const status = failedNodes.length > 0 
    ? (failedNodes.length < Object.keys(nodeStates).length ? "partial" : "failed")
    : "completed";

  return {
    program_id: schema.program_id,
    simulation_id: simulationId,
    status,
    started_at: startedAt,
    completed_at: completedAt,
    total_duration_ms: totalDuration,
    nodes: nodeStates,
    edges_traversed: edgesTraversed,
    errors,
    total_estimated_cost_usd: Math.round(totalCost * 1000000) / 1000000,
    total_estimated_tokens: totalTokens,
  };
}