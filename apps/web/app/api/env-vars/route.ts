import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient, apiError } from "@/lib/api";
import { vaultStore } from "@/lib/vault";
import { canContributeToWorkspace, getActiveWorkspace } from "@/lib/workspaces";

const ENV_NAME_RE = /^[A-Z_][A-Z0-9_]*$/;

const CreateEnvVarSchema = z.object({
  name: z
    .string()
    .min(1)
    .max(100)
    .regex(ENV_NAME_RE, "Name must be UPPER_SNAKE_CASE (A-Z, 0-9, underscore, not starting with a digit)"),
  value: z.string().min(1, "Value cannot be empty"),
});

// GET /api/env-vars — list env var names for the active workspace (no values).
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);

  const { data, error } = await supabase
    .from("workspace_env_vars")
    .select("id, name, created_by, created_at, updated_at")
    .eq("workspace_id", ws.workspaceId)
    .order("name", { ascending: true });

  if (error) return apiError(error.message, 500);
  return NextResponse.json(data ?? []);
}

// POST /api/env-vars — create a new env var (workspace contributor only).
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) {
    return apiError("Viewers cannot add environment variables.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = CreateEnvVarSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: parsed.error.errors[0]?.message ?? "Invalid input" },
      { status: 400 }
    );
  }

  const { name, value } = parsed.data;
  const serviceClient = createServiceClient();

  // Check for duplicate name in this workspace
  const { data: existing } = await serviceClient
    .from("workspace_env_vars")
    .select("id")
    .eq("workspace_id", ws.workspaceId)
    .eq("name", name)
    .maybeSingle();

  if (existing) {
    return NextResponse.json(
      { error: `A variable named "${name}" already exists in this workspace.` },
      { status: 409 }
    );
  }

  // Store value in vault
  let vaultId: string;
  try {
    vaultId = await vaultStore(
      serviceClient,
      value,
      `envvar:${ws.workspaceId}:${name}`,
      `Env var ${name} — workspace ${ws.workspaceId}`
    );
  } catch (err) {
    return apiError(`Failed to store value securely: ${(err as Error).message}`, 500);
  }

  const { data, error } = await supabase
    .from("workspace_env_vars")
    .insert({
      workspace_id: ws.workspaceId,
      name,
      vault_secret_id: vaultId,
      created_by: user.id,
    } as never)
    .select("id, name, created_by, created_at, updated_at")
    .single();

  if (error) return apiError(error.message, 500);
  return NextResponse.json(data, { status: 201 });
}
