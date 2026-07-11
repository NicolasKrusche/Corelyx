// Phase 2 of decomposed generation: resolves the "pending" connection-node
// placeholders that lib/genesis/plan-prompt.ts asks Phase 1 to emit, one
// narrow call per provider actually used in the plan — each call sees only
// that provider's operation docs, not the whole selected-connector catalog.
//
// Operates on the RAW parsed JSON from the model, before normalizeSchema /
// normalizeProgramDraft run — those functions rebuild connection-node config
// from a fixed field allowlist (provider/scope_access/scope_required/
// operation/operation_params) and would silently strip the "pending" marker
// and "purpose" field this module depends on. Callers must run this before
// handing the schema to the existing normalize/validate pipeline, so by the
// time that pipeline sees the schema, every resolved node already has a
// complete, ordinary oauth/http config — exactly what a compliant single-shot
// model would have produced, and no different from that pipeline's
// perspective. Nodes whose resolve call fails are left as the "pending"
// shape, which normalizes into a valid-but-unconfigured connection node (see
// normalizeConfig in lib/workflow/normalize.ts) rather than crashing anything.

import { CONNECTOR_DEFINITIONS } from "@/lib/genesis/prompt";
import { extractJson } from "@/lib/genesis/parsing";

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === "object" && v !== null && !Array.isArray(v);
}

export interface PendingNode {
  id: string;
  purpose: string;
  connectionName: string | null;
}

/**
 * Groups every "pending" connection node in the raw (unnormalized) parsed
 * schema by provider. A node counts as pending when the model followed the
 * plan-mode instruction (connector_type:"pending"), or — defensively, for a
 * model that ignored the instruction and half-filled it — when it's a
 * connection node with a provider/purpose but no operation yet.
 */
export function collectPendingConnectionGroups(rawSchema: unknown): Map<string, PendingNode[]> {
  const groups = new Map<string, PendingNode[]>();
  if (!isRecord(rawSchema) || !Array.isArray(rawSchema.nodes)) return groups;

  for (const rawNode of rawSchema.nodes) {
    if (!isRecord(rawNode) || rawNode.type !== "connection") continue;
    const config = rawNode.config;
    if (!isRecord(config)) continue;

    const isPending =
      config.connector_type === "pending" ||
      (!config.connector_type && !config.operation && typeof config.purpose === "string");
    if (!isPending) continue;

    const provider = typeof config.provider === "string" ? config.provider.toLowerCase().trim() : "";
    const id = typeof rawNode.id === "string" ? rawNode.id : "";
    if (!provider || !id) continue;

    const purpose =
      typeof config.purpose === "string" && config.purpose.trim()
        ? config.purpose
        : typeof rawNode.description === "string" && rawNode.description.trim()
          ? rawNode.description
          : typeof rawNode.label === "string"
            ? rawNode.label
            : id;

    const entry: PendingNode = {
      id,
      purpose,
      connectionName: typeof rawNode.connection === "string" ? rawNode.connection : null,
    };

    const list = groups.get(provider) ?? [];
    list.push(entry);
    groups.set(provider, list);
  }

  return groups;
}

/** One-line descriptions of a node's immediate neighbors, for resolve-call context. */
export function describeNeighbors(rawSchema: unknown, nodeId: string): { upstream: string[]; downstream: string[] } {
  const upstream: string[] = [];
  const downstream: string[] = [];
  if (!isRecord(rawSchema) || !Array.isArray(rawSchema.nodes) || !Array.isArray(rawSchema.edges)) {
    return { upstream, downstream };
  }
  const nodes = rawSchema.nodes;
  const edges = rawSchema.edges;

  const describe = (id: unknown): string | null => {
    const node = nodes.find((n) => isRecord(n) && n.id === id);
    if (!isRecord(node)) return null;
    const label = typeof node.label === "string" ? node.label : String(id);
    const config = isRecord(node.config) ? node.config : {};
    const purpose =
      typeof config.purpose === "string" && config.purpose
        ? config.purpose
        : typeof node.description === "string"
          ? node.description
          : "";
    return `${String(id)} (${String(node.type ?? "node")}) "${label}"${purpose ? `: ${purpose}` : ""}`;
  };

  for (const edge of edges) {
    if (!isRecord(edge)) continue;
    if (edge.to === nodeId) {
      const d = describe(edge.from);
      if (d) upstream.push(d);
    }
    if (edge.from === nodeId) {
      const d = describe(edge.to);
      if (d) downstream.push(d);
    }
  }
  return { upstream, downstream };
}

export interface ResolveNodeContext extends PendingNode {
  upstream: string[];
  downstream: string[];
}

