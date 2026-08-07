/**
 * Failure analysis.
 *
 * Classifies node_execution errors from a failed run into a known category and
 * attaches the fix that actually resolves that category, so the run log offers
 * a next step instead of only a stack trace.
 *
 * This is a deterministic rule engine, not a model call — every category below
 * is decided by the regexes in CLASSIFICATION_RULES. It used to POST to a
 * `${RUNTIME_URL}/analyze` endpoint that the runtime has never implemented, so
 * the "LLM-enhanced" path 404'd on every failed run and silently fell back
 * here. That dead call was removed: it cost a round trip per page view, and it
 * was the one internal web→runtime call that carried no shared secret.
 */

// ─── Types ─────────────────────────────────────────────────────────────────

export type ErrorCategory =
  | "api_rate_limit"
  | "auth_expired"
  | "data_format_mismatch"
  | "timeout"
  | "schema_validation"
  | "connection_not_found"
  | "api_key_invalid"
  | "permission_denied"
  | "network_error"
  | "unknown";

export type FixType = "auto_fix" | "manual_fix" | "reconnect";

/**
 * Human wording for a category. Phrased to stand alone as a noun so it can be
 * dropped into a sentence without an article — "a unknown error" and "a auth
 * expired error" were both reachable when summaries interpolated the raw enum.
 */
export const CATEGORY_LABEL: Record<ErrorCategory, string> = {
  api_rate_limit: "Rate limited",
  auth_expired: "Expired credentials",
  data_format_mismatch: "Unexpected data format",
  timeout: "Timed out",
  schema_validation: "Schema validation failed",
  connection_not_found: "Missing connection",
  api_key_invalid: "Invalid API key",
  permission_denied: "Permission denied",
  network_error: "Network error",
  unknown: "Unclassified error",
};

export interface FixSuggestion {
  type: FixType;
  title: string;
  description: string;
  action_url?: string; // deep-link for auto-fix / reconnect
  action_label?: string;
}

export interface NodeAnalysis {
  node_id: string;
  node_label: string;
  node_type: string;
  error_category: ErrorCategory;
  error_message: string;
  root_cause: string;
  fix_suggestions: FixSuggestion[];
  confidence: number; // 0–1
}

export interface FailureAnalysis {
  run_id: string;
  overall_category: ErrorCategory;
  root_cause_summary: string;
  nodes: NodeAnalysis[];
  fix_suggestions: FixSuggestion[];
  analyzed_at: string;
}

export interface NodeExecutionError {
  node_id: string;
  node_label?: string;
  node_type?: string;
  error_message: string | null;
  input_payload?: unknown;
  output_payload?: unknown;
  retry_count?: number | null;
  started_at?: string | null;
  completed_at?: string | null;
}

// ─── Error Classification Rules ────────────────────────────────────────────

interface ClassificationRule {
  test: (msg: string) => boolean;
  category: ErrorCategory;
  rootCause: (msg: string) => string;
  fixes: (nodeId: string) => FixSuggestion[];
  confidence: number;
}

const CLASSIFICATION_RULES: ClassificationRule[] = [
  // API rate limit
  {
    test: (m) => /rate.?limit|too many requests|429|throttl/i.test(m),
    category: "api_rate_limit",
    rootCause: () =>
      "The API provider has rate-limited this request. This typically happens when the workflow makes too many calls in a short window.",
    fixes: (nodeId) => [
      {
        type: "manual_fix",
        title: "Add a delay step before this node",
        description:
          "Insert a Delay node with 10–30 seconds between API calls to stay within the provider's rate limit.",
      },
      {
        type: "manual_fix",
        title: "Reduce retry intensity",
        description:
          "Lower the retry count or increase backoff time on this node to avoid hammering the API.",
      },
    ],
    confidence: 0.95,
  },

  // Auth expired
  {
    test: (m) =>
      /token.?expired|could not be refreshed|unauthorized|401|auth.*fail|please reconnect/i.test(
        m,
      ),
    category: "auth_expired",
    rootCause: () =>
      "The OAuth token or API key for this connection has expired and could not be refreshed automatically.",
    fixes: (nodeId) => [
      {
        type: "reconnect",
        title: "Reconnect this integration",
        description:
          "Navigate to Connections and reconnect the expired integration to get a fresh token.",
        action_url: "/connections",
        action_label: "Go to Connections →",
      },
    ],
    confidence: 0.95,
  },

  // Permission denied
  {
    test: (m) =>
      /permission.?denied|read.?only access|write permission|forbidden|403/i.test(m),
    category: "permission_denied",
    rootCause: () =>
      "The connection or API key lacks the required permissions to perform this operation.",
    fixes: (nodeId) => [
      {
        type: "manual_fix",
        title: "Check connection scopes",
        description:
          "Verify the connection has read/write access as needed. You may need to reconnect with the correct scopes.",
        action_url: "/connections",
        action_label: "Go to Connections →",
      },
    ],
    confidence: 0.9,
  },

  // Connection not found
  {
    test: (m) => /connection.*not found|missing connection|no linked connection/i.test(m),
    category: "connection_not_found",
    rootCause: () =>
      "The connection referenced by this node no longer exists or hasn't been linked to this program.",
    fixes: (nodeId) => [
      {
        type: "manual_fix",
        title: "Link or create a connection",
        description:
          "Go to the node settings and select a valid connection for this step.",
        action_url: "/connections",
        action_label: "Manage Connections →",
      },
    ],
    confidence: 0.95,
  },

  // API key invalid
  {
    test: (m) =>
      /api.?key.*(not found|invalid|missing|revoked)|invalid.*api.?key/i.test(m),
    category: "api_key_invalid",
    rootCause: () =>
      "The API key used by this node is missing, invalid, or has been revoked.",
    fixes: (nodeId) => [
      {
        type: "manual_fix",
        title: "Update the API key",
        description:
          "Go to API Keys settings and add or replace the key used by this node.",
        action_url: "/api-keys",
        action_label: "Go to API Keys →",
      },
    ],
    confidence: 0.95,
  },

  // Timeout
  {
    test: (m) =>
      /timeout|timed? ?out|deadline exceeded|504|gateway timeout/i.test(m),
    category: "timeout",
    rootCause: () =>
      "The operation exceeded the allowed time limit. The upstream service may be slow or the data volume too large.",
    fixes: (nodeId) => [
      {
        type: "manual_fix",
        title: "Increase timeout",
        description:
          "If this is an HTTP node, increase the timeout_seconds in the node configuration.",
      },
      {
        type: "manual_fix",
        title: "Reduce data volume",
        description:
          "Add a Filter or Limit step before this node to reduce the payload size.",
      },
    ],
    confidence: 0.85,
  },

  // Schema validation / data format
  {
    test: (m) =>
      /schema.?valid|invalid.*input|expected.*type|field.*required|malformed|unexpected token|json.?parse|type.?mismatch/i.test(
        m,
      ),
    category: "schema_validation",
    rootCause: () =>
      "The data passed to this node does not match the expected format. An upstream node may have returned unexpected output.",
    fixes: (nodeId) => [
      {
        type: "manual_fix",
        title: "Check upstream node output",
        description:
          "Open the Output tab of the preceding node to see what data was actually produced.",
      },
      {
        type: "manual_fix",
        title: "Add a Transform step",
        description:
          "Insert a Transform step to reshape the data into the expected format before this node.",
      },
    ],
    confidence: 0.8,
  },

  // Network errors
  {
    test: (m) =>
      /ECONNREFUSED|ENOTFOUND|network.?error|fetch.?failed|ECONNRESET|ETIMEDOUT|dns.?lookup/i.test(
        m,
      ),
    category: "network_error",
    rootCause: () =>
      "A network-level error prevented the connection to the external service. The service may be temporarily down or unreachable.",
    fixes: (nodeId) => [
      {
        type: "manual_fix",
        title: "Retry later",
        description:
          "This may be a temporary network issue. Try running the workflow again in a few minutes.",
      },
    ],
    confidence: 0.7,
  },
];

