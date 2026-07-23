import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { getSecretsHealthReport } from "@/lib/health/secrets-monitor";
import type { SecretsHealthReport } from "@/lib/health/secrets-monitor";

// ---------------------------------------------------------------------------
// GET /api/connections/health
// Returns per-connection health status (🟢/🟡/🔴) for the active workspace.
// Never exposes raw tokens, Vault IDs, or credential values.
// ---------------------------------------------------------------------------

export async function GET() {
  try {
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return apiError("Unauthorized", 401);

    const ws = await getActiveWorkspace(user.id);
    if (!ws) return apiError("No active workspace", 400);

    const serviceClient = createServiceClient();
    const report = await getSecretsHealthReport(serviceClient, ws.workspaceId);

    return NextResponse.json(report satisfies SecretsHealthReport);
  } catch (error) {
    console.error("Connections health API error:", error);
    return apiError("Internal Server Error", 500);
  }
}
