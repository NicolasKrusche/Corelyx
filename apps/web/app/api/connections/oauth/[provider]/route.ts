import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { checkPayPerUseConnectorAccess } from "@/lib/limits";
import { PAY_PER_USE_PROVIDERS } from "@/lib/connector-tiers";

/**
 * Catch-all OAuth route for providers that use API keys rather than OAuth2 redirect flows.
 * Redirects the user back to the connections page with a dialog prompt to enter their API key.
 *
 * Providers with proper OAuth2 redirect flows have their own dedicated route.ts files that
 * take precedence over this dynamic catch-all (Next.js static segments beat dynamic ones).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return apiError("Unauthorized", 401);

  // Pay-per-use connectors require Solo plan or higher
  if (PAY_PER_USE_PROVIDERS.has(provider)) {
    const access = await checkPayPerUseConnectorAccess(user.id);
    if (!access.allowed) {
      return apiError(access.upgradeMessage ?? access.reason ?? "Solo plan required", 403);
    }
  }

  const { searchParams, origin } = new URL(request.url);
  const label = searchParams.get("label") ?? `${provider}:primary`;

  // Redirect to connections page — the UI will detect connect_api_key and open the dialog
  const redirectUrl = new URL(`${origin}/connections`);
  redirectUrl.searchParams.set("connect_api_key", provider);
  redirectUrl.searchParams.set("label", label);

  return NextResponse.redirect(redirectUrl.toString());
}
