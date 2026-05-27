import { NextResponse } from "next/server";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import {
  loadWorkflowProviderContext,
  loadWorkspaceComplianceSettings,
} from "@/lib/compliance/server";
import {
  generateComplianceExportReport,
  renderComplianceReportHtml,
} from "@/lib/compliance/workflow";
import { canView, getProgramAccess } from "@/lib/workspaces";

export async function GET(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);

  const db = createServiceClient();
  const { data, error } = await db
    .from("programs")
    .select("id, name, schema, schema_version, workspace_id, ai_use_case_category, ai_act_risk_level, customer_role, human_oversight_required, transparency_notice_required, high_risk_documentation_required, prohibited_reason, reviewer, reviewed_at, ai_act_notes, legal_review_override")
    .eq("id", params.id)
    .single();

  if (error || !data) return apiError("Program not found", 404);

  const program = data as unknown as {
    id: string;
    name: string;
    schema: unknown;
    schema_version: number | null;
    workspace_id: string;
    ai_use_case_category: string | null;
    ai_act_risk_level: "prohibited" | "high_risk" | "transparency" | "gpai_related" | "limited_or_minimal" | "unknown";
    customer_role: "provider" | "deployer" | "distributor" | "importer" | "product_manufacturer" | "unknown";
    human_oversight_required: boolean;
    transparency_notice_required: boolean;
    high_risk_documentation_required: boolean;
    prohibited_reason: string | null;
    reviewer: string | null;
    reviewed_at: string | null;
    ai_act_notes: string | null;
    legal_review_override: boolean;
  };

  const parsed = ProgramSchemaZ.safeParse(program.schema);
  if (!parsed.success) {
    return NextResponse.json(
      {
        error: "WORKFLOW_NOT_RUNNABLE",
        message: "Compliance export requires a complete workflow schema.",
        details: parsed.error.flatten(),
      },
      { status: 422 }
    );
  }

  const [workspace, context] = await Promise.all([
    loadWorkspaceComplianceSettings(program.workspace_id, db as never),
    loadWorkflowProviderContext(params.id, program.workspace_id, db as never),
  ]);

  const report = generateComplianceExportReport({
    schema: parsed.data as unknown as ProgramSchema,
    workspace,
    context,
    program,
  });

  const format = new URL(request.url).searchParams.get("format") ?? "json";
  const filenameBase = `corelyx-compliance-${params.id}`;

  if (format === "html") {
    return new NextResponse(renderComplianceReportHtml(report), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}.html"`,
      },
    });
  }

  return new NextResponse(JSON.stringify(report, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameBase}.json"`,
    },
  });
}
