import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/admin";

/**
 * POST /api/templates/[id]/review
 *
 * Admin endpoint to approve or reject a pending template.
 * Body: { action: "approve" | "reject", rejection_reason?: string }
 */
export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  // Check admin access
  const isAdminByProfile = await isUserAdmin(user.id);
  if (!isAdminByProfile && !isAdminEmail(user.email ?? undefined)) {
    return apiError("Admin access required", 403);
  }

  let body: { action?: string; rejection_reason?: string };
  try {
    body = await request.json();
  } catch {
    return apiError("Invalid request body", 400);
  }

  if (body.action !== "approve" && body.action !== "reject") {
    return apiError('action must be "approve" or "reject"', 400);
  }

  const db = createServiceClient() as any;

  // Fetch the template
  const { data: template, error: fetchError } = await db
    .from("templates")
    .select("id, status")
    .eq("id", params.id)
    .single();

  if (fetchError || !template) {
    return apiError("Template not found", 404);
  }

  const updateData: Record<string, unknown> = {
    status: body.action === "approve" ? "approved" : "rejected",
    updated_at: new Date().toISOString(),
  };

  if (body.action === "reject" && body.rejection_reason) {
    updateData.rejection_reason = body.rejection_reason.trim();
  }

  if (body.action === "approve") {
    updateData.rejection_reason = null;
  }

  const { error: updateError } = await db
    .from("templates")
    .update(updateData)
    .eq("id", params.id);

  if (updateError) {
    return apiError("Failed to update template", 500);
  }

  return NextResponse.json({
    message: `Template ${body.action}d successfully`,
    status: updateData.status,
  });
}

async function isUserAdmin(userId: string): Promise<boolean> {
  const db = createServiceClient();
  const { data } = await db
    .from("profiles")
    .select("is_admin")
    .eq("id", userId)
    .single();
  return (data as { is_admin: boolean | null } | null)?.is_admin === true;
}
