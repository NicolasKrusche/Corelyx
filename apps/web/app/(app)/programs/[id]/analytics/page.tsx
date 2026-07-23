import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { getProgramAccess, canView } from "@/lib/workspaces";
import {
  getCostTrend,
  getCostByNodeType,
  getModelComparison,
  getAnalyticsSummary,
} from "@/lib/program-analytics";
import { CostChart } from "@/components/analytics/CostChart";
import { ModelComparisonChart } from "@/components/analytics/ModelComparisonChart";
import { NodeTypeCostChart } from "@/components/analytics/NodeTypeCostChart";
import {
  ArrowLeft,
  BarChart3,
  Bot,
  DollarSign,
  Hash,
  TrendingUp,
  Zap,
} from "lucide-react";

export const dynamic = "force-dynamic";

function usd(v: number) { return `$${v.toFixed(4)}`; }

function StatCard({
  label,
  value,
  sub,
  icon,
}: {
  label: string;
  value: string;
  sub?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="bg-card p-5 rounded-lg shadow-sm border border-border">
      <div className="flex items-center justify-between mb-2">
        <p className="text-sm font-medium text-muted-foreground">{label}</p>
        {icon}
      </div>
      <p className="text-2xl font-bold text-foreground">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
    </div>
  );
}

export default async function AnalyticsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const access = await getProgramAccess(id, user.id);
  if (!canView(access)) notFound();

  const serviceClient = createServiceClient();
  const { data: program } = await serviceClient
    .from("programs")
    .select("id, name")
    .eq("id", id)
    .single();
  if (!program) notFound();

  const prog = program as { id: string; name: string };

  const [summary, costTrend, nodeTypeCost, modelComparison] = await Promise.all([
    getAnalyticsSummary(id),
    getCostTrend(id, 50),
    getCostByNodeType(id),
    getModelComparison(id),
  ]);

  const s = summary.data;
  const avgDuration =
    s.totalRuns > 0 ? s.totalDurationMs / s.totalRuns : 0;
  function fmtDuration(ms: number) {
    if (ms < 1000) return `${Math.round(ms)}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m`;
  }

  return (
    <div className="max-w-6xl space-y-6">
      {/* Header */}
      <div>
        <p className="text-sm text-muted-foreground mb-1">
          <Link href={`/programs/${id}`} className="hover:underline">
            {prog.name}
          </Link>
        </p>
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">
            Analytics
          </h1>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-0.5 text-xs font-medium text-primary">
            <BarChart3 className="h-3 w-3" />
            Cost &amp; Token Telemetry
          </span>
        </div>
        {(summary.degraded || costTrend.degraded) && (
          <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
            ⚠ Showing approximate data — analytics migration not yet applied.
          </p>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          label="Total Runs"
          value={String(s.totalRuns)}
          sub={`${s.completedRuns} completed · ${s.failedRuns} failed`}
          icon={<Zap className="w-5 h-5 text-primary" />}
        />
        <StatCard
          label="Total Cost"
          value={usd(s.totalCostUsd)}
          sub={`${usd(s.avgCostPerRun)} avg/run`}
          icon={<DollarSign className="w-5 h-5 text-emerald-500" />}
        />
        <StatCard
          label="Total Tokens"
          value={s.totalTokens.toLocaleString()}
          sub={`${Math.round(s.avgTokensPerRun).toLocaleString()} avg/run`}
          icon={<Hash className="w-5 h-5 text-blue-500" />}
        />
        <StatCard
          label="Avg Duration"
          value={fmtDuration(avgDuration)}
          sub={`${s.totalModelCalls} model calls total`}
          icon={<TrendingUp className="w-5 h-5 text-purple-500" />}
        />
      </div>

      {/* Cost trend */}
      <section className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Cost per Run</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Estimated provider cost over time — green = completed, red = failed
          </p>
        </div>
        <div className="p-6">
          <CostChart data={costTrend.data as any} />
        </div>
      </section>

      {/* Two-column: Node Type + Model Comparison */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Cost by Node Type</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              How much each node type contributes to total cost
            </p>
          </div>
          <div className="p-6">
            <NodeTypeCostChart data={nodeTypeCost.data} />
          </div>
        </section>

        <section className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Model Comparison</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Cost and usage breakdown by LLM model
            </p>
          </div>
          <div className="p-6">
            <ModelComparisonChart data={modelComparison.data as any} />
          </div>
        </section>
      </div>

      {/* Back link */}
      <div className="pt-2">
        <Link
          href={`/programs/${id}`}
          className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to program
        </Link>
      </div>
    </div>
  );
}
