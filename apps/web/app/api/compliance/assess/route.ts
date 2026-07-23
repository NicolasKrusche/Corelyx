import { NextResponse, type NextRequest } from "next/server";
import { ProgramSchemaZ } from "@flowos/schema";
import { createServiceClient } from "@/lib/api";
import { getRequestUser } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces";
import { classifyRisk } from "@/lib/compliance/risk-classifier";

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

/**
 * POST /api/compliance/assess
 *
 * Body: { program_id: string }  — assess a single program
 * Body: { action: "list_programs" } — list programs in workspace (for the dashboard)
 */
export async function POST(req: NextRequest) {
  try {
    const user = await getRequestUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await getActiveWorkspace(user.id);
    if (!workspace) {
      return NextResponse.json({ error: "No workspace" }, { status: 404 });
    }

    const body = await req.json();
    const db = createServiceClient() as LooseServiceClient;

    // ── List programs (for dashboard) ──────────────────────────────────────
    if (body.action === "list_programs") {
      const { data, error } = await db
        .from("programs")
        .select(
          "id, name, is_active, updated_at, ai_use_case_category, ai_act_risk_level, human_oversight_required, transparency_notice_required, high_risk_documentation_required"
        )
        .eq("workspace_id", workspace.workspaceId)
        .order("updated_at", { ascending: false });

      if (error) {
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      return NextResponse.json({ programs: data ?? [] });
    }

    // ── Assess a single program ────────────────────────────────────────────
    const programId = body.program_id;
    if (!programId || typeof programId !== "string") {
      return NextResponse.json({ error: "program_id is required" }, { status: 400 });
    }

    // Fetch program with schema
    const { data: program, error: fetchError } = await db
      .from("programs")
      .select("id, workspace_id, schema")
      .eq("id", programId)
      .eq("workspace_id", workspace.workspaceId)
      .single();

    if (fetchError || !program) {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }

    // Validate schema
    const parsed = ProgramSchemaZ.safeParse(program.schema);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Program schema is invalid — complete the workflow before assessing." },
        { status: 422 }
      );
    }

    // Classify risk
    const assessment = classifyRisk(parsed.data);

    // Persist assessment
    await db.from("compliance_assessments").insert({
      program_id: programId,
      risk_level: assessment.level,
      risk_score: assessment.score,
      factors: assessment.factors,
      assessed_at: assessment.assessedAt,
    } as never);

    return NextResponse.json(assessment);
  } catch (err: any) {
    console.error("[compliance/assess]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
