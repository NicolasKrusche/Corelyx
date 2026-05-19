"use client";

import { useId, useState, useRef, useCallback } from "react";

export type DayUsage = {
  date: string;
  runs: number;
  failed: number;
  cost_usd: number;
};

type Period = "7d" | "30d";

function fmt(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ─── SVG Sparkline ─────────────────────────────────────────────────────────

interface SparklineProps {
  data: number[];
  dates: string[];
  color: string;
  gradId: string;
  formatValue: (v: number) => string;
  isEmpty: boolean;
}

function Sparkline({ data, dates, color, gradId, formatValue, isEmpty }: SparklineProps) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [hovered, setHovered] = useState<number | null>(null);

  const W = 300;
  const H = 56;
  const PAD = 3;

  const max = Math.max(...data, 0.001);
  const pts = data.map((v, i) => ({
    x: PAD + (i / Math.max(data.length - 1, 1)) * (W - PAD * 2),
    y: H - PAD - (v / max) * (H - PAD * 2),
  }));

  function buildPath(points: typeof pts): string {
    if (points.length < 2) return "";
    let d = `M ${points[0].x.toFixed(2)},${points[0].y.toFixed(2)}`;
    for (let i = 1; i < points.length; i++) {
      const prev = points[i - 1];
      const curr = points[i];
      const cpx = (prev.x + curr.x) / 2;
      d += ` C ${cpx.toFixed(2)},${prev.y.toFixed(2)} ${cpx.toFixed(2)},${curr.y.toFixed(2)} ${curr.x.toFixed(2)},${curr.y.toFixed(2)}`;
    }
    return d;
  }

  const linePath = buildPath(pts);
  const areaPath = linePath
    ? `${linePath} L ${pts[pts.length - 1].x.toFixed(2)},${H} L ${pts[0].x.toFixed(2)},${H} Z`
    : "";

  const handleMouseMove = useCallback(
    (e: React.MouseEvent<SVGSVGElement>) => {
      if (!svgRef.current || data.length === 0) return;
      const rect = svgRef.current.getBoundingClientRect();
      const rel = (e.clientX - rect.left) / rect.width;
      const idx = Math.min(data.length - 1, Math.max(0, Math.round(rel * (data.length - 1))));
      setHovered(idx);
    },
    [data.length],
  );

  const tooltipPct = hovered !== null ? (hovered / (data.length - 1)) * 100 : null;

  if (isEmpty) {
    return (
      <div className="mt-3 flex h-14 items-center justify-center">
        <p className="text-center text-xs text-muted-foreground">
          No activity yet — run a workflow to see your chart.
        </p>
      </div>
    );
  }

  return (
    <div className="relative mt-3" onMouseLeave={() => setHovered(null)}>
      {hovered !== null && tooltipPct !== null && (
        <div
          className="pointer-events-none absolute -top-9 z-20 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
          style={{ left: `${Math.min(Math.max(tooltipPct, 6), 88)}%`, transform: "translateX(-50%)" }}
        >
          <p className="font-semibold leading-tight">{formatValue(data[hovered])}</p>
          <p className="text-muted-foreground leading-tight">{fmt(dates[hovered])}</p>
        </div>
      )}
      <svg
        ref={svgRef}
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        className="h-14 w-full cursor-crosshair"
        onMouseMove={handleMouseMove}
      >
        <defs>
          <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor={color} stopOpacity="0.2" />
            <stop offset="100%" stopColor={color} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill={`url(#${gradId})`} />
        <path d={linePath} fill="none" stroke={color} strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
        {hovered !== null && (
          <>
            <line x1={pts[hovered].x} y1={PAD} x2={pts[hovered].x} y2={H} stroke={color} strokeWidth="0.75" strokeDasharray="3 3" opacity="0.6" />
            <circle cx={pts[hovered].x} cy={pts[hovered].y} r="3" fill={color} stroke="white" strokeWidth="1.5" />
          </>
        )}
      </svg>
      <div className="mt-1 flex justify-between select-none text-[9px] text-muted-foreground/60">
        <span>{fmt(dates[0])}</span>
        <span>{fmt(dates[Math.floor((dates.length - 1) / 2)])}</span>
        <span>{fmt(dates[dates.length - 1])}</span>
      </div>
    </div>
  );
}

// ─── Period selector ────────────────────────────────────────────────────────

function PeriodSelector({ value, onChange }: { value: Period; onChange: (p: Period) => void }) {
  return (
    <div className="flex items-center gap-0.5 rounded-lg border border-border bg-muted/40 p-0.5 text-xs">
      {(["7d", "30d"] as const).map((p) => (
        <button
          key={p}
          type="button"
          onClick={() => onChange(p)}
          className={
            value === p
              ? "rounded-md bg-background px-2.5 py-1 font-medium shadow-sm"
              : "rounded-md px-2.5 py-1 text-muted-foreground hover:text-foreground transition-colors"
          }
        >
          {p}
        </button>
      ))}
    </div>
  );
}

