import { describe, expect, it } from "vitest";
import { analyzeFailure, CATEGORY_LABEL } from "@/lib/runs/failure-analysis";

const NODE_MAP = {
  "loop-emails": { label: "Loop through emails", type: "step" },
  "notion-write": { label: "Write to Notion", type: "connection" },
};

describe("analyzeFailure", () => {
  it("classifies a recognised error and offers the fix for that category", () => {
    const result = analyzeFailure(
      "run-1",
      null,
      [{ node_id: "notion-write", error_message: "401 unauthorized: token expired" }],
      NODE_MAP,
    );

    expect(result.overall_category).toBe("auth_expired");
    expect(result.fix_suggestions[0].action_url).toBe("/connections");
  });

  it("never builds a summary with a broken article", () => {
    // Regression: summaries interpolated the raw enum behind an article,
    // producing "a unknown error" and "a auth expired error". The wording now
    // leads with the label, so no article is involved for any category.
    const samples: Record<string, string> = {
      api_rate_limit: "429 too many requests",
      auth_expired: "token expired",
      timeout: "deadline exceeded",
      permission_denied: "403 forbidden",
      unknown: "something inexplicable",
    };
    for (const [category, message] of Object.entries(samples)) {
      const summary = analyzeFailure(
        "run-1",
        null,
        [{ node_id: "loop-emails", error_message: message }],
        NODE_MAP,
      ).root_cause_summary;

      expect(summary).not.toMatch(/\ba\s+[aeiou]/i);
      expect(summary.startsWith(CATEGORY_LABEL[category as keyof typeof CATEGORY_LABEL])).toBe(true);
    }

    const result = analyzeFailure(
      "run-1",
      "'coroutine' object has no attribute 'enqueue'",
      [{ node_id: "loop-emails", error_message: "'coroutine' object has no attribute 'enqueue'" }],
      NODE_MAP,
    );

    expect(result.root_cause_summary).not.toMatch(/\ba (?=[aeiou])/i);
    expect(result.root_cause_summary).toBe(
      'Unclassified error in "Loop through emails".',
    );
  });

  it("names the node instead of echoing the raw error the page already shows", () => {
    const runError = "Some very long runtime traceback that is already rendered above";
    const result = analyzeFailure(
      "run-1",
      runError,
      [{ node_id: "loop-emails", error_message: "connection timed out" }],
      NODE_MAP,
    );

    expect(result.root_cause_summary).not.toContain(runError);
    expect(result.root_cause_summary).toContain("Loop through emails");
  });

  it("summarises multi-node failures by count and first node", () => {
    // Execution order and confidence order disagree on purpose: the node that
    // failed first is the unclassified one (confidence 0.3), the rate limit that
    // follows classifies at 0.95. "First:" must follow execution order — it used
    // to name the highest-confidence node, so it named the second failure.
    const result = analyzeFailure(
      "run-1",
      null,
      [
        { node_id: "notion-write", error_message: "something inexplicable" },
        { node_id: "loop-emails", error_message: "429 too many requests" },
      ],
      NODE_MAP,
    );

    expect(result.root_cause_summary).toBe(
      '2 nodes failed. First: "Write to Notion" — unclassified error.',
    );
    // The overall category still comes from the best-classified failure.
    expect(result.overall_category).toBe("api_rate_limit");
  });

  it("falls back to the run-level error when a node recorded none", () => {
    const result = analyzeFailure(
      "run-1",
      "permission denied writing to the database",
      [{ node_id: "notion-write", error_message: null }],
      NODE_MAP,
    );

    expect(result.overall_category).toBe("permission_denied");
    expect(result.nodes[0].error_message).toBe(
      "permission denied writing to the database",
    );
  });

  it("reports honestly when there is nothing to analyse", () => {
    const result = analyzeFailure("run-1", null, [], NODE_MAP);

    expect(result.overall_category).toBe("unknown");
    expect(result.nodes).toEqual([]);
    expect(result.root_cause_summary).toBe("This run recorded no node-level errors.");
  });
});
