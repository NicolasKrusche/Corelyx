import { NextResponse } from "next/server";
import { apiError, getAuthUser } from "@/lib/api";
import { hasTechnicalAccess } from "@/lib/admin-auth";
import { getRuntimeUrl } from "@/lib/runtime-url";
import { buildInternalServiceHeaders } from "@/lib/internal-auth";

// Real circuit-breaker state proxied from the runtime — the admin dashboard
// used to render hardcoded mock data that always showed every circuit as
// healthy, which would have been actively misleading during a real incident.

async function requireTechnicalAdmin() {
  const user = await getAuthUser();
  if (!user) return null;
  if (!(await hasTechnicalAccess(user.id, user.email))) return null;
  return user;
}

async function callRuntime(path: string, method: "GET" | "POST"): Promise<NextResponse> {
  const runtimeUrl = getRuntimeUrl();

  let headers: Headers;
  try {
    headers = buildInternalServiceHeaders(
      "runtime:circuits",
      {},
      { method, path, body: "" }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return apiError(
      message.includes("Missing scoped internal auth secret")
        ? "Runtime auth is not configured. Set INTERNAL_SERVICE_AUTH_SECRET_RUNTIME_CIRCUITS in Vercel and Railway."
        : "Runtime auth is not configured.",
      500
    );
  }

  let res: Response;
  try {
    res = await fetch(`${runtimeUrl}${path}`, { method, headers, cache: "no-store" });
  } catch {
    return apiError("Runtime is unreachable", 502);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    return apiError(`Runtime rejected the request (${res.status}): ${detail.slice(0, 300)}`, 502);
  }

  const data = await res.json().catch(() => ({}));
  return NextResponse.json(data);
}

export async function GET() {
  const user = await requireTechnicalAdmin();
  if (!user) return apiError("Forbidden", 403);
  return callRuntime("/circuits", "GET");
}

export async function POST() {
  const user = await requireTechnicalAdmin();
  if (!user) return apiError("Forbidden", 403);
  return callRuntime("/circuits/reset", "POST");
}