// ─── Exported component ────────────────────────────────────────────────────

export function UsageCharts({ history }: { history: DayUsage[] }) {
  const uid = useId().replace(/:/g, "");
  const [period, setPeriod] = useState<Period>("30d");

  const sliced = period === "7d" ? history.slice(-7) : history;
  const dates = sliced.map((d) => d.date);
  const runs = sliced.map((d) => d.runs);
  const costs = sliced.map((d) => d.cost_usd);
  const failed = sliced.map((d) => d.failed);

  const totalRuns = runs.reduce((a, b) => a + b, 0);
  const totalFailed = failed.reduce((a, b) => a + b, 0);
  const totalCost = costs.reduce((a, b) => a + b, 0);
  const totalCancelled = 0;
  const isEmpty = totalRuns === 0;

  // "vs prior period" comparison
  const priorSlice = period === "7d" ? history.slice(-14, -7) : history.slice(0, 15);
  const priorRuns = priorSlice.reduce((a, d) => a + d.runs, 0);
  const priorCost = priorSlice.reduce((a, d) => a + d.cost_usd, 0);
  const runDelta = totalRuns - priorRuns;
  const costDelta = totalCost - priorCost;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {/* Runs chart */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <rect x="1" y="4" width="2" height="7" rx="0.5" fill="currentColor" opacity="0.5"/>
                <rect x="5" y="2" width="2" height="9" rx="0.5" fill="currentColor" opacity="0.7"/>
                <rect x="9" y="1" width="2" height="10" rx="0.5" fill="currentColor"/>
              </svg>
              Workflow runs
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground/70">Total executions across all programs</p>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-xl font-bold">{totalRuns.toLocaleString()} runs</span>
              {priorRuns > 0 && runDelta !== 0 && (
                <span className={`text-xs font-medium ${runDelta >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {runDelta >= 0 ? "+" : ""}{runDelta} vs prior
                </span>
              )}
            </div>
          </div>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>

        <Sparkline
          data={runs}
          dates={dates}
          color="hsl(var(--primary))"
          gradId={`${uid}-runs`}
          formatValue={(v) => `${v} run${v !== 1 ? "s" : ""}`}
          isEmpty={isEmpty}
        />

        {!isEmpty && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-primary opacity-70" />
              Runs {totalRuns}
            </span>
            {totalFailed > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-red-500 opacity-70" />
                Failed {totalFailed}
              </span>
            )}
            {totalCancelled > 0 && (
              <span className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm bg-muted-foreground opacity-50" />
                Cancelled {totalCancelled}
              </span>
            )}
          </div>
        )}
      </div>

      {/* AI spend chart */}
      <div className="rounded-2xl border border-border bg-card p-4">
        <div className="flex items-start justify-between gap-2">
          <div>
            <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
              <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                <path d="M6 1.5C3.5 1.5 1.5 3.5 1.5 6S3.5 10.5 6 10.5 10.5 8.5 10.5 6 8.5 1.5 6 1.5Z" stroke="currentColor" strokeWidth="1.2"/>
                <path d="M6 3.5v1M6 7.5v1M4 5h4M4 7h4" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round"/>
              </svg>
              AI spend
            </div>
            <p className="mt-0.5 text-xs text-muted-foreground/70">Platform-billed AI cost (excludes BYOK)</p>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-xl font-bold">${totalCost.toFixed(4)}</span>
              <span className="text-xs text-muted-foreground">period</span>
              {priorCost > 0 && costDelta !== 0 && (
                <span className={`text-xs font-medium ${costDelta >= 0 ? "text-green-600" : "text-red-500"}`}>
                  {costDelta >= 0 ? "+" : ""}${costDelta.toFixed(4)}
                </span>
              )}
            </div>
          </div>
          <PeriodSelector value={period} onChange={setPeriod} />
        </div>

        <Sparkline
          data={costs}
          dates={dates}
          color="#22c55e"
          gradId={`${uid}-cost`}
          formatValue={(v) => v === 0 ? "$0" : `$${v.toFixed(4)}`}
          isEmpty={isEmpty}
        />

        {!isEmpty && (
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-muted-foreground">
            <span className="flex items-center gap-1">
              <span className="h-2 w-2 rounded-sm bg-green-500 opacity-70" />
              Spend ${totalCost.toFixed(4)}
            </span>
          </div>
        )}
      </div>
    </div>
  );
}
