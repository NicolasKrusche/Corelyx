import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { loadGovernanceInventory } from "@/lib/compliance/governance-server";
import { generateInventoryMarkdown } from "@/lib/compliance/governance";
import {
  recordsToCsv,
  recordsToExcelXml,
  textToPdfBuffer,
} from "@/lib/compliance/export";

export async function GET(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) return apiError("Workspace not found", 404);

  const db = createServiceClient();
  const bundle = await loadGovernanceInventory(activeWorkspace.workspaceId, db as never);
  const format = new URL(request.url).searchParams.get("format") ?? "json";
  const filenameBase = `corelyx-ai-inventory-${activeWorkspace.workspaceId.slice(0, 8)}`;

  if (format === "csv") {
    return new NextResponse(recordsToCsv(bundle.records), {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}.csv"`,
      },
    });
  }

  if (format === "xlsx" || format === "xls" || format === "excel") {
    return new NextResponse(recordsToExcelXml(bundle.records), {
      headers: {
        "Content-Type": "application/vnd.ms-excel; charset=utf-8",
        "Content-Disposition": `attachment; filename="${filenameBase}.xls"`,
      },
    });
  }

  if (format === "pdf") {
    const buffer = textToPdfBuffer("Corelyx AI Inventory", generateInventoryMarkdown(bundle.records));
    return new NextResponse(buffer, {
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `attachment; filename="${filenameBase}.pdf"`,
      },
    });
  }

  return new NextResponse(JSON.stringify(bundle, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": `attachment; filename="${filenameBase}.json"`,
    },
  });
}

