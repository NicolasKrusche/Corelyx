import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { isAdmin } from "@/lib/admin";

const TEMPLATE_COLUMNS =
  "id, name, description, category, difficulty, estimated_runtime, required_connections, tags, genesis_prompt, program_json, thumbnail_url, is_public, status, rejection_reason, created_by, created_at, fork_count";

/**
 * GET /api/templates
 *
 * Lists templates from the Supabase `templates` table.
 * Supports optional query params:
 *   ?category=devops       — filter by category
 *   ?search=github         — search by name or description
 *   ?connector=Gmail       — filter by required connection
 *   ?difficulty=easy       — filter by difficulty level
 *   ?status=pending        — filter by review status (admins only in practice;
 *                            a normal caller can only ever see their own rows
 *                            plus approved public ones, whatever they pass)
 *
 * Row visibility is enforced by RLS, NOT by this handler. That is deliberate:
 * this route used to read with the service client, which bypasses RLS, and
 * applied no is_public/status/ownership filter of its own — so every logged-in
 * user could read every other user's unpublished drafts, including the complete
 * `program_json` workflow and `genesis_prompt`. Migration 20260726100000 had
 * already tightened the policy to
 *
 *     (is_public AND status = 'approved') OR created_by = auth.uid()
 *
 * specifically to close that hole, but the fix did nothing while the only read
 * path went around it. The user-scoped client below puts the policy back in
 * charge. Admins still get the unfiltered view for the review queue, via an
 * explicit privilege check rather than as an accident of the client type.
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

  // Admins moderate templates they do not own and that are not yet public, so
  // they need to see past RLS. Everyone else reads through it.
  const callerIsAdmin = await isAdmin(user.id, user.email ?? undefined);
  const db = callerIsAdmin ? createServiceClient() : supabase;

  let query = db.from("templates").select(TEMPLATE_COLUMNS);

  // Defence in depth: state the same rule the RLS policy states, in the query.
  //
  // Relying on RLS alone is what produced the original bug — the handler said
  // "RLS already handles access" while reading with a client that bypasses it.
  // This database has also drifted from its migration files repeatedly, so
  // "the policy is applied" is not a safe assumption to build a privacy
  // boundary on. With both in place the leak requires two independent failures.
  if (!callerIsAdmin) {
    query = query.or(
      `and(is_public.eq.true,status.eq.approved),created_by.eq.${user.id}`
    );
  }

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

  // Attach the submitter's display name for the review queue. Admin-only: a
  // reviewer needs to tell one submitter from another (a repeat spammer is
  // invisible when every card reads "by 4f3a91c2…"), but nobody else has a
  // reason to learn who authored a template.
  //
  // display_name/username rather than email on purpose — enough to identify a
  // submitter across cards, without moving contact details into a response that
  // did not carry them before. `profiles` has no email column anyway.
  if (callerIsAdmin && templates.length > 0) {
    const creatorIds = [
      ...new Set(
        templates
          .map((t) => (t as { created_by?: string }).created_by)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      ),
    ];

    if (creatorIds.length > 0) {
      // Best-effort: a failure here must not cost the reviewer the queue.
      const { data: profiles } = await createServiceClient()
        .from("profiles")
        .select("id, display_name, username")
        .in("id", creatorIds);

      const byId = new Map(
        ((profiles ?? []) as Array<{
          id: string;
          display_name: string | null;
          username: string | null;
        }>).map((p) => [p.id, p])
      );

      templates = templates.map((t) => {
        const creator = byId.get((t as { created_by?: string }).created_by ?? "");
        return {
          ...t,
          creator_name: creator?.display_name ?? null,
          creator_username: creator?.username ?? null,
        };
      });
    }
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
