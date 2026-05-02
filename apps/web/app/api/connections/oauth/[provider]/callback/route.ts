import { NextResponse } from "next/server";

/**
 * Catch-all callback for OAuth flows.
 * Individual providers with proper OAuth2 flows have their own callback/route.ts
 * that takes precedence (static > dynamic in Next.js App Router).
 */
export async function GET(
  request: Request,
  { params }: { params: Promise<{ provider: string }> }
) {
  const { provider } = await params;
  const { origin, searchParams } = new URL(request.url);
  const error = searchParams.get("error");

  if (error) {
    return NextResponse.redirect(`${origin}/connections?error=${error}`);
  }

  // Unknown provider callback — send back to connections with a generic error
  return NextResponse.redirect(
    `${origin}/connections?error=unsupported_oauth_provider&provider=${provider}`
  );
}
