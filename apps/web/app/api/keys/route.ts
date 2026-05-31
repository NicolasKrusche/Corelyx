import { NextResponse } from "next/server";
import { z } from "zod";

import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { vaultStore } from "@/lib/vault";
import { checkBYOKAccess } from "@/lib/limits";
import { canContributeToWorkspace, getActiveWorkspace } from "@/lib/workspaces";

const CreateKeySchema = z.object({
  name: z.string().min(1).max(100),
  provider: z.string().min(1).max(50),
  key: z.string().min(10),
});

// GET /api/keys — list api keys in active workspace (no secret values).
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);

  const { data, error } = await supabase
    .from("api_keys")
    .select("id, name, provider, is_valid, last_validated_at, last_used_at, created_at, user_id, workspace_id")
    .eq("workspace_id", ws.workspaceId)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("[GET /api/keys] Supabase error:", error);
    return apiError(error.message, 500);
  }
  return NextResponse.json(data);
}

// POST /api/keys — add a new API key (workspace contributor).
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) {
    return apiError("Viewers cannot add API keys.", 403);
  }

  const byokCheck = await checkBYOKAccess(user.id, ws.workspaceId);
  if (!byokCheck.allowed) {
    return NextResponse.json(
      { error: "FEATURE_NOT_AVAILABLE", message: byokCheck.upgradeMessage },
      { status: 403 }
    );
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateKeySchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const { name, provider, key } = parsed.data;
  const serviceClient = createServiceClient();

  let vaultId: string;
  try {
    vaultId = await vaultStore(
      serviceClient,
      key,
      `apikey:${ws.workspaceId}:${provider}:${name}`,
      `API key for ${provider} — workspace ${ws.workspaceId}`
    );
  } catch (err) {
    return apiError(`Failed to store key securely: ${(err as Error).message}`, 500);
  }

  const { data, error } = await supabase
    .from("api_keys")
    .insert({
      user_id: user.id,
      workspace_id: ws.workspaceId,
      name,
      provider,
      vault_secret_id: vaultId,
    } as never)
    .select("id, name, provider, is_valid, last_validated_at, last_used_at, created_at, user_id, workspace_id")
    .single();

  if (error) return apiError(error.message, 500);
  return NextResponse.json(data, { status: 201 });
}
