import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { apiError } from "@/lib/api";

/**
 * GET /api/playground/test-cases
 *
 * List all test cases for the authenticated user.
 */
export async function GET() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const serviceClient = createServiceClient();
  const { data, error } = await serviceClient
    .from("playground_test_cases")
    .select("id, name, prompt, expected_schema, tags, created_at, updated_at")
    .eq("user_id", user.id)
    .order("created_at", { ascending: false });

  if (error) {
    return apiError("Failed to load test cases.", 500);
  }

  return NextResponse.json({ test_cases: data ?? [] });
}

/**
 * POST /api/playground/test-cases
 *
 * Save a new test case (prompt + expected schema).
 *
 * Body:
 *   name: string           — human-readable label
 *   prompt: string         — the natural-language prompt
 *   expected_schema?: object — the generated/expected schema
 *   tags?: string[]        — optional tags for categorization
 */
export async function POST(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.name !== "string" || !body.name.trim()) {
    return apiError("name is required", 400);
  }
  if (typeof body.prompt !== "string" || !body.prompt.trim()) {
    return apiError("prompt is required", 400);
  }

  const { name, prompt, expected_schema, tags } = body as {
    name: string;
    prompt: string;
    expected_schema?: Record<string, unknown>;
    tags?: string[];
  };

  const serviceClient = createServiceClient();
  const { data, error } = await (serviceClient as any)
    .from("playground_test_cases")
    .insert({
      user_id: user.id,
      name: name.trim(),
      prompt: prompt.trim(),
      expected_schema: expected_schema ?? null,
      tags: Array.isArray(tags) ? tags : [],
    })
    .select("id, name, prompt, expected_schema, tags, created_at, updated_at")
    .single();

  if (error) {
    return apiError("Failed to save test case.", 500);
  }

  return NextResponse.json({ test_case: data }, { status: 201 });
}

/**
 * DELETE /api/playground/test-cases
 *
 * Delete a test case by id.
 *
 * Body:
 *   id: string — the test case id
 */
export async function DELETE(request: Request) {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = await request.json().catch(() => null);
  if (!body || typeof body.id !== "string") {
    return apiError("id is required", 400);
  }

  const serviceClient = createServiceClient();
  const { error } = await serviceClient
    .from("playground_test_cases")
    .delete()
    .eq("id", body.id)
    .eq("user_id", user.id);

  if (error) {
    return apiError("Failed to delete test case.", 500);
  }

  return NextResponse.json({ ok: true });
}
