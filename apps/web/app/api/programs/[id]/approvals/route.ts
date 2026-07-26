import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser, type LooseServiceClient } from "@/lib/api";
import { canView, getProgramAccess } from "@/lib/workspaces";

type ApprovalRow = {
  id: string;
  program_id: string;
  reviewer_id: string;
  status: string;
  note: string | null;
  created_at: string;
  decided_at: string | null;
};

// ── GET /api/programs/[id]/approvals ─────────────────────────────────────────
// Returns all approvals for a program (for the review history).

export async function GET(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);

  const service = createServiceClient() as LooseServiceClient;
  const { data: approvals, error } = await service
    .from("program_approvals")
    .select("id, program_id, reviewer_id, status, note, created_at, decided_at")
    .eq("program_id", params.id)
    .order("created_at", { ascending: false });

  if (error) return apiError(error.message, 500);

  // Fetch reviewer profiles
  const reviewerIds = [...new Set((approvals ?? []).map((a: ApprovalRow) => a.reviewer_id))];
  const { data: profiles } =
    reviewerIds.length > 0
      ? await service
          .from("profiles")
          .select("id, display_name, avatar_url")
          .in("id", reviewerIds)
      : { data: [] };

  const profileById = new Map(
    ((profiles ?? []) as Array<{ id: string; display_name: string | null; avatar_url: string | null }>).map(
      (p) => [p.id, p]
    )
  );

  return NextResponse.json({
    approvals: (approvals ?? []).map((a: ApprovalRow) => ({
      ...a,
      reviewer_display_name: profileById.get(a.reviewer_id)?.display_name ?? null,
      reviewer_avatar_url: profileById.get(a.reviewer_id)?.avatar_url ?? null,
    })),
  });
}

// ── POST /api/programs/[id]/approvals ────────────────────────────────────────
// Creates a new pending review, or decides on an existing pending review.
//
// Body: { action: "request_review" | "approve" | "request_changes", note?: string, approval_id?: string }
//   - request_review: Creates a new pending approval for the current user.
//   - approve / request_changes: Updates an existing pending approval.
//     If approval_id is omitted, resolves the latest pending approval for this reviewer.

const ApprovalActionSchema = z.object({
  action: z.enum(["request_review", "approve", "request_changes"]),
  note: z.string().max(4000).optional(),
  approval_id: z.string().uuid().optional(),
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

  const parsed = ApprovalActionSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const service = createServiceClient() as LooseServiceClient;
  const now = new Date().toISOString();

  if (parsed.data.action === "request_review") {
    // Create a new pending approval
    const { data: approval, error } = await service
      .from("program_approvals")
      .insert({
        program_id: params.id,
        reviewer_id: user.id,
        status: "pending",
        note: parsed.data.note ?? null,
        created_at: now,
      } as never)
      .select("id, program_id, reviewer_id, status, note, created_at, decided_at")
      .single();

    if (error || !approval) return apiError(error?.message ?? "Failed to create review request.", 500);

    // Fetch reviewer profile
    const { data: profile } = await service
      .from("profiles")
      .select("display_name, avatar_url")
      .eq("id", user.id)
      .maybeSingle();

    return NextResponse.json(
      {
        approval: {
          ...(approval as ApprovalRow),
          reviewer_display_name: (profile as { display_name?: string } | null)?.display_name ?? null,
          reviewer_avatar_url: (profile as { avatar_url?: string } | null)?.avatar_url ?? null,
        },
      },
      { status: 201 }
    );
  }

  // approve or request_changes — find the target approval
  let targetApprovalId = parsed.data.approval_id;

  if (!targetApprovalId) {
    // Find the latest pending approval for this reviewer on this program
    const { data: pending } = await service
      .from("program_approvals")
      .select("id")
      .eq("program_id", params.id)
      .eq("reviewer_id", user.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!pending) return apiError("No pending approval found for this reviewer.", 404);
    targetApprovalId = (pending as { id: string }).id;
  }

  const newStatus = parsed.data.action === "approve" ? "approved" : "changes_requested";

  const { data: updated, error } = await service
    .from("program_approvals")
    .update({
      status: newStatus,
      note: parsed.data.note ?? undefined,
      decided_at: now,
    })
    .eq("id", targetApprovalId)
    .eq("reviewer_id", user.id)
    .select("id, program_id, reviewer_id, status, note, created_at, decided_at")
    .single();

  if (error || !updated) return apiError(error?.message ?? "Failed to update approval.", 500);

  // Fetch reviewer profile
  const { data: profile } = await service
    .from("profiles")
    .select("display_name, avatar_url")
    .eq("id", user.id)
    .maybeSingle();

  return NextResponse.json({
    approval: {
      ...(updated as ApprovalRow),
      reviewer_display_name: (profile as { display_name?: string } | null)?.display_name ?? null,
      reviewer_avatar_url: (profile as { avatar_url?: string } | null)?.avatar_url ?? null,
    },
  });
}
