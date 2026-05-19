import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { hasCostsAccess } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/api";
import { DollarSign, TrendingUp, Users, AlertTriangle } from "lucide-react";

type EstimatedCostRow = {
  estimated_cost_usd: number | null;
};

type TopUserCostRow = EstimatedCostRow & {
  user_id: string | null;
  total_tokens: number | null;
};

type ModelCostRow = EstimatedCostRow & {
  model: string | null;
  total_tokens: number | null;
};

function asRows<T>(data: unknown): T[] {
  return Array.isArray(data) ? (data as T[]) : [];
}

async function getCostStats() {
  const db = createServiceClient();
  
  const today = new Date().toISOString().split("T")[0];
  const monthStart = `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, "0")}-01`;
  
  // Today's cost
  const { data: todayData } = await db
    .from("llm_usage_logs")
    .select("estimated_cost_usd")
    .gte("created_at", today);
  const todayCost = asRows<EstimatedCostRow>(todayData).reduce(
    (sum, row) => sum + (row.estimated_cost_usd || 0),
    0
  );
  
  // Monthly cost
  const { data: monthlyData } = await db
    .from("llm_usage_logs")
    .select("estimated_cost_usd")
    .gte("created_at", monthStart);
  
  const monthlyCost = asRows<EstimatedCostRow>(monthlyData).reduce(
    (sum, row) => sum + (row.estimated_cost_usd || 0), 
    0
  );
  
  // Top users by cost
  const { data: topUsers } = await db
    .from("llm_usage_logs")
    .select("user_id, estimated_cost_usd, total_tokens")
    .gte("created_at", today)
    .order("estimated_cost_usd", { ascending: false })
    .limit(10);
  
  // Cost by model
  const { data: modelBreakdown } = await db
    .from("llm_usage_logs")
    .select("model, estimated_cost_usd, total_tokens")
    .gte("created_at", today);
  
  const modelCosts: Record<string, { cost: number; tokens: number }> = {};
  asRows<ModelCostRow>(modelBreakdown).forEach((row) => {
    const model = row.model ?? "unknown";
    if (!modelCosts[model]) {
      modelCosts[model] = { cost: 0, tokens: 0 };
    }
    modelCosts[model].cost += row.estimated_cost_usd || 0;
    modelCosts[model].tokens += row.total_tokens || 0;
  });
  
  return {
    todayCost,
    monthlyCost,
    topUsers: asRows<TopUserCostRow>(topUsers),
    modelCosts,
  };
}

export default async function CostsPage() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/dashboard");
  if (!(await hasCostsAccess(user.id, user.email))) redirect("/admin");

  const stats = await getCostStats();
  
  const dailyLimit = 100; // Example limit
  const monthlyLimit = 1000;
  
  const dailyPercent = (stats.todayCost / dailyLimit) * 100;
  const monthlyPercent = (stats.monthlyCost / monthlyLimit) * 100;
  
  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Costs & Billing</h1>
        <p className="text-gray-600">Monitor LLM usage and costs</p>
      </div>
      
      {/* Cost Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-600">Today&apos;s Cost</p>
            <DollarSign className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">
            ${stats.todayCost.toFixed(2)}
          </p>
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  dailyPercent > 90 ? "bg-red-500" : dailyPercent > 70 ? "bg-yellow-500" : "bg-green-500"
                }`}
                style={{ width: `${Math.min(dailyPercent, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {dailyPercent.toFixed(1)}% of ${dailyLimit} daily limit
            </p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-600">Monthly Cost</p>
            <TrendingUp className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">
            ${stats.monthlyCost.toFixed(2)}
          </p>
          <div className="mt-2">
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  monthlyPercent > 90 ? "bg-red-500" : monthlyPercent > 70 ? "bg-yellow-500" : "bg-blue-500"
                }`}
                style={{ width: `${Math.min(monthlyPercent, 100)}%` }}
              />
            </div>
            <p className="text-xs text-gray-500 mt-1">
              {monthlyPercent.toFixed(1)}% of ${monthlyLimit} monthly limit
            </p>
          </div>
        </div>
        
        <div className="bg-white p-6 rounded-lg shadow-sm border border-gray-200">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-gray-600">Active Users</p>
            <Users className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-gray-900">
            {stats.topUsers.length}
          </p>
          <p className="text-xs text-gray-500 mt-2">
            Users with LLM usage today
          </p>
        </div>
      </div>
      
      {/* Alerts */}
      {(dailyPercent > 80 || monthlyPercent > 80) && (
        <div className="bg-yellow-50 border-l-4 border-yellow-400 p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-800">
                Approaching Cost Limit
              </h3>
              <div className="mt-2 text-sm text-yellow-700">
                {dailyPercent > 80 && (
                  <p>Daily cost at {dailyPercent.toFixed(0)}% of limit</p>
                )}
                {monthlyPercent > 80 && (
                  <p>Monthly cost at {monthlyPercent.toFixed(0)}% of limit</p>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
      
      {/* Model Breakdown */}
      <div className="bg-white rounded-lg shadow-sm border border-gray-200 overflow-hidden">
        <div className="px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Cost by Model (Today)</h2>
        </div>
        <div className="divide-y divide-gray-200">
          {Object.entries(stats.modelCosts)
            .sort(([,a], [,b]) => b.cost - a.cost)
            .map(([model, data]) => (
              <div key={model} className="px-6 py-4 flex items-center justify-between">
                <div>
                  <p className="font-medium text-gray-900">{model}</p>
                  <p className="text-sm text-gray-500">
                    {data.tokens.toLocaleString()} tokens
                  </p>
                </div>
                <div className="text-right">
                  <p className="font-semibold text-gray-900">
                    ${data.cost.toFixed(4)}
                  </p>
                  <p className="text-xs text-gray-500">
                    {stats.todayCost > 0 ? ((data.cost / stats.todayCost) * 100).toFixed(1) : "0.0"}%
                  </p>
                </div>
              </div>
            ))}
        </div>
      </div>
      
      {/* Usage Limits Info */}
      <div className="bg-gray-50 rounded-lg border border-gray-200 p-6">
        <h3 className="text-lg font-semibold text-gray-900 mb-4">Usage Limits</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium text-gray-700">Free Plan</p>
            <ul className="mt-2 space-y-1 text-gray-600">
              <li>Max $5 per run</li>
              <li>Max 100 nodes per run</li>
              <li>Max 100k LLM tokens per run</li>
              <li>Max 10 min execution time</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-gray-700">Paid Plans</p>
            <ul className="mt-2 space-y-1 text-gray-600">
              <li>Max $50 per run</li>
              <li>Max 500 nodes per run</li>
              <li>Max 1M LLM tokens per run</li>
              <li>Max 30 min execution time</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
}
