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
  buildInventoryRecordFromProgram,
  generateTechnicalDocumentation,
} from "@/lib/compliance/governance";
import {
  textToDocxBuffer,
  textToPdfBuffer,
} from "@/lib/compliance/export";
import { canView, getProgramAccess } from "@/lib/workspaces";

const DPIA_FORMATS = new Set(["dpia-md", "dpia-pdf", "dpia-docx"]);

function savedDpiaResponse({
  draft,
  filenameBase,
  format,
}: {
  draft: {
    id: string;
    content: string;
    review_status: "draft" | "completed";
    reviewed_by: string | null;
    reviewed_at: string | null;
    created_at: string;
  };
  filenameBase: string;
  format: string;
}) {
  const statusLabel = draft.review_status === "completed" ? "Completed" : "Draft";
  const documentKind = draft.review_status === "completed" ? "review-record" : "draft";
  const exportContent = [
    `> **Saved workflow revision:** ${draft.id}`,
    `> **Review status:** ${statusLabel}`,
    `> **Revision created:** ${draft.created_at}`,
    ...(draft.reviewed_at ? [`> **Review recorded:** ${draft.reviewed_at}`] : []),
    ...(draft.reviewed_by ? [`> **Reviewer record ID:** ${draft.reviewed_by}`] : []),
    "",
    draft.content,
  ].join("\n");
  const commonHeaders = {
    "Content-Disposition": `attachment; filename="${filenameBase}-dpia-${documentKind}-${draft.id.slice(0, 8)}.${
      format === "dpia-md" ? "md" : format === "dpia-pdf" ? "pdf" : "docx"
    }"`,
    "X-Corelyx-DPIA-Draft-Id": draft.id,
    "X-Corelyx-DPIA-Review-Status": draft.review_status,
  };

  if (format === "dpia-md") {
    return new NextResponse(exportContent, {
      headers: { ...commonHeaders, "Content-Type": "text/markdown; charset=utf-8" },
    });
  }
  if (format === "dpia-pdf") {
    return new NextResponse(textToPdfBuffer(
      draft.review_status === "completed" ? "Corelyx DPIA Review Record" : "Corelyx DPIA Draft",
      exportContent
    ), {
      headers: { ...commonHeaders, "Content-Type": "application/pdf" },
    });
  }
  return new NextResponse(textToDocxBuffer(
    draft.review_status === "completed" ? "Corelyx DPIA Review Record" : "Corelyx DPIA Draft",
    exportContent
  ), {
    headers: {
      ...commonHeaders,
      "Content-Type": "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    },
  });
}

export async function GET(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const searchParams = new URL(request.url).searchParams;
  const format = searchParams.get("format") ?? "json";
  const filenameBase = `corelyx-compliance-${params.id}`;
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

  // DPIA downloads are intentionally backed by a saved workflow revision.
  // Generating an untracked document here would recreate the previous bug:
  // a user could download a draft that existed nowhere in Governance.
  if (DPIA_FORMATS.has(format)) {
    const requestedDraftId = searchParams.get("draftId");
    const draftResult = requestedDraftId
      ? await db
          .from("program_dpia_drafts")
          .select("id, content, review_status, reviewed_by, reviewed_at, created_at")
          .eq("program_id", params.id)
          .eq("id", requestedDraftId)
          .maybeSingle()
      : await db
          .from("program_dpia_drafts")
          .select("id, content, review_status, reviewed_by, reviewed_at, created_at")
          .eq("program_id", params.id)
          .order("created_at", { ascending: false })
          .limit(1)
          .maybeSingle();

    if (draftResult.error) return apiError(draftResult.error.message, 500);
    if (!draftResult.data) {
      return apiError(
        "No saved DPIA draft exists for this workflow. Generate and save one in Governance first.",
        409,
        "DPIA_DRAFT_NOT_SAVED"
      );
    }

    const draft = draftResult.data as {
      id: string;
      content: string;
      review_status: "draft" | "completed";
      reviewed_by: string | null;
      reviewed_at: string | null;
      created_at: string;
    };
    return savedDpiaResponse({
      draft,
      filenameBase,
      format,
    });
  }

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

  const inventoryRecord = buildInventoryRecordFromProgram({
    program,
    schema: parsed.data as unknown as ProgramSchema,
    flow: report.data_flow,
  });
  const technicalDocument = generateTechnicalDocumentation(inventoryRecord);

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

  return new NextResponse(JSON.stringify(report, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameBase}.json"`,
    },
  });
}
