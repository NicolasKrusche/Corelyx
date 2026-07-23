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
  Legend,
} from "recharts";

interface RunCostData {
  run_id: string;
  started_at: string;
  total_cost_usd: number;
  total_tokens: number;
  status: string;
}

interface CostChartProps {
  data: RunCostData[];
}

export function CostChart({ data }: CostChartProps) {
  const chartData = data
    .sort((a, b) => new Date(a.started_at).getTime() - new Date(b.started_at).getTime())
    .map((run) => ({
      date: new Date(run.started_at).toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      }),
      cost: run.total_cost_usd,
      tokens: run.total_tokens,
      status: run.status,
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p className="text-sm">No run data available yet</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <LineChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 11 }}
          angle={-45}
          textAnchor="end"
          height={60}
        />
        <YAxis yAxisId="cost" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="tokens" orientation="right" tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
        />
        <Legend />
        <Line
          yAxisId="cost"
          type="monotone"
          dataKey="cost"
          stroke="hsl(142, 76%, 36%)"
          strokeWidth={2}
          dot={{ r: 4 }}
          name="Cost (USD)"
        />
        <Line
          yAxisId="tokens"
          type="monotone"
          dataKey="tokens"
          stroke="hsl(217, 91%, 60%)"
          strokeWidth={2}
          dot={{ r: 4 }}
          name="Tokens"
        />
      </LineChart>
    </ResponsiveContainer>
  );
}
