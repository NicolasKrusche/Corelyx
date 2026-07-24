import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { canView, getProgramAccess } from "@/lib/workspaces";

// GET /api/programs/:id/export — returns the program schema as canonical JSON.
export async function GET(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);

  const { data, error } = await supabase
    .from("programs")
    .select("id, name, description, schema, execution_mode, is_active, schema_version, created_at, updated_at")
    .eq("id", params.id)
    .single();

  if (error || !data) return apiError("Program not found", 404);

  const programRow = data as unknown as {
    id: string;
    name: string;
    description: string | null;
    schema: Record<string, unknown> | null;
    execution_mode: string;
    is_active: boolean;
    schema_version: number | null;
    created_at: string;
    updated_at: string;
  };

  const schema = programRow.schema as Record<string, unknown> | null;
  if (!schema) {
    return apiError("Program has no schema to export", 404);
  }

  // Build canonical export envelope
  const exportPayload = {
    export_format: "corelyx",
    export_version: "1.0",
    exported_at: new Date().toISOString(),
    program: {
      id: programRow.id,
      name: programRow.name,
      description: programRow.description,
      execution_mode: programRow.execution_mode,
      is_active: programRow.is_active,
      schema_version: programRow.schema_version,
      created_at: programRow.created_at,
      updated_at: programRow.updated_at,
    },
    schema,
  };

  return NextResponse.json(exportPayload, {
    headers: {
      "Content-Type": "application/json",
      "Content-Disposition": `attachment; filename="corelyx-${programRow.name.replace(/[^a-zA-Z0-9-_]/g, "-").toLowerCase()}.json"`,
    },
  });
}
