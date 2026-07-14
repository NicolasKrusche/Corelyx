import { NextResponse } from "next/server";
import { apiError, getAuthUser } from "@/lib/api";
import { getUserCreditBalance } from "@/lib/credits";

// GET /api/credits/balance
// Returns the current user's platform AI credit balance.
export async function GET() {
  // getAuthUser (not the cookie-only supabase.auth.getUser) so device-token
  // clients (Corelyx Mobile) can read the balance too.
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  try {
    const balance = await getUserCreditBalance(user.id);
    return NextResponse.json({
      availableIncluded: balance.availableIncluded === Infinity ? null : balance.availableIncluded,
      availablePurchased: balance.availablePurchased,
      total: balance.total === Infinity ? null : balance.total,
    });
  } catch {
    return apiError("Failed to fetch credit balance", 500);
  }
}
