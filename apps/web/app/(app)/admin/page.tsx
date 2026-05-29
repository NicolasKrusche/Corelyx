import { getHealthStatus } from "@/lib/health-check";
import { createServiceClient } from "@/lib/api";
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

type EstimatedCostRow = {
  estimated_cost_usd: number | null;
};

type RecentFailureRow = {
  id: string;
  program_id: string | null;
  error_message: string | null;
  created_at: string;
};

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
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
  
  // Today's cost
  const { data: todayCostData } = await db
    .from("llm_usage_logs")
    .select("estimated_cost_usd")
    .gte("created_at", today);
  const todayCost = asRows<EstimatedCostRow>(todayCostData).reduce(
    (sum, row) => sum + (row.estimated_cost_usd || 0),
    0
  );
  
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
        <h1 className="text-2xl font-bold text-gray-900">System Overview</h1>
        <p className="text-gray-600">Real-time system status and key metrics</p>
      </div>
      
      {/* Status Banner */}
      <div className={`p-4 rounded-lg border ${
        isHealthy 
          ? "bg-green-50 border-green-200" 
          : isDegraded
          ? "bg-yellow-50 border-yellow-200"
          : "bg-red-50 border-red-200"
      }`}>
        <div className="flex items-center gap-3">
          {isHealthy ? (
            <CheckCircle className="w-6 h-6 text-green-600" />
          ) : isDegraded ? (
            <AlertTriangle className="w-6 h-6 text-yellow-600" />
          ) : (
            <XCircle className="w-6 h-6 text-red-600" />
          )}
          <div>
            <h2 className={`font-semibold ${
              isHealthy ? "text-green-800" : isDegraded ? "text-yellow-800" : "text-red-800"
            }`}>
              System Status: {health.status.toUpperCase()}
            </h2>
            <p className="text-sm text-gray-600">
              Last checked: {new Date(health.timestamp).toLocaleString()}
            </p>
          </div>
        </div>
      </div>
      
      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Active Runs */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Active Runs</p>
              <p className="text-3xl font-bold text-gray-900">{stats.activeRuns}</p>
            </div>
            <div className="p-3 bg-blue-100 rounded-full">
              <Play className="w-6 h-6 text-blue-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            {stats.todayRuns} runs today
          </p>
        </div>
        
        {/* Total Users */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Total Users</p>
              <p className="text-3xl font-bold text-gray-900">{stats.totalUsers}</p>
            </div>
            <div className="p-3 bg-purple-100 rounded-full">
              <Users className="w-6 h-6 text-purple-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Registered accounts
          </p>
        </div>
        
        {/* Today's Cost */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Today&apos;s LLM Cost</p>
              <p className="text-3xl font-bold text-gray-900">
                ${stats.todayCost.toFixed(2)}
              </p>
            </div>
            <div className="p-3 bg-green-100 rounded-full">
              <DollarSign className="w-6 h-6 text-green-600" />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Estimated spend
          </p>
        </div>
        
        {/* System Load */}
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm font-medium text-gray-600">Health Score</p>
              <p className="text-3xl font-bold text-gray-900">
                {isHealthy ? "100%" : isDegraded ? "75%" : "0%"}
              </p>
            </div>
            <div className={`p-3 rounded-full ${
              isHealthy ? "bg-green-100" : isDegraded ? "bg-yellow-100" : "bg-red-100"
            }`}>
              <Activity className={`w-6 h-6 ${
                isHealthy ? "text-green-600" : isDegraded ? "text-yellow-600" : "text-red-600"
              }`} />
            </div>
          </div>
          <p className="text-sm text-gray-500 mt-2">
            Based on health checks
          </p>
        </div>
      </div>
      
      {/* Health Checks Detail */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Health Check Details</h2>
        </div>
        <div className="divide-y divide-gray-200">
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
                  <p className="font-medium text-gray-900 capitalize">
                    {name.replace(/_/g, " ")}
                  </p>
                  {check?.message && (
                    <p className="text-sm text-gray-500">{check.message}</p>
                  )}
                </div>
              </div>
              <div className="text-right">
                <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium ${
                  check?.status === "pass" 
                    ? "bg-green-100 text-green-800"
                    : check?.status === "warn"
                    ? "bg-yellow-100 text-yellow-800"
                    : "bg-red-100 text-red-800"
                }`}>
                  {check?.status === "pass" ? "Healthy" : check?.status === "warn" ? "Warning" : "Failed"}
                </span>
                <p className="text-xs text-gray-500 mt-1">
                  {check?.responseTimeMs}ms
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Recent Failures */}
      {stats.recentFailures.length > 0 && (
        <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
          <div className="px-6 py-4 border-b border-gray-200">
            <h2 className="text-lg font-semibold text-gray-900">Recent Failed Runs</h2>
          </div>
          <div className="divide-y divide-gray-200">
            {stats.recentFailures.map((run) => (
              <div key={run.id} className="px-6 py-4">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="font-medium text-gray-900">
                      Run ID: {run.id.slice(0, 8)}...
                    </p>
                    <p className="text-sm text-gray-500">
                      Program: {run.program_id?.slice(0, 8)}...
                    </p>
                    <p className="text-sm text-red-600 mt-1">
                      {run.error_message?.slice(0, 100)}...
                    </p>
                  </div>
                  <span className="text-xs text-gray-400">
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
          className="flex items-center gap-3 p-4 bg-red-50 border border-red-200 rounded-lg hover:bg-red-100 transition-colors"
        >
          <Zap className="w-5 h-5 text-red-600" />
          <span className="font-medium text-red-800">Emergency Controls</span>
        </Link>
        <Link
          href="/admin/circuits"
          className="flex items-center gap-3 p-4 bg-blue-50 border border-blue-200 rounded-lg hover:bg-blue-100 transition-colors"
        >
          <Activity className="w-5 h-5 text-blue-600" />
          <span className="font-medium text-blue-800">Circuit Breakers</span>
        </Link>
        <Link
          href="/security"
          className="flex items-center gap-3 p-4 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition-colors"
        >
          <AlertTriangle className="w-5 h-5 text-gray-600" />
          <span className="font-medium text-gray-800">Security Policy</span>
        </Link>
      </div>
    </div>
  );
}
