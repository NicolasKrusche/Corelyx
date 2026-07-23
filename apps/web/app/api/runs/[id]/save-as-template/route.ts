import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";

/**
 * POST /api/runs/[id]/save-as-template
 *
 * Saves a completed workflow run as a reusable template in the template gallery.
 * Reads the program_json from the run's parent program and creates a template entry.
 */
export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const { id: runId } = await routeParams;

  const supabase = await createServerClient();
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  // Parse request body
  let body: { name?: string; description?: string; category?: string; difficulty?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }

  const name = body.name?.trim();
  if (!name) return apiError("Template name is required", 400);

  const serviceClient = createServiceClient();

  // Fetch the run and its parent program
  type RunRow = {
    id: string;
    program_id: string;
    status: string;
  };
  const { data: runRaw, error: runError } = await serviceClient
    .from("runs")
    .select("id, program_id, status")
    .eq("id", runId)
    .single();

  if (runError || !runRaw) return apiError("Run not found", 404);
  const run = runRaw as unknown as RunRow;

  // Only allow saving successful/completed runs
  if (!["completed", "success"].includes(run.status)) {
    return apiError("Can only save templates from successful runs", 400);
  }

  // Fetch the parent program's schema
  type ProgramRow = {
    id: string;
    schema: unknown;
    name: string;
  };
  const { data: programRaw, error: progError } = await serviceClient
    .from("programs")
    .select("id, schema, name")
    .eq("id", run.program_id)
    .single();

  if (progError || !programRaw) return apiError("Program not found", 404);
  const program = programRaw as unknown as ProgramRow;

  // Create the template — use untyped client because `templates` may not be in generated types
  const templateData = {
    name,
    description: body.description?.trim() || null,
    category: body.category?.trim() || "general",
    difficulty: body.difficulty?.trim() || "medium",
    program_json: program.schema,
    is_public: true,
    created_by: user.id,
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const untypedDb = serviceClient as any;
  const { data: template, error: templateError } = await untypedDb
    .from("templates")
    .insert(templateData)
    .select("id")
    .single() as { data: { id: string } | null; error: unknown };

  if (templateError) {
    return apiError("Failed to create template", 500);
  }

  return NextResponse.json({
    template_id: template!.id,
    message: "Template created successfully",
  });
}
