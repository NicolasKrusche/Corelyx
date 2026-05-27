import { NextResponse } from "next/server";
import { z } from "zod";
import { createServerClient } from "@/lib/supabase/server";
import { apiError } from "@/lib/api";
import { checkConflictDetectionAccess } from "@/lib/limits";
import { canEdit, canView, getProgramAccess } from "@/lib/workspaces";
import { isAdminEmail } from "@/lib/admin";

const UpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  description: z.string().max(500).nullable().optional(),
  execution_mode: z.enum(["autonomous", "supervised", "manual"]).optional(),
  conflict_policy: z.enum(["queue", "skip", "fail"]).optional(),
  ai_use_case_category: z.string().max(160).nullable().optional(),
  ai_act_risk_level: z.enum([
    "prohibited",
    "high_risk",
    "transparency",
    "gpai_related",
    "limited_or_minimal",
    "unknown",
  ]).optional(),
  customer_role: z.enum([
    "provider",
    "deployer",
    "distributor",
    "importer",
    "product_manufacturer",
    "unknown",
  ]).optional(),
  human_oversight_required: z.boolean().optional(),
  transparency_notice_required: z.boolean().optional(),
  high_risk_documentation_required: z.boolean().optional(),
  prohibited_reason: z.string().max(2000).nullable().optional(),
  reviewer: z.string().max(160).nullable().optional(),
  reviewed_at: z.string().datetime().nullable().optional(),
  ai_act_notes: z.string().max(5000).nullable().optional(),
  legal_review_override: z.boolean().optional(),
});

// PATCH /api/programs/[id]/settings
export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const { id } = await params;

  const access = await getProgramAccess(id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);
  if (!canEdit(access)) return apiError("You do not have permission to edit this program.", 403);

  const body = await request.json().catch(() => null);
  const parsed = UpdateSchema.safeParse(body);
  if (!parsed.success) return apiError(parsed.error.message, 400);

  if (parsed.data.conflict_policy && parsed.data.conflict_policy !== "queue") {
    const conflictCheck = await checkConflictDetectionAccess(user.id, access!.workspaceId);
    if (!conflictCheck.allowed) {
      return NextResponse.json(
        { error: "FEATURE_NOT_AVAILABLE", message: conflictCheck.upgradeMessage },
        { status: 403 }
      );
    }
  }

  if (parsed.data.legal_review_override === true && !isAdminEmail(user.email ?? undefined)) {
    return apiError("Only administrators can enable legal-review override for prohibited-risk workflows.", 403);
  }

  const aiPatchKeys = [
    "ai_use_case_category",
    "ai_act_risk_level",
    "customer_role",
    "human_oversight_required",
    "transparency_notice_required",
    "high_risk_documentation_required",
    "prohibited_reason",
    "reviewer",
    "reviewed_at",
    "ai_act_notes",
    "legal_review_override",
  ] as const;
  const hasAiPatch = aiPatchKeys.some((key) => parsed.data[key] !== undefined);

  let schemaPatch: Record<string, unknown> = {};
  if (hasAiPatch) {
    const { data: current } = await supabase
      .from("programs")
      .select("schema")
      .eq("id", id)
      .single();
    const currentSchema =
      current && typeof (current as { schema?: unknown }).schema === "object" && !Array.isArray((current as { schema?: unknown }).schema)
        ? ((current as { schema: Record<string, unknown> }).schema)
        : null;
    if (currentSchema) {
      const metadata =
        currentSchema.metadata && typeof currentSchema.metadata === "object" && !Array.isArray(currentSchema.metadata)
          ? (currentSchema.metadata as Record<string, unknown>)
          : {};
      const nextMetadata = { ...metadata };
      for (const key of aiPatchKeys) {
        if (parsed.data[key] !== undefined) nextMetadata[key] = parsed.data[key];
      }
      schemaPatch = { schema: { ...currentSchema, metadata: nextMetadata } };
    }
  }

  const { error } = await supabase
    .from("programs")
    .update({ ...parsed.data, ...schemaPatch, updated_at: new Date().toISOString() } as never)
    .eq("id", id);

  if (error) return apiError(error.message, 500);
  return NextResponse.json({ ok: true });
}
