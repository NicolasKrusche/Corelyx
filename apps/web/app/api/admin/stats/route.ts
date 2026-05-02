import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { isUserAdmin } from "@/lib/admin-auth";

/**
 * GET /api/admin/stats
 * Returns system statistics for admin dashboard.
 */
export async function GET() {
  const cookieStore = cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
      },
    }
  );
  
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user || !(await isUserAdmin(user.id))) {
    return NextResponse.json(
      { error: "Admin access required" },
      { status: 403 }
    );
  }
  
  try {
    // Get active runs count
    const { count: activeRuns } = await supabase
      .from("runs")
      .select("*", { count: "exact", head: true })
      .eq("status", "running");
    
    // Get today's stats
    const today = new Date().toISOString().split("T")[0];
    
    const [
      { count: todayRuns },
      { count: totalUsers },
      { data: todayCost },
      { data: recentFailures },
    ] = await Promise.all([
      supabase
        .from("runs")
        .select("*", { count: "exact", head: true })
        .gte("created_at", today),
      supabase
        .from("profiles")
        .select("*", { count: "exact", head: true }),
      supabase
        .rpc("get_daily_llm_cost", { target_date: today }),
      supabase
        .from("runs")
        .select("id, program_id, error_message, created_at")
        .eq("status", "failed")
        .order("created_at", { ascending: false })
        .limit(10),
    ]);
    
    return NextResponse.json({
      activeRuns: activeRuns || 0,
      todayRuns: todayRuns || 0,
      totalUsers: totalUsers || 0,
      todayCost: todayCost || 0,
      recentFailures: recentFailures || [],
    });
  } catch (error) {
    console.error("[admin/stats] Error:", error);
    return NextResponse.json(
      { error: "Failed to fetch stats" },
      { status: 500 }
    );
  }
}
