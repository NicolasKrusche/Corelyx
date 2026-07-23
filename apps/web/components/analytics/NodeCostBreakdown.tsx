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

interface NodeCostData {
  node_id: string;
  node_type: string;
  label: string;
  total_runs: number;
  total_cost_usd: number;
  avg_cost_usd: number;
  total_tokens: number;
}

interface NodeCostBreakdownProps {
  data: NodeCostData[];
}

export function NodeCostBreakdown({ data }: NodeCostBreakdownProps) {
  const chartData = data
    .sort((a, b) => b.total_cost_usd - a.total_cost_usd)
    .slice(0, 15) // Top 15 by cost
    .map((item) => ({
      name: item.label || item.node_id,
      totalCost: item.total_cost_usd,
      avgCost: item.avg_cost_usd,
      runs: item.total_runs,
      tokens: item.total_tokens,
      type: item.node_type,
    }));

  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <p className="text-sm">No node cost data available yet</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={300}>
      <BarChart data={chartData} layout="vertical">
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis type="number" tick={{ fontSize: 11 }} />
        <YAxis
          type="category"
          dataKey="name"
          tick={{ fontSize: 11 }}
          width={120}
        />
        <Tooltip
          contentStyle={{
            backgroundColor: "hsl(var(--background))",
            border: "1px solid hsl(var(--border))",
            borderRadius: "8px",
            fontSize: "12px",
          }}
          formatter={(value: any, name: any) => {
            if (name === "totalCost") return [`$${Number(value).toFixed(4)}`, "Total Cost"];
            if (name === "avgCost") return [`$${Number(value).toFixed(6)}`, "Avg Cost/Run"];
            if (name === "tokens") return [Number(value).toLocaleString(), "Total Tokens"];
            return [value, name];
          }}
        />
        <Bar dataKey="totalCost" fill="hsl(142, 76%, 36%)" name="totalCost" radius={[0, 4, 4, 0]} />
      </BarChart>
    </ResponsiveContainer>
  );
}
