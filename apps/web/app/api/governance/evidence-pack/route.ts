import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { canManageWorkspace } from "@/lib/workspace-types";
import { buildEvidencePack } from "@/lib/compliance/evidence-pack";

// Buffers + node:crypto (SHA-256 manifest) require the Node runtime, not edge.
export const runtime = "nodejs";

// GET /api/governance/evidence-pack — one-click auditor evidence pack: AI system
// inventory + per-agent action audits + full approval history + an integrity
// manifest, bundled into a single ZIP. Gated to workspace owners/admins because
// it aggregates governance data across every program in the workspace.
export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) return apiError("Workspace not found", 404);
  if (!canManageWorkspace(activeWorkspace.role)) {
    return apiError("Only workspace owners and admins can export the evidence pack.", 403);
  }

  const db = createServiceClient() as Parameters<typeof buildEvidencePack>[0];
  const { filename, buffer } = await buildEvidencePack(db, {
    workspaceId: activeWorkspace.workspaceId,
    exportedBy: user.id,
  });

  // Hand the Response a plain Uint8Array — a Buffer<ArrayBufferLike> is not a
  // valid BodyInit under the current @types/node Buffer generics.
  const body = new Uint8Array(buffer);
  return new NextResponse(body, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${filename}"`,
      "Content-Length": String(body.byteLength),
      "Cache-Control": "no-store",
    },
  });
}
