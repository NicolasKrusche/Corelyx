"use client";

import React from "react";
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from "recharts";
import type { ModelComparisonRow } from "@/lib/program-analytics";
import { formatCreditAmount, usdToCredits } from "@/lib/credit-packs";

interface ModelComparisonChartProps {
  data: ModelComparisonRow[];
}

type Bucket = {
  model: string;
  fullName: string;
  credits: number;
  calls: number;
  source: string;
};

function ModelTooltip({
  active,
  payload,
}: {
  active?: boolean;
  payload?: { payload: Bucket }[];
}) {
  if (!active || !payload?.length) return null;
  const bucket = payload[0].payload;
  return (
    <div className="rounded-lg border border-border bg-card px-3 py-2 text-xs shadow-sm">
      <p className="font-medium text-foreground">{bucket.fullName}</p>
      <p className="mt-1 text-muted-foreground">
        {formatCreditAmount(bucket.credits)} credits
      </p>
      <p className="text-muted-foreground">
        {bucket.calls.toLocaleString()} call{bucket.calls === 1 ? "" : "s"} ·{" "}
        {bucket.source}
      </p>
    </div>
  );
}

export function ModelComparisonChart({ data }: ModelComparisonChartProps) {
  const chartData: Bucket[] = data.map((item) => ({
    model: item.model.split("/").pop() || item.model,
    fullName: item.model,
    credits: usdToCredits(item.totalCostUsd),
    calls: item.callCount,
    source: item.source,
  }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p className="text-sm">No model usage data available yet</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} margin={{ top: 8, right: 12, bottom: 0, left: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis
          dataKey="model"
          tick={{ fontSize: 11 }}
          angle={-45}
          textAnchor="end"
          height={70}
          interval={0}
        />
        <YAxis
          tick={{ fontSize: 11 }}
          width={56}
          tickFormatter={(v: number) => formatCreditAmount(v)}
        />
        <Tooltip content={<ModelTooltip />} cursor={{ fillOpacity: 0.08 }} />
        <Bar
          dataKey="credits"
          fill="hsl(142, 76%, 36%)"
          name="Credits"
          radius={[4, 4, 0, 0]}
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
