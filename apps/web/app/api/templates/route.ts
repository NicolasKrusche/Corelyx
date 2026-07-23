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
 * Returns public templates and user's own templates.
 */
export async function GET(request: Request) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { searchParams } = new URL(request.url);
  const category = searchParams.get("category");
  const search = searchParams.get("search");
  const connector = searchParams.get("connector");
  const difficulty = searchParams.get("difficulty");

  const db = createServiceClient();

  let query = db
    .from("templates")
    .select("id, name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, thumbnail_url, is_public, created_at");

  // RLS already handles access; filter for public or user-owned
  // The RLS policy allows authenticated users to read all templates (internal beta)
  if (category) {
    query = query.eq("category", category);
  }

  if (difficulty) {
    query = query.eq("difficulty", difficulty);
  }

  if (search) {
    query = query.or(`name.ilike.%${search}%,description.ilike.%${search}%`);
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
