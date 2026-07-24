import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";

/**
 * DELETE /api/templates/[id]
 *
 * Deletes a template. Only the creator can delete their own templates.
 */
export async function DELETE(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const db = createServiceClient() as any;

  // Fetch the template to verify ownership
  const { data: template, error: fetchError } = await db
    .from("templates")
    .select("id, created_by")
    .eq("id", params.id)
    .single();

  if (fetchError || !template) {
    return apiError("Template not found", 404);
  }

  if (template.created_by !== user.id) {
    return apiError("You can only delete your own templates", 403);
  }

  const { error: deleteError } = await db
    .from("templates")
    .delete()
    .eq("id", params.id);

  if (deleteError) {
    return apiError("Failed to delete template", 500);
  }

  return NextResponse.json({ message: "Template deleted" });
}
