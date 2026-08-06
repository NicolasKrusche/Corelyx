import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it, vi } from "vitest";

/**
 * ResponsiveContainer measures its parent, which is always 0x0 in jsdom, so the
 * chart never renders. Clone the child with a fixed size instead — everything
 * else in recharts stays real.
 */
vi.mock("recharts", async (importOriginal) => {
  const actual = await importOriginal<typeof import("recharts")>();
  return {
    ...actual,
    ResponsiveContainer: ({ children }: { children: React.ReactElement }) =>
      React.cloneElement(children, { width: 800, height: 300 } as never),
  };
});

const { CostChart } = await import("../analytics/CostChart");
const { ModelComparisonChart } = await import("../analytics/ModelComparisonChart");
const { NodeTypeCostChart } = await import("../analytics/NodeTypeCostChart");

import type {
  CostTrendRow,
  ModelComparisonRow,
  NodeTypeCostRow,
} from "@/lib/program-analytics";
import { formatUsdAsCredits } from "@/lib/credit-packs";

/**
 * Plain react-dom render. @testing-library/react is installed without its
 * required @testing-library/dom peer, so its RenderResult type is unusable —
 * and recharts v3 needs a real client render (effects run) rather than
 * renderToStaticMarkup, which is what the other component tests use.
 */
const mounted: { root: Root; host: HTMLElement }[] = [];

function render(ui: React.ReactElement): HTMLElement {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root = createRoot(host);
  act(() => root.render(ui));
  mounted.push({ root, host });
  return host;
}

afterEach(() => {
  for (const { root, host } of mounted.splice(0)) {
    act(() => root.unmount());
    host.remove();
  }
});

describe("billed USD → credits", () => {
  it("converts at the 1,000-credits-per-dollar consumption rate", () => {
    expect(formatUsdAsCredits(5.7313)).toBe("5,731");
    expect(formatUsdAsCredits(0.117)).toBe("117");
    expect(formatUsdAsCredits(0.0152)).toBe("15.2");
    expect(formatUsdAsCredits(0)).toBe("0");
  });

  it("keeps precision on sub-credit amounts instead of rounding them away", () => {
    // A node that cost a fraction of a credit must not read as free.
    expect(formatUsdAsCredits(0.00035)).toBe("0.35");
  });

  it("drops a trailing .0 so axis ticks read 30, 60, 90 — not 30.0, 60.0", () => {
    expect(formatUsdAsCredits(0.03)).toBe("30");
  });
});

/** "Aug 1, 8:30 AM" — asserted by shape so the test survives any timezone. */
const DATE_TICK = /[A-Z][a-z]{2} \d{1,2}, \d{1,2}:\d{2}\s?(AM|PM)/;

function trendRow(over: Partial<CostTrendRow> = {}): CostTrendRow {
  return {
    runId: "run-1",
    status: "completed",
    startedAt: "2026-08-01T08:30:00.000Z",
    costUsd: 0.117,
    promptTokens: 1000,
    completionTokens: 500,
    totalTokens: 1500,
    modelCallCount: 4,
    durationMs: 61_000,
    ...over,
  };
}

describe("CostChart", () => {
  it("renders real date ticks from the camelCase rows getCostTrend returns", () => {
    // Regression: the component used to declare snake_case props (started_at,
    // total_cost_usd) while the data layer returns camelCase. The page cast the
    // prop to `any`, so every tick rendered as "Invalid Date" and every cost
    // read as undefined.
    const container = render(
      <CostChart
        data={[
          trendRow({ runId: "a", startedAt: "2026-08-01T08:30:00.000Z" }),
          trendRow({ runId: "b", startedAt: "2026-08-02T09:15:00.000Z" }),
        ]}
      />
    );

    expect(container.textContent).not.toContain("Invalid Date");
    expect(container.textContent).toMatch(DATE_TICK);
  });

  it("drops runs whose timestamp will not parse instead of charting them", () => {
    const container = render(
      <CostChart
        data={[
          trendRow({ runId: "good" }),
          trendRow({ runId: "bad", startedAt: "not-a-timestamp" }),
        ]}
      />
    );

    expect(container.textContent).not.toContain("Invalid Date");
  });

  it("plots credits, never dollars or tokens", () => {
    const container = render(
      <CostChart
        data={[trendRow(), trendRow({ runId: "b", startedAt: "2026-08-02T09:15:00.000Z" })]}
      />
    );

    expect(container.textContent).not.toContain("$");
    expect(container.textContent).not.toContain("Tokens");
    // One point per run, coloured by status rather than by a second series.
    expect(container.querySelectorAll(".recharts-line-dots circle").length).toBe(2);
  });

  it("colours the dots by run status so the caption's green/red is true", () => {
    const container = render(
      <CostChart
        data={[
          trendRow({ runId: "ok", status: "completed" }),
          trendRow({
            runId: "bad",
            status: "failed",
            startedAt: "2026-08-02T09:15:00.000Z",
          }),
        ]}
      />
    );

    const fills = Array.from(
      container.querySelectorAll(".recharts-line-dots circle")
    ).map((c) => c.getAttribute("fill"));

    expect(new Set(fills).size).toBe(2);
  });

  it("shows an empty state rather than an axis of nothing", () => {
    const container = render(<CostChart data={[]} />);
    expect(container.textContent).toContain("No run data available yet");
  });
});

describe("ModelComparisonChart", () => {
  const row: ModelComparisonRow = {
    model: "openai/gpt-oss-120b",
    callCount: 520,
    totalTokens: 16_536_844,
    totalCostUsd: 2.7071,
    avgCostPerCall: 0.0052,
    source: "workflow",
  };

  it("renders bars from the camelCase rows getModelComparison returns", () => {
    // Same prop-shape drift as CostChart: total_cost_usd was always undefined,
    // so the chart drew an empty plot area.
    const container = render(<ModelComparisonChart data={[row]} />);

    expect(container.querySelectorAll(".recharts-bar-rectangle").length).toBe(1);
    expect(container.textContent).toContain("gpt-oss-120b");
  });

  it("labels the axis in credits, not dollars or tokens", () => {
    const container = render(<ModelComparisonChart data={[row]} />);

    expect(container.textContent).not.toContain("$");
    expect(container.textContent).not.toContain("Tokens");
  });
});

describe("NodeTypeCostChart", () => {
  const row: NodeTypeCostRow = {
    nodeType: "llm",
    executionCount: 178,
    totalTokens: 11_077_356,
    totalCostUsd: 2.7071,
    avgTokens: 62_232,
    avgCostUsd: 0.0152,
  };

  it("reports credits per node type and drops the token column", () => {
    const container = render(<NodeTypeCostChart data={[row]} />);
    const headers = Array.from(container.querySelectorAll("th")).map(
      (th) => th.textContent
    );

    expect(headers).toEqual([
      "Node Type",
      "Executions",
      "Total Credits",
      "Avg Credits",
    ]);
    expect(container.textContent).not.toContain("$");
    // 2.7071 USD billed = 2,707 credits; 0.0152 = 15.2.
    expect(container.textContent).toContain("2,707");
    expect(container.textContent).toContain("15.2");
  });
});
