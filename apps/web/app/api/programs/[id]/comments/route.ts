import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser, type LooseServiceClient } from "@/lib/api";
import { canView, getProgramAccess } from "@/lib/workspaces";

type CommentRow = {
  id: string;
  program_id: string;
  node_id: string;
  user_id: string;
  body: string;
  resolved: boolean;
  created_at: string;
};

// ── GET /api/programs/[id]/comments ──────────────────────────────────────────
// Returns all comments for a program. Optional ?node_id= to filter by node.
// Also returns latest approval status for context.

export async function GET(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);

  const service = createServiceClient() as LooseServiceClient;
  const { searchParams } = new URL(request.url);
  const nodeId = searchParams.get("node_id");

  let query = service
    .from("program_comments")
    .select("id, program_id, node_id, user_id, body, resolved, created_at")
    .eq("program_id", params.id)
    .order("created_at", { ascending: true });

  if (nodeId) {
    query = query.eq("node_id", nodeId);
  }

  const { data: comments, error } = await query;
  if (error) return apiError(error.message, 500);

  // Fetch user profiles for display names / avatars
  const userIds = [...new Set((comments ?? []).map((c: CommentRow) => c.user_id))];
  const { data: profiles } =
    userIds.length > 0
      ? await service
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", userIds)
      : { data: [] };

  const profileById = new Map(
    ((profiles ?? []) as Array<{ id: string; display_name: string | null; avatar_url: string | null }>).map(
      (p) => [p.id, p]
    )
  );

  // Fetch latest approval for this program
  const { data: latestApproval } = await service
    .from("program_approvals")
    .select("id, reviewer_id, status, note, created_at, decided_at")
    .eq("program_id", params.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  // Fetch reviewer profile if approval exists
  let reviewerProfile = null;
  if (latestApproval && (latestApproval as { reviewer_id: string }).reviewer_id) {
    const { data: rp } = await service
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", (latestApproval as { reviewer_id: string }).reviewer_id)
      .maybeSingle();
    reviewerProfile = rp;
  }

  return NextResponse.json({
    comments: (comments ?? []).map((c: CommentRow) => ({
      ...c,
      display_name: profileById.get(c.user_id)?.display_name ?? null,
      avatar_url: profileById.get(c.user_id)?.avatar_url ?? null,
    })),
    approval: latestApproval
      ? {
          ...(latestApproval as Record<string, unknown>),
          reviewer_display_name: (reviewerProfile as { display_name?: string } | null)?.display_name ?? null,
          reviewer_avatar_url: (reviewerProfile as { avatar_url?: string } | null)?.avatar_url ?? null,
        }
      : null,
  });
}

// ── POST /api/programs/[id]/comments ─────────────────────────────────────────
// Creates a new comment on a specific node.

const CreateCommentSchema = z.object({
  node_id: z.string().min(1).max(200),
  body: z.string().min(1).max(4000),
});

export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);

  const parsed = CreateCommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const service = createServiceClient() as LooseServiceClient;
  const { data: comment, error } = await service
    .from("program_comments")
    .insert({
      program_id: params.id,
      node_id: parsed.data.node_id,
      user_id: user.id,
      body: parsed.data.body,
      resolved: false,
    } as never)
    .select("id, program_id, node_id, user_id, body, resolved, created_at")
    .single();

  if (error || !comment) return apiError(error?.message ?? "Failed to create comment.", 500);

  // Fetch the author's profile
  const { data: profile } = await service
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json(
    {
      comment: {
        ...(comment as CommentRow),
        display_name: (profile as { display_name?: string } | null)?.display_name ?? null,
        avatar_url: (profile as { avatar_url?: string } | null)?.avatar_url ?? null,
      },
    },
    { status: 201 }
  );
}

// ── DELETE /api/programs/[id]/comments ────────────────────────────────────────
// Deletes a comment. Only the author or program owner/admin can delete.
// Accepts ?comment_id=<uuid> or JSON body { comment_id }.

const DeleteCommentSchema = z.object({
  comment_id: z.string().uuid(),
});

