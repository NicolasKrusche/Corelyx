import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { canView, getProgramAccess } from "@/lib/workspaces";

/**
 * GET /api/programs/[id]/conflicts
 *
 * Returns a list of other programs that share write-access connections with
 * this program — potential resource conflicts.
 */
export async function GET(
  _request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);

  const serviceClient = createServiceClient();
  const { data: program, error: progError } = await serviceClient
    .from("programs")
    .select("id, conflict_policy")
    .eq("id", params.id)
    .single();
  if (progError || !program) return apiError("Program not found", 404);

  // Get connections linked to this program
  const { data: myConns } = await serviceClient
    .from("program_connections")
    .select("connection_id")
    .eq("program_id", params.id);

  if (!myConns || myConns.length === 0) {
    return NextResponse.json({ conflicts: [], conflict_policy: (program as { conflict_policy: string }).conflict_policy });
  }

  const myConnectionIds = (myConns as { connection_id: string }[]).map(
    (r) => r.connection_id
  );

  // Find other programs that share any of these connections
  const { data: sharedLinks } = await serviceClient
    .from("program_connections")
    .select("program_id, connection_id")
    .in("connection_id", myConnectionIds)
    .neq("program_id", params.id);

  if (!sharedLinks || sharedLinks.length === 0) {
    return NextResponse.json({ conflicts: [], conflict_policy: (program as { conflict_policy: string }).conflict_policy });
  }

  type SharedLink = { program_id: string; connection_id: string };
  const conflictingProgramIds = [
    ...new Set((sharedLinks as unknown as SharedLink[]).map((r) => r.program_id)),
  ];

  // Fetch those programs in the same workspace.
  const { data: conflictingPrograms } = await serviceClient
    .from("programs")
    .select("id, name, is_active, execution_mode")
    .in("id", conflictingProgramIds)
    .eq("workspace_id", access!.workspaceId);

  // Build conflict map: program → shared connection names
  const { data: connNames } = await serviceClient
    .from("connections")
    .select("id, name, provider")
    .in("id", myConnectionIds);

  type ConnRow = { id: string; name: string; provider: string };
  const connMap = Object.fromEntries(
    ((connNames ?? []) as unknown as ConnRow[]).map((c) => [c.id, c])
  );

  type ConflictProg = { id: string; name: string; is_active: boolean; execution_mode: string };
  const conflicts = ((conflictingPrograms ?? []) as unknown as ConflictProg[]).map((prog) => {
    const sharedConn = (sharedLinks as unknown as SharedLink[])
      .filter((s) => s.program_id === prog.id)
      .map((s) => connMap[s.connection_id])
      .filter(Boolean);
    return {
      program: prog,
      shared_connections: sharedConn,
    };
  });

  return NextResponse.json({
    conflicts,
    conflict_policy: (program as { conflict_policy: string }).conflict_policy,
  });
}
