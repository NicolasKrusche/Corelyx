import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { hasCostsAccess } from "@/lib/admin-auth";
import { createServiceClient } from "@/lib/api";
import { getFinanceSummary, getModelSpread } from "@/lib/admin-finance";
import { DollarSign, TrendingUp, Users, AlertTriangle } from "lucide-react";

export const dynamic = "force-dynamic";

// This page tracks what LLM usage costs US: platform-key provider cost only
// (BYOK calls are paid by the user's own key). Revenue/profit live on
// /admin/finances.
async function getCostStats() {
  const db = createServiceClient();
  const now = new Date();
  const todayStart = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toISOString();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();

  const [today, month, models] = await Promise.all([
    getFinanceSummary(db, todayStart),
    getFinanceSummary(db, monthStart),
    getModelSpread(db, todayStart),
  ]);

  return {
    todayCost: today.data.platformCostUsd,
    monthlyCost: month.data.platformCostUsd,
    activeUsers: today.data.distinctUsers,
    models: models.data,
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
        <h1 className="text-2xl font-bold tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">Costs & Billing</h1>
        <p className="text-muted-foreground">Monitor LLM usage and costs</p>
      </div>
      
      {/* Cost Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">Today&apos;s Cost</p>
            <DollarSign className="w-5 h-5 text-green-500" />
          </div>
          <p className="text-3xl font-bold text-foreground">
            ${stats.todayCost.toFixed(2)}
          </p>
          <div className="mt-2">
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  dailyPercent > 90 ? "bg-red-500" : dailyPercent > 70 ? "bg-yellow-500" : "bg-green-500"
                }`}
                style={{ width: `${Math.min(dailyPercent, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {dailyPercent.toFixed(1)}% of ${dailyLimit} daily limit
            </p>
          </div>
        </div>
        
        <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">Monthly Cost</p>
            <TrendingUp className="w-5 h-5 text-blue-500" />
          </div>
          <p className="text-3xl font-bold text-foreground">
            ${stats.monthlyCost.toFixed(2)}
          </p>
          <div className="mt-2">
            <div className="w-full bg-muted rounded-full h-2">
              <div 
                className={`h-2 rounded-full ${
                  monthlyPercent > 90 ? "bg-red-500" : monthlyPercent > 70 ? "bg-yellow-500" : "bg-blue-500"
                }`}
                style={{ width: `${Math.min(monthlyPercent, 100)}%` }}
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              {monthlyPercent.toFixed(1)}% of ${monthlyLimit} monthly limit
            </p>
          </div>
        </div>
        
        <div className="bg-card p-6 rounded-lg shadow-sm border border-border">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-muted-foreground">Active Users</p>
            <Users className="w-5 h-5 text-purple-500" />
          </div>
          <p className="text-3xl font-bold text-foreground">
            {stats.activeUsers}
          </p>
          <p className="text-xs text-muted-foreground mt-2">
            Users with LLM usage today
          </p>
        </div>
      </div>
      
      {/* Alerts */}
      {(dailyPercent > 80 || monthlyPercent > 80) && (
        <div className="bg-yellow-500/10 border-l-4 border-yellow-500/60 p-4">
          <div className="flex">
            <AlertTriangle className="h-5 w-5 text-yellow-400" />
            <div className="ml-3">
              <h3 className="text-sm font-medium text-yellow-700 dark:text-yellow-300">
                Approaching Cost Limit
              </h3>
              <div className="mt-2 text-sm text-yellow-700 dark:text-yellow-300">
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
      <div className="bg-card rounded-lg shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h2 className="text-lg font-semibold text-foreground">Cost by Model (Today)</h2>
        </div>
        <div className="divide-y divide-border">
          {stats.models.length === 0 && (
            <p className="px-6 py-4 text-sm text-muted-foreground">No LLM usage recorded today.</p>
          )}
          {stats.models.map((row) => (
            <div key={row.model} className="px-6 py-4 flex items-center justify-between">
              <div>
                <p className="font-medium text-foreground">{row.model}</p>
                <p className="text-sm text-muted-foreground">
                  {row.totalTokens.toLocaleString()} tokens · {row.callCount.toLocaleString()} calls
                </p>
              </div>
              <div className="text-right">
                <p className="font-semibold text-foreground">
                  ${row.platformCostUsd.toFixed(4)}
                </p>
                <p className="text-xs text-muted-foreground">
                  {stats.todayCost > 0 ? ((row.platformCostUsd / stats.todayCost) * 100).toFixed(1) : "0.0"}%
                </p>
              </div>
            </div>
          ))}
        </div>
      </div>
      
      {/* Usage Limits Info */}
      <div className="bg-muted/40 rounded-lg border border-border p-6">
        <h3 className="text-lg font-semibold text-foreground mb-4">Usage Limits</h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
          <div>
            <p className="font-medium text-foreground/80">Free Plan</p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
              <li>Max $5 per run</li>
              <li>Max 100 nodes per run</li>
              <li>Max 100k LLM tokens per run</li>
              <li>Max 10 min execution time</li>
            </ul>
          </div>
          <div>
            <p className="font-medium text-foreground/80">Paid Plans</p>
            <ul className="mt-2 space-y-1 text-muted-foreground">
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