export async function DELETE(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);

  const { searchParams } = new URL(request.url);
  const queryCommentId = searchParams.get("comment_id");
  const parsed = DeleteCommentSchema.safeParse(
    queryCommentId ? { comment_id: queryCommentId } : await request.json().catch(() => null)
  );
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const service = createServiceClient() as LooseServiceClient;

  // Verify the comment exists and belongs to this program
  const { data: existing } = await service
    .from("program_comments")
    .select("id, user_id")
    .eq("id", parsed.data.comment_id)
    .eq("program_id", params.id)
    .maybeSingle();

  if (!existing) return apiError("Comment not found", 404);

  const commentRow = existing as { id: string; user_id: string };

  // Only the author or a workspace admin/owner can delete
  const isAuthor = commentRow.user_id === user.id;
  if (!isAuthor) {
    const { data: program } = await service
      .from("programs")
      .select("workspace_id")
      .eq("id", params.id)
      .maybeSingle();
    const programRow = program as { workspace_id: string } | null;
    if (!programRow) return apiError("Program not found", 404);

    const { data: membership } = await service
      .from("workspace_memberships")
      .select("role")
      .eq("workspace_id", programRow.workspace_id)
      .eq("user_id", user.id)
      .maybeSingle();
    const membershipRow = membership as { role: string } | null;
    if (!membershipRow || !["owner", "admin"].includes(membershipRow.role)) {
      return apiError("You can only delete your own comments.", 403);
    }
  }

  const { error } = await service
    .from("program_comments")
    .delete()
    .eq("id", parsed.data.comment_id);

  if (error) return apiError(error.message, 500);

  return NextResponse.json({ removed: true });
}

// ── PATCH /api/programs/[id]/comments ────────────────────────────────────────
// Updates a comment (e.g., resolve/unresolve). Only admin/owner can resolve.

const UpdateCommentSchema = z.object({
  comment_id: z.string().uuid(),
  resolved: z.boolean().optional(),
  body: z.string().min(1).max(4000).optional(),
});

export async function PATCH(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);

  const parsed = UpdateCommentSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const service = createServiceClient() as LooseServiceClient;

  // Verify comment exists and belongs to this program
  const { data: existing } = await service
    .from("program_comments")
    .select("id, user_id")
    .eq("id", parsed.data.comment_id)
    .eq("program_id", params.id)
    .maybeSingle();

  if (!existing) return apiError("Comment not found", 404);

  const commentRow = existing as { id: string; user_id: string };
  const isAuthor = commentRow.user_id === user.id;

  const updatePayload: Record<string, unknown> = {};
  if (parsed.data.body !== undefined) {
    if (!isAuthor) return apiError("Only the comment author can edit the body.", 403);
    updatePayload.body = parsed.data.body;
  }
  if (parsed.data.resolved !== undefined) {
    // Authors can resolve their own comments; admins/owners can resolve any
    if (!isAuthor) {
      const { data: program } = await service
        .from("programs")
        .select("workspace_id")
        .eq("id", params.id)
        .maybeSingle();
      const programRow = program as { workspace_id: string } | null;
      if (!programRow) return apiError("Program not found", 404);

      const { data: membership } = await service
        .from("workspace_memberships")
        .select("role")
        .eq("workspace_id", programRow.workspace_id)
        .eq("user_id", user.id)
        .maybeSingle();
      const membershipRow = membership as { role: string } | null;
      if (!membershipRow || !["owner", "admin"].includes(membershipRow.role)) {
        return apiError("Only the author or an admin can resolve comments.", 403);
      }
    }
    updatePayload.resolved = parsed.data.resolved;
  }

  if (Object.keys(updatePayload).length === 0) return apiError("Nothing to update.", 400);

  const { data: updated, error } = await service
    .from("program_comments")
    .update(updatePayload)
    .eq("id", parsed.data.comment_id)
    .select("id, program_id, node_id, user_id, body, resolved, created_at")
    .single();

  if (error) return apiError(error.message, 500);

  return NextResponse.json({ comment: updated });
}
