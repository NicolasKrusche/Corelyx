import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import {
  DpiaDraftMutationSchema,
  DPIA_DRAFT_PAGE_SIZE,
  getDpiaCompletionBlockers,
  isDpiaDraftStale,
  markDpiaContentCompleted,
  markDpiaContentDraft,
  type DpiaDraftRecord,
} from "@/lib/compliance/dpia-drafts";
import {
  generateProgramDpia,
  ProgramDpiaSourceError,
} from "@/lib/compliance/dpia-server";
import { canEdit, canView, getProgramAccess } from "@/lib/workspaces";

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(id, user.id);
  if (!canView(access)) return apiError("Workflow not found", 404);

  const requestedOffset = Number(new URL(request.url).searchParams.get("offset") ?? "0");
  const offset = Number.isSafeInteger(requestedOffset) && requestedOffset >= 0
    ? Math.min(requestedOffset, 100_000)
    : 0;
  const db = createServiceClient();
  const { data, error, count } = await db
    .from("program_dpia_drafts")
    .select(
      "id, program_id, created_by, source_kind, review_status, reviewed_by, reviewed_at, content, source_schema_version, source_program_updated_at, created_at",
      { count: "exact" }
    )
    .eq("program_id", id)
    .order("created_at", { ascending: false })
    .range(offset, offset + DPIA_DRAFT_PAGE_SIZE - 1);

  if (error) return apiError(error.message, 500);
  return NextResponse.json({
    drafts: (data ?? []) as DpiaDraftRecord[],
    total: count ?? 0,
  });
}

export async function POST(request: Request, { params }: RouteContext) {
  const { id } = await params;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(id, user.id);
  if (!canView(access)) return apiError("Workflow not found", 404);
  if (!canEdit(access)) {
    return apiError("You do not have permission to change this workflow's DPIA drafts.", 403);
  }

  const body = await request.json().catch(() => null);
  const parsed = DpiaDraftMutationSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json(
      { error: "Invalid DPIA draft request", details: parsed.error.flatten() },
      { status: 400 }
    );
  }

  const db = createServiceClient();
  let insert: {
    program_id: string;
    created_by: string;
    source_kind: "generated" | "edited" | "status_change";
    review_status: "draft" | "completed";
    reviewed_by: string | null;
    reviewed_at: string | null;
    content: string;
    source_schema_version: number | null;
    source_program_updated_at: string | null;
    source_snapshot: Record<string, unknown>;
  };

  if (parsed.data.action === "generate") {
    try {
      const generated = await generateProgramDpia(id, db as never);
      insert = {
        program_id: id,
        created_by: user.id,
        source_kind: "generated",
        review_status: "draft",
        reviewed_by: null,
        reviewed_at: null,
        content: generated.content,
        source_schema_version: generated.program.schemaVersion,
        source_program_updated_at: generated.program.updatedAt,
        source_snapshot: { input: generated.input },
      };
    } catch (error) {
      if (error instanceof ProgramDpiaSourceError) {
        return apiError(
          error.message,
          error.code === "PROGRAM_NOT_FOUND" ? 404 : 422,
          error.code
        );
      }
      throw error;
    }
  } else {
    const { data: baseDraft } = await db
      .from("program_dpia_drafts")
      .select(
        "id, content, review_status, source_schema_version, source_program_updated_at"
      )
      .eq("id", parsed.data.basedOnDraftId)
      .eq("program_id", id)
      .maybeSingle();
    if (!baseDraft) {
      return apiError("The DPIA draft revision no longer exists.", 404);
    }

    const source = baseDraft as {
      content: string;
      review_status: "draft" | "completed";
      source_schema_version: number | null;
      source_program_updated_at: string | null;
    };
    if (parsed.data.action === "save") {
      insert = {
        program_id: id,
        created_by: user.id,
        source_kind: "edited",
        review_status: "draft",
        reviewed_by: null,
        reviewed_at: null,
        content: markDpiaContentDraft(parsed.data.content),
        source_schema_version: source.source_schema_version,
        source_program_updated_at: source.source_program_updated_at,
        source_snapshot: { based_on_draft_id: parsed.data.basedOnDraftId },
      };
    } else {
      const nextStatus = parsed.data.action === "complete" ? "completed" : "draft";
      const [{ data: latestDraft }, { data: program }] = await Promise.all([
        db
          .from("program_dpia_drafts")
          .select("id")
          .eq("program_id", id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle(),
        db
          .from("programs")
          .select("schema_version, updated_at")
          .eq("id", id)
          .single(),
      ]);
      const latest = latestDraft as { id: string } | null;
      const currentProgram = program as {
        schema_version: number | null;
        updated_at: string | null;
      } | null;
      if (!latest || latest.id !== parsed.data.basedOnDraftId) {
        return apiError("Only the latest DPIA revision can change review status.", 409);
      }
      if (
        nextStatus === "completed" &&
        (!currentProgram ||
          isDpiaDraftStale(source, {
            schemaVersion: currentProgram.schema_version,
            updatedAt: currentProgram.updated_at,
          }))
      ) {
        return apiError(
          "The workflow changed after this draft was generated. Regenerate it before marking the review completed.",
          409,
          "DPIA_DRAFT_STALE"
        );
      }
      if (source.review_status === nextStatus) {
        return apiError(
          nextStatus === "completed"
            ? "This DPIA revision is already marked completed."
            : "This DPIA revision is already open for review.",
          409
        );
      }
      const reviewedAt = nextStatus === "completed" ? new Date().toISOString() : null;
      if (nextStatus === "completed") {
        const blockers = getDpiaCompletionBlockers(source.content);
        if (blockers.length > 0) {
          return apiError(blockers.join(" "), 409, "DPIA_REVIEW_INCOMPLETE");
        }
      }
      insert = {
        program_id: id,
        created_by: user.id,
        source_kind: "status_change",
        review_status: nextStatus,
        reviewed_by: nextStatus === "completed" ? user.id : null,
        reviewed_at: reviewedAt,
        content:
          nextStatus === "completed"
            ? markDpiaContentCompleted(source.content, reviewedAt!)
            : markDpiaContentDraft(source.content),
        source_schema_version: source.source_schema_version,
        source_program_updated_at: source.source_program_updated_at,
        source_snapshot: {
          based_on_draft_id: parsed.data.basedOnDraftId,
          status_change: parsed.data.action,
        },
      };
    }
  }

  const { data, error } = await db
    .from("program_dpia_drafts")
    .insert(insert as never)
    .select(
      "id, program_id, created_by, source_kind, review_status, reviewed_by, reviewed_at, content, source_schema_version, source_program_updated_at, created_at"
    )
    .single();

  if (error || !data) return apiError(error?.message ?? "Could not save DPIA draft.", 500);
  return NextResponse.json({ draft: data as DpiaDraftRecord }, { status: 201 });
}
