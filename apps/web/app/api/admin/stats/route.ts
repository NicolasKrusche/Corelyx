import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { isAdminEmail } from "@/lib/admin";
import { isUserAdmin } from "@/lib/admin-auth";
import { serverLog } from "@/lib/server-log";

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

/**
 * GET /api/admin/stats
 * Returns system statistics for admin dashboard.
 */
export async function GET() {
  const supabase = await createServerClient();
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user || !(isAdminEmail(user.email ?? undefined) || (await isUserAdmin(user.id)))) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }
  
  try {
    const db = createServiceClient();

    // Get active runs count
    const { count: activeRuns } = await db
      .from("runs")
      .select("*", { count: "exact", head: true })
      .eq("status", "running");
    
    // Get today's stats
    const today = new Date().toISOString().split("T")[0];
    
    const [
      { count: todayRuns },
      { count: totalUsers },
      { data: todayCostData },
      { data: recentFailures },
    ] = await Promise.all([
      db
        .from("runs")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today),
      db
        .from("profiles")
        .select("*", { count: "exact", head: true }),
      db
        .from("llm_usage_logs")
        .select("estimated_cost_usd")
        .gte("created_at", today),
      db
        .from("runs")
        .select("id, program_id, error_message, created_at")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    const todayCost = asRows<EstimatedCostRow>(todayCostData).reduce(
      (sum, row) => sum + (row.estimated_cost_usd || 0),
      0
    );
    
    return NextResponse.json({
      activeRuns: activeRuns || 0,
      todayRuns: todayRuns || 0,
      totalUsers: totalUsers || 0,
      todayCost,
      recentFailures: asRows<RecentFailureRow>(recentFailures),
    });
  } catch (error) {
    serverLog({ level: "error", event: "admin.stats.query_failed", message: "Admin stats query failed." });
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
