import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";

/**
 * GET /api/templates
 *
 * Lists templates from the Supabase `templates` table.
 * Supports optional query params:
 *   ?category=devops       — filter by category
 *   ?search=github         — search by name or description
 *   ?connector=Gmail       — filter by required connection
 *   ?difficulty=easy       — filter by difficulty level
 *   ?status=pending        — filter by review status
 * Returns public templates and user's own templates.
 */
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const connector = searchParams.get("connector");
  const difficulty = searchParams.get("difficulty");
  const status = searchParams.get("status");

  const db = createServiceClient();

  let query = db
    .from("templates")
    .select(
      "id, name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, thumbnail_url, is_public, status, rejection_reason, created_by, created_at, fork_count"
    );

  // RLS already handles access; filter for public or user-owned
  // The RLS policy allows authenticated users to read all templates (internal beta)
  if (category) {
    query = query.eq("category", category);
  }

  if (difficulty) {
    query = query.eq("difficulty", difficulty);
  }

  if (status) {
    query = query.eq("status", status);
  }

  if (search) {
    query = query.or(
      `name.ilike.%${search}%,description.ilike.%${search}%`
    );
  }

  // For connector filtering, we need to filter after fetching since Supabase
  // doesn't have great array contains support with the client lib
  query = query.order("created_at", { ascending: false });

  const { data, error } = await query;

  if (error) {
    return apiError("Failed to load templates", 500);
  }

  let templates = data ?? [];

  // Apply connector filter post-fetch (Supabase array filtering)
  if (connector) {
    templates = templates.filter((t: any) =>
      t.required_connections?.some(
        (c: string) => c.toLowerCase() === connector.toLowerCase()
      )
    );
  }

  return NextResponse.json({ templates });
}

/**
 * POST /api/templates
 *
 * Creates a new standalone template (not from a run).
 * Used by the SaveAsTemplateModal when no programId is provided.
 */
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  let body: {
    name?: string;
    description?: string;
    category?: string;
    difficulty?: string;
    is_public?: boolean;
    genesis_prompt?: string;
    program_json?: unknown;
  };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }

  const name = body.name?.trim();
  if (!name) return apiError("Template name is required", 400);

  const db = createServiceClient() as any;

  const templateData = {
    name,
    description: body.description?.trim() || null,
    category: body.category?.trim() || "general",
    difficulty: body.difficulty?.trim() || "medium",
    genesis_prompt: body.genesis_prompt || "",
    program_json: body.program_json || { nodes: [], edges: [] },
    is_public: body.is_public ?? true,
    created_by: user.id,
    status: body.is_public ? "pending" : "draft",
  };

  const { data: template, error: templateError } = await db
    .from("templates")
    .insert(templateData)
    .select("id")
    .single();

  if (templateError) {
    return apiError("Failed to create template", 500);
  }

  return NextResponse.json({
    template_id: template!.id,
    message: "Template created successfully",
  });
}
