import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { checkProgramLimit } from "@/lib/limits";
import { buildBlankProgramSchema } from "@/lib/programs/blank-schema";
import { validatePostGenesis } from "@/lib/validation";
import { canContributeToWorkspace, getActiveWorkspace } from "@/lib/workspaces";

const CreateProgramBodyZ = z.object({
  mode: z.literal("blank").default("blank"),
  name: z.string().trim().min(1).max(120).optional(),
  description: z.string().max(5000).optional(),
  workspace_id: z.string().uuid().optional(),
});

// GET /api/programs — list programs in the active workspace.
export async function GET() {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);

  const { data, error } = await supabase
    .from("programs")
    .select("id, name, description, execution_mode, is_active, schema_version, last_run_at, visibility, workspace_id, user_id, created_at, updated_at")
    .eq("workspace_id", ws.workspaceId)
    .order("updated_at", { ascending: false });

  if (error) return apiError(error.message, 500);
  return NextResponse.json(data);
}

// POST /api/programs — create a program in the active workspace.
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = await request.json().catch(() => ({}));
  const parsed = CreateProgramBodyZ.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const ws = await getActiveWorkspace(user.id);
  if (!ws) return apiError("No active workspace", 400);
  if (!canContributeToWorkspace(ws.role)) {
    return apiError("Viewers cannot create programs.", 403);
  }

  if (ws.role === "member") {
    const svc = createServiceClient() as ReturnType<typeof createServiceClient> & { from(t: string): any };
    const { data: wsRow } = await svc
      .from("workspaces")
      .select("members_can_create_programs")
      .eq("id", ws.workspaceId)
      .single();
    if ((wsRow as { members_can_create_programs: boolean } | null)?.members_can_create_programs === false) {
      return apiError("Only workspace owners and admins can create programs in this workspace.", 403);
    }
  }

  const limitCheck = await checkProgramLimit(user.id, ws.workspaceId);
  if (!limitCheck.allowed) {
    return NextResponse.json(
      { error: "PROGRAM_LIMIT_REACHED", message: limitCheck.upgradeMessage },
      { status: 403 }
    );
  }

  const now = new Date().toISOString();
  const description = parsed.data.description?.trim() ?? "";
  const programId = crypto.randomUUID();
  const serviceClient = createServiceClient();
  const schema = buildBlankProgramSchema({
    programId,
    name: parsed.data.name,
    description,
    now,
  });

  const { data: programRaw, error: insertError } = await serviceClient
    .from("programs")
    .insert({
      id: programId,
      user_id: user.id,
      workspace_id: ws.workspaceId,
      name: schema.program_name,
      description: description || null,
      schema: schema as unknown as Record<string, unknown>,
      execution_mode: schema.execution_mode,
      is_active: false,
      updated_at: now,
    } as unknown as never)
    .select("id, name, description, execution_mode, is_active, schema_version, visibility, workspace_id, user_id, created_at, updated_at")
    .single();

  if (insertError || !programRaw) {
    return apiError(insertError?.message ?? "Failed to create program", 500);
  }

  const { error: membershipError } = await serviceClient.from("program_memberships").insert({
    program_id: programId,
    user_id: user.id,
    role: "editor",
    created_by: user.id,
  } as unknown as never);
  if (membershipError) {
    console.error("[/api/programs] Failed to grant creator editor access:", membershipError.message);
  }

  const validation = validatePostGenesis(schema, []);

  const { error: versionError } = await serviceClient.from("program_versions").insert({
    program_id: programId,
    version: 0,
    schema: schema as unknown as Record<string, unknown>,
    change_summary: "Created blank program",
  } as unknown as never);

  if (versionError) {
    console.error("[/api/programs] Failed to store blank program snapshot:", versionError.message);
  }

  return NextResponse.json(
    {
      program: programRaw,
      validation,
    },
    { status: 201 }
  );
}
