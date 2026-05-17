"use client";

import { useId, useState, useRef, useCallback } from "react";

export type DayUsage = {
  date: string;
  runs: number;
  failed: number;
  cost_usd: number;
};

function fmt(iso: string) {
  return new Date(iso + "T00:00:00Z").toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  });
}

// ─── SVG sparkline ─────────────────────────────────────────────────────────

interface SparklineProps {
  data: number[];
  dates: string[];
  color: string;
  gradId: string;
  label: string;
  totalLabel: string;
  subtitle: string;
  formatValue: (v: number) => string;
  isEmpty: boolean;
}

function Sparkline({
  data,
  dates,
  color,
  gradId,
  label,
  totalLabel,
  subtitle,
  formatValue,
  isEmpty,
}: SparklineProps) {
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

  // Smooth monotone-ish path using bezier control points
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
      const idx = Math.min(
        data.length - 1,
        Math.max(0, Math.round(rel * (data.length - 1))),
      );
      setHovered(idx);
    },
    [data.length],
  );

  const tooltipPct =
    hovered !== null
      ? (hovered / (data.length - 1)) * 100
      : null;

  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        {label}
      </p>
      <div className="mt-1 flex items-baseline gap-1.5">
        <span className="text-xl font-bold">{totalLabel}</span>
        <span className="text-xs text-muted-foreground">{subtitle}</span>
      </div>

      {isEmpty ? (
        <div className="mt-3 flex h-14 items-center justify-center">
          <p className="text-center text-xs text-muted-foreground">
            No activity yet — run a workflow to see your chart.
          </p>
        </div>
      ) : (
        <div
          className="relative mt-3"
          onMouseLeave={() => setHovered(null)}
        >
          {/* Tooltip */}
          {hovered !== null && tooltipPct !== null && (
            <div
              className="pointer-events-none absolute -top-9 z-20 rounded-lg border border-border bg-popover px-2.5 py-1.5 text-xs shadow-md"
              style={{
                left: `${Math.min(Math.max(tooltipPct, 6), 88)}%`,
                transform: "translateX(-50%)",
              }}
            >
              <p className="font-semibold leading-tight">
                {formatValue(data[hovered])}
              </p>
              <p className="text-muted-foreground leading-tight">
                {fmt(dates[hovered])}
              </p>
            </div>
          )}

          {/* Chart */}
          <svg
            ref={svgRef}
            viewBox={`0 0 ${W} ${H}`}
            preserveAspectRatio="none"
            className="h-14 w-full cursor-crosshair"
            onMouseMove={handleMouseMove}
          >
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={color} stopOpacity="0.25" />
                <stop offset="100%" stopColor={color} stopOpacity="0" />
              </linearGradient>
            </defs>
            <path d={areaPath} fill={`url(#${gradId})`} />
            <path
              d={linePath}
              fill="none"
              stroke={color}
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
            {hovered !== null && (
              <>
                <line
                  x1={pts[hovered].x}
                  y1={PAD}
                  x2={pts[hovered].x}
                  y2={H}
                  stroke={color}
                  strokeWidth="0.75"
                  strokeDasharray="3 3"
                  opacity="0.6"
                />
                <circle
                  cx={pts[hovered].x}
                  cy={pts[hovered].y}
                  r="3"
                  fill={color}
                  stroke="white"
                  strokeWidth="1.5"
                />
              </>
            )}
          </svg>

          {/* X-axis labels */}
          <div className="mt-1 flex justify-between text-[9px] text-muted-foreground/60 select-none">
            <span>{fmt(dates[0])}</span>
            <span>{fmt(dates[Math.floor((dates.length - 1) / 2)])}</span>
            <span>{fmt(dates[dates.length - 1])}</span>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Exported component ────────────────────────────────────────────────────

export function UsageCharts({ history }: { history: DayUsage[] }) {
  const uid = useId().replace(/:/g, "");
  const dates = history.map((d) => d.date);
  const runs = history.map((d) => d.runs);
  const costs = history.map((d) => d.cost_usd);

  const totalRuns = runs.reduce((a, b) => a + b, 0);
  const totalCost = costs.reduce((a, b) => a + b, 0);
  const isEmpty = totalRuns === 0;

  return (
    <section className="space-y-3">
      <h2 className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground">
        30-day activity
      </h2>
      <div className="grid gap-4 sm:grid-cols-2">
        <Sparkline
          data={runs}
          dates={dates}
          color="hsl(var(--primary))"
          gradId={`${uid}-runs`}
          label="Workflow Runs"
          totalLabel={totalRuns.toLocaleString()}
          subtitle="runs this period"
          formatValue={(v) => `${v} run${v !== 1 ? "s" : ""}`}
          isEmpty={isEmpty}
        />
        <Sparkline
          data={costs}
          dates={dates}
          color="#22c55e"
          gradId={`${uid}-cost`}
          label="AI Spend"
          totalLabel={`$${totalCost.toFixed(4)}`}
          subtitle="this period"
          formatValue={(v) => (v === 0 ? "$0" : `$${v.toFixed(4)}`)}
          isEmpty={isEmpty}
        />
      </div>
    </section>
  );
}
