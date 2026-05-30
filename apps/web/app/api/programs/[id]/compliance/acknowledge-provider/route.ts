import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { canEdit, getProgramAccess } from "@/lib/workspaces";

const bodySchema = z.object({
  provider_id: z.string().min(1).max(80),
});

/**
 * POST /api/programs/[id]/compliance/acknowledge-provider
 *
 * Adds a provider to the workspace's dpa_acknowledged_providers list.
 * Once acknowledged the compliance check for that provider downgrades from
 * "blocked" to "warning" so runs are no longer prevented.
 *
 * Only workspace editors (and above) can acknowledge a provider.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id: programId } = await params;

  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(programId, user.id);
  if (!access) return apiError("Program not found", 404);
  if (!canEdit(access)) return apiError("You must be a workspace editor to acknowledge a provider.", 403);

  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const { provider_id } = parsed.data;
  const workspaceId = access.workspaceId;

  const service = createServiceClient();

  // Fetch the current acknowledged list
  const { data: workspace, error: fetchError } = await service
    .from("workspaces")
    .select("dpa_acknowledged_providers")
    .eq("id", workspaceId)
    .single();

  if (fetchError || !workspace) return apiError("Workspace not found", 404);

  const current: string[] = Array.isArray(
    (workspace as { dpa_acknowledged_providers: string[] }).dpa_acknowledged_providers
  )
    ? (workspace as { dpa_acknowledged_providers: string[] }).dpa_acknowledged_providers
    : [];

  if (current.includes(provider_id)) {
    // Already acknowledged — no-op, return success
    return NextResponse.json({ ok: true, provider_id, acknowledged: current });
  }

  const next = [...current, provider_id];

  const { error: updateError } = await service
    .from("workspaces")
    .update({ dpa_acknowledged_providers: next } as never)
    .eq("id", workspaceId);

  if (updateError) return apiError(updateError.message, 500);

  return NextResponse.json({ ok: true, provider_id, acknowledged: next });
}
