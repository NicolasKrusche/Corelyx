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
  Legend,
} from "recharts";

interface ModelUsageData {
  model: string;
  total_runs: number;
  total_cost_usd: number;
  total_tokens: number;
  avg_tokens_per_run: number;
}

interface ModelComparisonChartProps {
  data: ModelUsageData[];
}

export function ModelComparisonChart({ data }: ModelComparisonChartProps) {
  const chartData = data.map((item) => ({
    model: item.model.split("/").pop() || item.model,
    fullName: item.model,
    runs: item.total_runs,
    cost: item.total_cost_usd,
    tokens: item.total_tokens,
    avgTokens: item.avg_tokens_per_run,
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
      <BarChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis dataKey="model" tick={{ fontSize: 11 }} angle={-45} textAnchor="end" height={60} />
        <YAxis yAxisId="cost" tick={{ fontSize: 11 }} />
        <YAxis yAxisId="tokens" orientation="right" tick={{ fontSize: 11 }} />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          formatter={(value: any, name: any, props: any) => {
            if (name === "cost") return [`$${Number(value).toFixed(4)}`, "Cost (USD)"];
            if (name === "tokens") return [Number(value).toLocaleString(), "Tokens"];
            return [value, name];
          }}
        />
        <Legend />
        <Bar yAxisId="cost" dataKey="cost" fill="hsl(142, 76%, 36%)" name="Cost (USD)" radius={[4, 4, 0, 0]} />
        <Bar yAxisId="tokens" dataKey="tokens" fill="hsl(217, 91%, 60%)" name="Tokens" radius={[4, 4, 0, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