export function buildResolveSystemPrompt(provider: string, capabilitySection?: string | null): string {
  const def = CONNECTOR_DEFINITIONS[provider];
  const opsDoc =
    def?.full ??
    def?.medium ??
    def?.stub ??
    `${provider.toUpperCase()}: no documented native operations for this provider — resolve every node below as an HTTP connection instead.`;
  const gapSection = def?.gapReference ? `\n${def.gapReference}\n` : "";
  // Live, metadata-only capability data introspected from the user's real
  // connection just now (Genesis V2) — real resource/property names, but
  // already pseudonymized to [CATEGORY_N] placeholders by the caller before
  // this ever reaches a prompt. Copy placeholders verbatim into
  // operation_params; only the caller can rehydrate them back to real values.
  const liveCapabilities = capabilitySection ? `\n${capabilitySection}\n` : "";

  return `You are resolving connector operations for one provider in a workflow Corelyx Genesis already planned. For each node listed in the user message, choose the operation that matches its stated purpose and fill its parameters.

${opsDoc}
${gapSection}${liveCapabilities}
If nothing above covers a node's purpose, resolve it as an HTTP connection instead: {"connector_type":"http","method":"GET|POST|PUT|PATCH|DELETE","url":"https://...","auth_type":"bearer","auth_value":"__OAUTH_CONNECTION__","query_params":[],"headers":[],"body":null,"parse_response":true,"timeout_seconds":30,"retry":null} (use auth_value:"__USER_ASSIGNED__" instead of "__OAUTH_CONNECTION__" if the node has no connection name). Never refuse a node — pick the closest fit.

Rules:
  - Required params must never be left empty — use "__USER_ASSIGNED__" only for a genuinely unknown resource identifier a human must supply (never a fake-looking value).
  - operation_params values may reference an upstream node's output via {{node_id.field}}, using the exact field names shown in that operation's → output:{...} above, or the upstream node's stated purpose if it isn't one of this provider's own operations.
  - scope_access: "read" for read-only operations, "write" or "read_write" exactly when the operation has side effects — never default to "read_write".

Return ONLY a single raw JSON object keyed by node id, no explanation, no markdown, no code fences:
{"<node_id>": {"connector_type":"oauth","operation":"<name>","operation_params":{...},"scope_access":"read|write|read_write","scope_required":[]}}`;
}

export function buildResolveUserMessage(nodes: ResolveNodeContext[], taskContext: string): string {
  const nodeLines = nodes
    .map((n) => {
      const conn = n.connectionName ? ` (connection: "${n.connectionName}")` : "";
      const up = n.upstream.length ? `\n    upstream: ${n.upstream.join("; ")}` : "";
      const down = n.downstream.length ? `\n    downstream: ${n.downstream.join("; ")}` : "";
      return `  - ${n.id}${conn}: ${n.purpose}${up}${down}`;
    })
    .join("\n");

  return `TASK: <user_input>${taskContext}</user_input>

NODES TO RESOLVE:
${nodeLines}`;
}

/**
 * Runs one resolve call per provider group (concurrently) and merges any
 * resolved node configs back into the raw schema in place. Best-effort per
 * provider: a failed or malformed response for one provider leaves that
 * provider's nodes as the "pending" placeholder shape rather than touching
 * anything else — never worse than leaving that connector unresolved.
 */
export async function resolvePendingConnections(
  rawSchema: unknown,
  taskContext: string,
  callModel: (systemPrompt: string, userMessage: string) => Promise<string>,
  onProviderStart?: (provider: string) => void,
  capabilityByProvider?: Map<string, string>
): Promise<{ resolvedProviders: string[]; failedProviders: string[] }> {
  const groups = collectPendingConnectionGroups(rawSchema);
  const resolvedProviders: string[] = [];
  const failedProviders: string[] = [];
  if (groups.size === 0 || !isRecord(rawSchema) || !Array.isArray(rawSchema.nodes)) {
    return { resolvedProviders, failedProviders };
  }

  const nodesById = new Map<string, Record<string, unknown>>();
  for (const n of rawSchema.nodes) {
    if (isRecord(n) && typeof n.id === "string") nodesById.set(n.id, n);
  }

  await Promise.all(
    Array.from(groups.entries()).map(async ([provider, nodes]) => {
      onProviderStart?.(provider);
      try {
        const contextualNodes: ResolveNodeContext[] = nodes.map((n) => ({
          ...n,
          ...describeNeighbors(rawSchema, n.id),
        }));
        const systemPrompt = buildResolveSystemPrompt(provider, capabilityByProvider?.get(provider) ?? null);
        const userMessage = buildResolveUserMessage(contextualNodes, taskContext);
        const text = await callModel(systemPrompt, userMessage);
        const parsed = JSON.parse(extractJson(text));
        if (!isRecord(parsed)) throw new Error("Resolve response was not a JSON object");

        let anyResolved = false;
        for (const n of nodes) {
          const resolved = parsed[n.id];
          if (!isRecord(resolved)) continue;
          const node = nodesById.get(n.id);
          if (!node) continue;
          node.config = resolved;
          anyResolved = true;
        }
        if (anyResolved) resolvedProviders.push(provider);
        else failedProviders.push(provider);
      } catch {
        failedProviders.push(provider);
      }
    })
  );

  return { resolvedProviders, failedProviders };
}
