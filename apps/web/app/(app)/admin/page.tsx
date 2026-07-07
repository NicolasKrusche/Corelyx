import { getHealthStatus } from "@/lib/health-check";
import { createServiceClient } from "@/lib/api";
import { getFinanceSummary } from "@/lib/admin-finance";
import Link from "next/link";
import {
  Activity,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Users,
  Play,
  DollarSign,
  Zap
} from "lucide-react";

type RecentFailureRow = {
  id: string;
  program_id: string | null;
  error_message: string | null;
  created_at: string;
};

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

const ERROR_CODE_LABELS: Record<string, string> = {
  CONDITION_EVAL_ERROR: "A filter/branch condition failed to evaluate",
  CONNECTION_NOT_FOUND: "A required connection was missing",
  API_KEY_FETCH_FAILED: "An API key could not be resolved",
  API_KEY_REQUIRED: "A user-supplied API key is required",
  PLATFORM_KEY_MISSING: "Platform AI key not configured",
  MAX_RETRIES_EXHAUSTED: "Model call failed after retries",
  NODE_FAILED: "A workflow step failed",
  HTTP_CONFIG_INVALID: "An HTTP step was misconfigured",
  LOCK_TIMEOUT: "Timed out waiting for a resource lock",
};

// Summarize a raw runtime error for the cross-tenant admin overview WITHOUT
// echoing the underlying workflow expression/data. Runtime errors like
// "[CONDITION_EVAL_ERROR] Condition 'any(word in data['n5']...'" embed internal
// node IDs and customer workflow content; the admin only needs the error class.
// Full detail stays on the workspace owner's own run page.
function summarizeRunError(message: string | null): string {
  if (!message) return "Run failed (no error detail).";
  const codeMatch = message.match(/^\s*\[([A-Z0-9_]+)\]/);
  if (codeMatch) {
    const code = codeMatch[1];
    return ERROR_CODE_LABELS[code] ?? `${code.replace(/_/g, " ").toLowerCase()}`;
  }
  return "Run failed — open the run for details.";
}

async function getStats() {
  const db = createServiceClient();
  
  // Active runs
  const { count: activeRuns } = await db
    .from("runs")
    .select("*", { count: "exact", head: true })
    .eq("status", "running");
  
  // Today's runs
  const today = new Date().toISOString().split("T")[0];
  const { count: todayRuns } = await db
    .from("runs")
    .select("*", { count: "exact", head: true })
    .gte("created_at", today);
  
  // Total users
  const { count: totalUsers } = await db
    .from("profiles")
    .select("*", { count: "exact", head: true });
  
  // Today's cost — platform-key provider cost only (what LLM usage costs US;
  // BYOK calls are funded by the user's own key).
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const todayCost = (await getFinanceSummary(db, todayStart)).data.platformCostUsd;

  // Recent failed runs
  const { data: recentFailures } = await db
    .from("runs")
    .select("id, program_id, error_message, created_at")
    .eq("status", "failed")
    .order("created_at", { ascending: false })
    .limit(5);
  
  return {
    activeRuns: activeRuns || 0,
    todayRuns: todayRuns || 0,
    totalUsers: totalUsers || 0,
    todayCost,
    recentFailures: asRows<RecentFailureRow>(recentFailures),
  };
}