// ─── Classification Engine ─────────────────────────────────────────────────

function classifyError(
  errorMessage: string,
): { category: ErrorCategory; rootCause: string; fixes: FixSuggestion[]; confidence: number } {
  for (const rule of CLASSIFICATION_RULES) {
    if (rule.test(errorMessage)) {
      return {
        category: rule.category,
        rootCause: rule.rootCause(errorMessage),
        fixes: rule.fixes(""),
        confidence: rule.confidence,
      };
    }
  }

  return {
    category: "unknown",
    rootCause: "This error doesn't match a known failure pattern.",
    fixes: [
      {
        type: "manual_fix",
        title: "Check the node's input",
        description:
          "Expand the failed node in the timeline below and compare its input against what the step expects — most unclassified failures come from an upstream value being missing or the wrong shape.",
      },
    ],
    confidence: 0.3,
  };
}

/** Classify a failed run's node errors and collect the fixes worth offering. */
export function analyzeFailure(
  runId: string,
  runError: string | null,
  failedExecs: NodeExecutionError[],
  nodeMap: Record<string, { label?: string; type?: string }>,
): FailureAnalysis {
  const analyzedAt = new Date().toISOString();

  const nodeAnalyses: NodeAnalysis[] = failedExecs.map((exec) => {
    const node = nodeMap[exec.node_id];
    const label = exec.node_label ?? node?.label ?? exec.node_id;
    const type = exec.node_type ?? node?.type ?? "unknown";
    const msg = exec.error_message ?? runError ?? "Unknown error";

    const classification = classifyError(msg);

    return {
      node_id: exec.node_id,
      node_label: label,
      node_type: type,
      error_category: classification.category,
      error_message: msg,
      root_cause: classification.rootCause,
      fix_suggestions: classification.fixes.map((f) => ({
        ...f,
      })),
      confidence: classification.confidence,
    };
  });

  const sortedByConfidence = [...nodeAnalyses].sort((a, b) => b.confidence - a.confidence);
  const overallCategory = sortedByConfidence[0]?.error_category ?? "unknown";

  const seenTitles = new Set<string>();
  const allFixes: FixSuggestion[] = [];
  for (const na of nodeAnalyses) {
    for (const fix of na.fix_suggestions) {
      if (!seenTitles.has(fix.title)) {
        seenTitles.add(fix.title);
        allFixes.push(fix);
      }
    }
  }

  // Name the node and the category rather than echoing the raw error — the run
  // log already prints that verbatim directly above this panel. "First:" is the
  // first failure in execution order (failedExecs arrives created_at ascending),
  // not the best-classified one; only overall_category ranks by confidence.
  const primary = sortedByConfidence[0];
  const first = nodeAnalyses[0];
  const summary = !primary
    ? "This run recorded no node-level errors."
    : nodeAnalyses.length === 1
      ? `${CATEGORY_LABEL[overallCategory]} in "${primary.node_label}".`
      : `${nodeAnalyses.length} nodes failed. First: "${first.node_label}" — ${CATEGORY_LABEL[first.error_category].toLowerCase()}.`;

  return {
    run_id: runId,
    overall_category: overallCategory,
    root_cause_summary: summary,
    nodes: nodeAnalyses,
    fix_suggestions: allFixes,
    analyzed_at: analyzedAt,
  };
}
