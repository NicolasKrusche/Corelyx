import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import {
  auditLogToCsv,
  auditLogToReportText,
  collectRunAuditLog,
} from "@/lib/compliance/audit-log";
import { textToPdfBuffer } from "@/lib/compliance/export";

const MAX_EXPORT_RUNS = 1000;

// GET /api/governance/audit-log/export?format=csv|pdf|json
export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) return apiError("Workspace not found", 404);

  const db = createServiceClient() as ReturnType<typeof createServiceClient> & {
    from(table: string): any;
  };
  const url = new URL(request.url);
  const format = url.searchParams.get("format") ?? "csv";
  const limitParam = Number.parseInt(url.searchParams.get("limit") ?? "", 10);
  const limit = Number.isFinite(limitParam)
    ? Math.min(Math.max(limitParam, 1), MAX_EXPORT_RUNS)
    : 500;

  const bundle = await collectRunAuditLog(db, activeWorkspace.workspaceId, limit);
  const filenameBase = `corelyx-audit-log-${activeWorkspace.workspaceId.slice(0, 8)}-${bundle.generated_at.slice(0, 10)}`;

  if (format === "pdf") {
    const buffer = textToPdfBuffer("Corelyx Workflow Audit Log", auditLogToReportText(bundle));
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
      },
    });
  }

  if (format === "json") {
    return new NextResponse(JSON.stringify(bundle, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}.json"`,
      },
    });
  }

  return new NextResponse(auditLogToCsv(bundle.records), {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
    },
  });
}
