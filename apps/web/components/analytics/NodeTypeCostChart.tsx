"use client";

import {
  PieChart,
  Pie,
  Cell,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";
import type { NodeTypeCostRow } from "@/lib/program-analytics";
import { formatCreditAmount, usdToCredits } from "@/lib/credit-packs";

type Props = { data: NodeTypeCostRow[] };

const COLORS = [
  "#6366f1", "#8b5cf6", "#a855f7", "#d946ef",
  "#ec4899", "#f43f5e", "#f97316", "#14b8a6",
];

function credits(usdValue: number) {
  return formatCreditAmount(usdToCredits(usdValue));
}

export function NodeTypeCostChart({ data }: Props) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-sm text-muted-foreground">
        No node execution data yet.
      </div>
    );
  }
  const chartData = data.map((r) => ({
    ...r,
    name: r.nodeType,
    value: usdToCredits(r.totalCostUsd),
  }));

  return (
    <div className="space-y-4">
      <ResponsiveContainer width="100%" height={260}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={90}
            paddingAngle={2}
            dataKey="value"
          >
            {chartData.map((_, i) => (
              <Cell key={i} fill={COLORS[i % COLORS.length]} fillOpacity={0.85} />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{
              backgroundColor: "hsl(var(--card))",
              border: "1px solid hsl(var(--border))",
              borderRadius: "8px",
              fontSize: "12px",
            }}
            formatter={(value: any) => [
              `${formatCreditAmount(Number(value))} credits`,
              "Cost",
            ]}
          />
          <Legend wrapperStyle={{ fontSize: "11px" }} />
        </PieChart>
      </ResponsiveContainer>

      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-border text-left text-muted-foreground">
              <th className="pb-2 font-medium">Node Type</th>
              <th className="pb-2 font-medium text-right">Executions</th>
              <th className="pb-2 font-medium text-right">Total Credits</th>
              <th className="pb-2 font-medium text-right">Avg Credits</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-border/50">
            {data.map((row, i) => (
              <tr key={row.nodeType} className="text-muted-foreground">
                <td className="py-1.5">
                  <div className="flex items-center gap-2">
                    <span className="inline-block w-2.5 h-2.5 rounded-full shrink-0"
                      style={{ backgroundColor: COLORS[i % COLORS.length] }} />
                    <span className="font-medium text-foreground">{row.nodeType}</span>
                  </div>
                </td>
                <td className="py-1.5 text-right">{row.executionCount}</td>
                <td className="py-1.5 text-right">{credits(row.totalCostUsd)}</td>
                <td className="py-1.5 text-right">{credits(row.avgCostUsd)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
