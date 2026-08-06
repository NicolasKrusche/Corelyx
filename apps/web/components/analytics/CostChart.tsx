"use client";

import React from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { CostTrendRow } from "@/lib/program-analytics";
import { formatCreditAmount, usdToCredits } from "@/lib/credit-packs";

interface CostChartProps {
  data: CostTrendRow[];
}

const COMPLETED = "hsl(142, 76%, 36%)";
const FAILED = "hsl(0, 72%, 51%)";

type Point = {
  ts: number;
  label: string;
  credits: number;
  status: string;
};

/**
 * getCostTrend returns camelCase rows ordered newest-first, with startedAt as an
 * ISO timestamp. Rows whose timestamp will not parse are dropped — rendering
 * them produced a chart axis of "Invalid Date" ticks.
 */
function toPoint(row: CostTrendRow): Point | null {
  const ts = new Date(row.startedAt).getTime();
  if (!Number.isFinite(ts)) return null;
  return {
    ts,
    label: new Date(ts).toLocaleString("en-US", {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    }),
    credits: usdToCredits(row.costUsd),
    status: row.status,
  };
}

/** Dot colour carries run status, which the single credits series cannot. */
function StatusDot(props: { cx?: number; cy?: number; payload?: Point }) {
  const { cx, cy, payload } = props;
  if (cx == null || cy == null) return <g />;
  return (
    <circle
      cx={cx}
      cy={cy}
      r={3.5}
      fill={payload?.status === "failed" ? FAILED : COMPLETED}
    />
  );
}

function CostTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Point }[];
}) {
  if (!active || !payload?.length) return null;
  const point = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-foreground">{point.label}</p>
      <p className="mt-1 text-muted-foreground">
        {formatCreditAmount(point.credits)} credits
      </p>
      <p
        className={
          point.status === "failed"
            ? "text-red-500"
            : "text-emerald-500"
        }
      >
        {point.status}
      </p>
    </div>
  );
}

export function CostChart({ data }: CostChartProps) {
  const chartData = data
    .map(toPoint)
    .filter((p): p is Point => p !== null)
    .sort((a, b) => a.ts - b.ts);

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p className="text-sm">No run data available yet</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis
          dataKey="label"
          tick={{ fontSize: 11 }}
          angle={-45}
          textAnchor="end"
          height={70}
          interval="preserveStartEnd"
          minTickGap={24}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          width={56}
          tickFormatter={(v: number) => formatCreditAmount(v)}
        />
        <Tooltip content={<CostTooltip />} />
        <Line
          type="monotone"
          dataKey="credits"
          stroke={COMPLETED}
          strokeWidth={2}
          dot={<StatusDot />}
          activeDot={{ r: 5 }}
          name="Credits"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
