import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { canEdit, canView, getProgramAccess, getWorkspaceRole } from "@/lib/workspaces";

export async function POST(
  req: NextRequest,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return NextResponse.json({ error: "Not found" }, { status: 404 });
  if (!canEdit(access)) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const { connection_id } = await req.json();
  if (!connection_id) return NextResponse.json({ error: "connection_id required" }, { status: 400 });

  const { data: connection } = await supabase
    .from("connections")
    .select("id, workspace_id")
    .eq("id", connection_id)
    .single();
  if (!connection) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

  // The connection must live in the same workspace as the program.
  if ((connection as { workspace_id: string }).workspace_id !== access!.workspaceId) {
    return NextResponse.json({ error: "Connection not in this workspace" }, { status: 400 });
  }

  // The caller must be a workspace member to read the connection (already true via getProgramAccess).
  const role = await getWorkspaceRole(access!.workspaceId, user.id);
  if (!role) return NextResponse.json({ error: "Connection not found" }, { status: 404 });

  const { error } = await supabase
    .from("program_connections")
    .upsert({ program_id: params.id, connection_id } as never, { onConflict: "program_id,connection_id", ignoreDuplicates: true });

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });

  return NextResponse.json({ ok: true });
}
