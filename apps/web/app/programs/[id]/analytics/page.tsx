"use client";

import React, { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  DollarSignIcon,
  ZapIcon,
  ActivityIcon,
  ArrowLeftIcon,
  TrendingUpIcon,
  BarChart3Icon,
} from "lucide-react";
import { CostChart } from "@/components/analytics/CostChart";
import { ModelComparisonChart } from "@/components/analytics/ModelComparisonChart";
import { NodeCostBreakdown } from "@/components/analytics/NodeCostBreakdown";

interface RunCostData {
  run_id: string;
  started_at: string;
  total_cost_usd: number;
  total_tokens: number;
  status: string;
}

interface NodeCostData {
  node_id: string;
  node_type: string;
  label: string;
  total_runs: number;
  total_cost_usd: number;
  avg_cost_usd: number;
  total_tokens: number;
}

interface AnalyticsData {
  summary: {
    total_cost_usd: number;
    total_tokens: number;
    total_runs: number;
    avg_cost_per_run: number;
  };
  runs: RunCostData[];
  node_breakdown: NodeCostData[];
}

export default function ProgramAnalyticsPage() {
  const params = useParams();
  const router = useRouter();
  const programId = params.id as string;

  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function fetchAnalytics() {
      try {
        setLoading(true);
        const response = await fetch(`/api/programs/${programId}/analytics`);
        if (!response.ok) {
          throw new Error("Failed to fetch analytics");
        }
        const data = await response.json();
        setAnalytics(data);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unknown error");
      } finally {
        setLoading(false);
      }
    }

    fetchAnalytics();
  }, [programId]);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <ActivityIcon className="h-8 w-8 animate-spin mx-auto mb-4 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">Loading analytics...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-destructive text-center">{error}</p>
            <Button
              variant="outline"
              className="mt-4 w-full"
              onClick={() => router.back()}
            >
              Go Back
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  if (!analytics) {
    return null;
  }

  const { summary, runs, node_breakdown } = analytics;

  // Aggregate model usage from node breakdown (simplified - in real impl, would track model per execution)
  const modelUsage = node_breakdown
    .filter((n) => n.node_type === "agent" || n.node_type === "agent_task")
    .map((n) => ({
      model: n.node_type === "agent" ? "agent" : "agent_task",
      total_runs: n.total_runs,
      total_cost_usd: n.total_cost_usd,
      total_tokens: n.total_tokens,
      avg_tokens_per_run: n.total_runs > 0 ? Math.round(n.total_tokens / n.total_runs) : 0,
    }));

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <div className="border-b border-border bg-background/95 backdrop-blur sticky top-0 z-10">
        <div className="flex items-center justify-between px-6 py-4">
          <div className="flex items-center gap-3">
            <Button
              variant="ghost"
              size="icon"
              onClick={() => router.back()}
              className="h-8 w-8"
            >
              <ArrowLeftIcon className="h-4 w-4" />
            </Button>
            <div>
              <h1 className="text-lg font-semibold">Program Analytics</h1>
              <p className="text-sm text-muted-foreground">
                Cost & Token Telemetry Dashboard
              </p>
            </div>
          </div>
          <Badge variant="outline" className="text-xs">
            {summary.total_runs} runs
          </Badge>
        </div>
      </div>

      <div className="p-6 space-y-6 max-w-7xl mx-auto">
        {/* Summary Cards */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-green-500/10 rounded-lg">
                  <DollarSignIcon className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">${summary.total_cost_usd.toFixed(4)}</p>
                  <p className="text-xs text-muted-foreground">Total Cost</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-blue-500/10 rounded-lg">
                  <ZapIcon className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.total_tokens.toLocaleString()}</p>
                  <p className="text-xs text-muted-foreground">Total Tokens</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-purple-500/10 rounded-lg">
                  <ActivityIcon className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">{summary.total_runs}</p>
                  <p className="text-xs text-muted-foreground">Total Runs</p>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 bg-orange-500/10 rounded-lg">
                  <TrendingUpIcon className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-2xl font-bold">${summary.avg_cost_per_run.toFixed(6)}</p>
                  <p className="text-xs text-muted-foreground">Avg Cost/Run</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Cost Trend Chart */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <TrendingUpIcon className="h-4 w-4" />
              Cost & Token Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <CostChart data={runs} />
          </CardContent>
        </Card>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Model Comparison */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3Icon className="h-4 w-4" />
                Model Usage Comparison
              </CardTitle>
            </CardHeader>
            <CardContent>
              {modelUsage.length > 0 ? (
                <ModelComparisonChart data={modelUsage} />
              ) : (
                <div className="flex items-center justify-center h-64 text-muted-foreground">
                  <p className="text-sm">No model usage data yet</p>
                </div>
              )}
            </CardContent>
          </Card>

          {/* Node Cost Breakdown */}
          <Card>
            <CardHeader>
              <CardTitle className="text-base flex items-center gap-2">
                <BarChart3Icon className="h-4 w-4" />
                Top Node Costs
              </CardTitle>
            </CardHeader>
            <CardContent>
              <NodeCostBreakdown data={node_breakdown} />
            </CardContent>
          </Card>
        </div>

        {/* Recent Runs Table */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recent Runs</CardTitle>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-80">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Run ID</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Started</th>
                    <th className="text-left py-2 px-3 text-muted-foreground font-medium">Status</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Cost</th>
                    <th className="text-right py-2 px-3 text-muted-foreground font-medium">Tokens</th>
                  </tr>
                </thead>
                <tbody>
                  {runs.map((run) => (
                    <tr key={run.run_id} className="border-b border-border/50 hover:bg-muted/50">
                      <td className="py-2 px-3 font-mono text-xs">{run.run_id.slice(0, 8)}...</td>
                      <td className="py-2 px-3">
                        {new Date(run.started_at).toLocaleString()}
                      </td>
                      <td className="py-2 px-3">
                        <Badge
                          variant={
                            run.status === "completed"
                              ? "default"
                              : run.status === "failed"
                              ? "destructive"
                              : "secondary"
                          }
                          className="text-xs"
                        >
                          {run.status}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        ${run.total_cost_usd.toFixed(4)}
                      </td>
                      <td className="py-2 px-3 text-right font-mono">
                        {run.total_tokens.toLocaleString()}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
