import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser, type LooseServiceClient } from "@/lib/api";

type PlanRow = {
  id: string;
  name: string;
  slug: string;
  seat_price_monthly: number;
  included_seats: number;
  execution_price_per_minute: number;
  included_execution_minutes: number;
  byok_platform_fee_monthly: number;
  stripe_price_id: string | null;
  stripe_byok_price_id: string | null;
  features: string[];
  sort_order: number;
  is_active: boolean;
  created_at: string;
};

/**
 * GET /api/billing/plans — List available billing plans.
 * Public: any authenticated user can see plans.
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;

  const { data: plans, error } = await service
    .from("billing_plans")
    .select(
      "id, name, slug, seat_price_monthly, included_seats, execution_price_per_minute, included_execution_minutes, byok_platform_fee_monthly, features, sort_order"
    )
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  if (error) return apiError(error.message, 500);

  return NextResponse.json({ plans: (plans ?? []) as PlanRow[] });
}