export default async function AdminOverviewPage() {
  const [health, stats] = await Promise.all([
    getHealthStatus(),
    getStats(),
  ]);
  
  const isHealthy = health.status === "healthy";
  const isDegraded = health.status === "degraded";
  
  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">System Overview</h1>
        <p className="text-muted-foreground">Real-time system status and key metrics</p>
      </div>
      
      {/* Status Banner */}
      <div className={`p-4 rounded-lg border ${
        isHealthy 
          ? "bg-green-500/10 border-green-500/30" 
          : isDegraded
          ? "bg-yellow-500/10 border-yellow-500/30"
          : "bg-red-500/10 border-red-500/30"
      }`}>
        <div className="flex items-center gap-3">
          {isHealthy ? (
            <CheckCircle className="w-6 h-6 text-green-600 dark:text-green-400" />
          ) : isDegraded ? (
            <AlertTriangle className="w-6 h-6 text-yellow-600 dark:text-yellow-400" />
          ) : (
            <XCircle className="w-6 h-6 text-red-600 dark:text-red-400" />
          )}
          <div>
            <h2 className={`font-semibold ${
              isHealthy ? "text-green-700 dark:text-green-300" : isDegraded ? "text-yellow-700 dark:text-yellow-300" : "text-red-700 dark:text-red-300"
            }`}>
              System Status: {health.status.toUpperCase()}
            </h2>
            <p className="text-sm text-muted-foreground">
              Last checked: {new Date(health.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Runs */}
        <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Active Runs</p>
              <p className="text-3xl font-bold text-foreground">{stats.activeRuns}</p>
            </div>
            <div className="p-3 bg-blue-500/15 rounded-full">
              <Play className="w-6 h-6 text-blue-600 dark:text-blue-400" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {stats.todayRuns} runs today
          </p>
        </div>
        
        {/* Total Users */}
        <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Total Users</p>
              <p className="text-3xl font-bold text-foreground">{stats.totalUsers}</p>
            </div>
            <div className="p-3 bg-purple-500/15 rounded-full">
              <Users className="w-6 h-6 text-purple-600 dark:text-purple-400" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Registered accounts
          </p>
        </div>
        
        {/* Today's Cost */}
        <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Today&apos;s LLM Cost</p>
              <p className="text-3xl font-bold text-foreground">
                ${stats.todayCost.toFixed(2)}
              </p>
            </div>
            <div className="p-3 bg-green-500/15 rounded-full">
              <DollarSign className="w-6 h-6 text-green-600 dark:text-green-400" />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Estimated spend
          </p>
        </div>
        
        {/* System Load */}
        <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-muted-foreground">Health Score</p>
              <p className="text-3xl font-bold text-foreground">
                {isHealthy ? "100%" : isDegraded ? "75%" : "0%"}
              </p>
            </div>
            <div className={`p-3 rounded-full ${
              isHealthy ? "bg-green-500/15" : isDegraded ? "bg-yellow-500/15" : "bg-red-500/15"
            }`}>
              <Activity className={`w-6 h-6 ${
                isHealthy ? "text-green-600 dark:text-green-400" : isDegraded ? "text-yellow-600 dark:text-yellow-400" : "text-red-600 dark:text-red-400"
              }`} />
            </div>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            Based on health checks
          </p>
        </div>
      </div>
      
      {/* Health Checks Detail */}
      <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Health Check Details</h2>
        </div>
        <div className="divide-y divide-border">
          {Object.entries(health.checks).map(([name, check]) => (
            <div key={name} className="px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                {check?.status === "pass" ? (
                  <CheckCircle className="w-5 h-5 text-green-500" />
                ) : check?.status === "warn" ? (
                  <AlertTriangle className="w-5 h-5 text-yellow-500" />
                ) : (
                  <XCircle className="w-5 h-5 text-red-500" />
                )}
                <div>
                  <p className="font-medium text-foreground capitalize">
                    {name.replace(/_/g, " ")}
                  </p>
                  {check?.message && (
                    <p className="text-sm text-muted-foreground">{check.message}</p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  check?.status === "pass" 
                    ? "bg-green-500/15 text-green-700 dark:text-green-300"
                    : check?.status === "warn"
                    ? "bg-yellow-500/15 text-yellow-700 dark:text-yellow-300"
                    : "bg-red-500/15 text-red-700 dark:text-red-300"
                }`}>
                  {check?.status === "pass" ? "Healthy" : check?.status === "warn" ? "Warning" : "Failed"}
                </span>
                <p className="text-xs text-muted-foreground mt-1">
                  {check?.responseTimeMs}ms
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Recent Failures */}
      {stats.recentFailures.length > 0 && (
        <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
          <div className="px-6 py-4 border-b border-border">
            <h2 className="text-lg font-semibold text-foreground">Recent Failed Runs</h2>
          </div>
          <div className="divide-y divide-border">
            {stats.recentFailures.map((run) => (
              <div key={run.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-foreground">
                      Run ID: {run.id.slice(0, 8)}...
                    </p>
                    <p className="text-sm text-muted-foreground">
                      Program: {run.program_id?.slice(0, 8)}...
                    </p>
                    <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                      {summarizeRunError(run.error_message)}
                    </p>
                  </div>
                  <span className="text-xs text-muted-foreground/60">
                    {new Date(run.created_at).toLocaleString()}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
      
      {/* Quick Links */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Link
          href="/admin/emergency"
          className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/30 rounded-lg hover:bg-red-500/15 transition-colors"
        >
          <Zap className="w-5 h-5 text-red-600 dark:text-red-400" />
          <span className="font-medium text-red-700 dark:text-red-300">Emergency Controls</span>
        </Link>
        <Link
          href="/admin/circuits"
          className="flex items-center gap-3 p-4 bg-blue-500/10 border border-blue-500/30 rounded-lg hover:bg-blue-500/15 transition-colors"
        >
          <Activity className="w-5 h-5 text-blue-600 dark:text-blue-400" />
          <span className="font-medium text-blue-700 dark:text-blue-300">Circuit Breakers</span>
        </Link>
        <Link
          href="/admin/security"
          className="flex items-center gap-3 p-4 bg-muted/40 border border-border rounded-lg hover:bg-muted transition-colors"
        >
          <AlertTriangle className="w-5 h-5 text-muted-foreground" />
          <span className="font-medium text-foreground">Security Sentinel</span>
        </Link>
      </div>
    </div>
  );
}
