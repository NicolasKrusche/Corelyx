import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
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
  const schema = buildBlankProgramSchema({
    programId,
    name: parsed.data.name,
    description,
    now,
  });

  const { data: programRaw, error: insertError } = await supabase
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

  const validation = validatePostGenesis(schema, []);

  const { error: versionError } = await supabase.from("program_versions").insert({
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
