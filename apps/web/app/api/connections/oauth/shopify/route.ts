import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { applyOAuthStateCookie, issueOAuthStateForRequest } from "@/lib/oauth-state";

const SCOPES = "read_products,write_products,read_orders,write_orders,read_customers,write_customers,read_inventory";

export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);
  const { searchParams, origin } = new URL(request.url);
  const shop = searchParams.get("shop");
  if (!shop) return NextResponse.redirect(`${origin}/connections?error=missing_shop_param`);
  const label = searchParams.get("label") ?? "shopify:primary";
  const issuedState = await issueOAuthStateForRequest(user.id, { label, shop });
  const params = new URLSearchParams({ client_id: process.env.SHOPIFY_CLIENT_ID!, redirect_uri: `${process.env.NEXT_PUBLIC_APP_URL}/api/connections/oauth/shopify/callback`, scope: SCOPES, state: issuedState.state });
  const response = NextResponse.redirect(`https://${shop}.myshopify.com/admin/oauth/authorize?${params}`);
  return applyOAuthStateCookie(response, issuedState);
}
