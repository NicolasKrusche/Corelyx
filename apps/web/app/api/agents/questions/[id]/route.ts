import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { ensureProcessingAllowed } from "@/lib/compliance";

// POST /api/agents/questions/[id] — answer (or decline) a question an agent asked
// mid-run via corelyx.ask_user. Distinct from /api/approvals/[id]: this is NOT
// gated behind Team HITL — asking the human is a core agent capability for all
// agent (Solo+) users. The runtime is waiting on this approval row's status +
// decision_note (the free-text answer).
//
// Body: { answer: string } | { decline: true }
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id: approvalId } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const body = (await request.json().catch(() => ({}))) as { answer?: unknown; decline?: unknown };
  const decline = body.decline === true;
  const answer = typeof body.answer === "string" ? body.answer.trim() : "";
  if (!decline && !answer) return apiError("answer (string) is required.", 400);

  const service = createServiceClient();

  const { data: approvalRaw, error: fetchError } = await service
    .from("approvals")
    .select("id, user_id, status, context")
    .eq("id", approvalId)
    .single();
  if (fetchError || !approvalRaw) return apiError("Question not found", 404);

  const approval = approvalRaw as unknown as {
    id: string;
    user_id: string;
    status: string;
    context: Record<string, unknown> | null;
  };

  if (approval.user_id !== user.id) return apiError("Unauthorized", 403);
  if (approval.context?.kind !== "question") return apiError("Not an agent question.", 400);
  if (approval.status !== "pending") return apiError("This question has already been answered.", 409);

  // Answering resumes account-affecting work, so honour processing restrictions.
  const processingRestriction = await ensureProcessingAllowed(user.id, service);
  if (processingRestriction) return processingRestriction;

  const { error: updateError } = await service
    .from("approvals")
    .update({
      status: decline ? "rejected" : "approved",
      decision_note: decline ? null : answer.slice(0, 4000),
      decided_at: new Date().toISOString(),
    } as never)
    .eq("id", approvalId);
  if (updateError) return apiError(updateError.message, 500);

  return NextResponse.json({ ok: true, answered: !decline });
}
