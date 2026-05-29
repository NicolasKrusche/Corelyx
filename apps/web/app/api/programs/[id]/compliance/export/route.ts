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
import {
  buildDpiaInputFromInventory,
  buildInventoryRecordFromProgram,
  generateDpiaDraft,
  generateTechnicalDocumentation,
} from "@/lib/compliance/governance";
import {
  textToDocxBuffer,
  textToPdfBuffer,
} from "@/lib/compliance/export";
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
    .select("id, user_id, name, description, is_active, created_at, updated_at, schema, schema_version, workspace_id, ai_use_case_category, ai_act_risk_level, customer_role, human_oversight_required, transparency_notice_required, high_risk_documentation_required, prohibited_reason, reviewer, reviewed_at, ai_act_notes, legal_review_override")
    .eq("id", params.id)
    .single();

  if (error || !data) return apiError("Program not found", 404);

  const program = data as unknown as {
    id: string;
    user_id: string;
    name: string;
    description: string | null;
    is_active: boolean;
    created_at: string | null;
    updated_at: string | null;
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
  const inventoryRecord = buildInventoryRecordFromProgram({
    program,
    schema: parsed.data as unknown as ProgramSchema,
    flow: report.data_flow,
  });
  const technicalDocument = generateTechnicalDocumentation(inventoryRecord);
  const dpiaDocument = generateDpiaDraft(buildDpiaInputFromInventory(inventoryRecord));

  if (format === "html") {
    return new NextResponse(renderComplianceReportHtml(report), {
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}.html"`,
      },
    });
  }

  if (format === "technical-md" || format === "markdown" || format === "md") {
    return new NextResponse(technicalDocument, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}-technical-documentation.md"`,
      },
    });
  }

  if (format === "technical-pdf" || format === "pdf") {
    return new NextResponse(textToPdfBuffer("Corelyx Technical Documentation", technicalDocument), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filenameBase}-technical-documentation.pdf"`,
      },
    });
  }

  if (format === "technical-docx" || format === "docx") {
    return new NextResponse(textToDocxBuffer("Corelyx Technical Documentation", technicalDocument), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filenameBase}-technical-documentation.docx"`,
      },
    });
  }

  if (format === "dpia-md") {
    return new NextResponse(dpiaDocument, {
      headers: {
        "Content-Type": "text/markdown; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}-dpia-draft.md"`,
      },
    });
  }

  if (format === "dpia-pdf") {
    return new NextResponse(textToPdfBuffer("Corelyx DPIA Draft", dpiaDocument), {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filenameBase}-dpia-draft.pdf"`,
      },
    });
  }

  if (format === "dpia-docx") {
    return new NextResponse(textToDocxBuffer("Corelyx DPIA Draft", dpiaDocument), {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "Content-Disposition": `attachment; filename="${filenameBase}-dpia-draft.docx"`,
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
