import { NextResponse } from "next/server";
import { apiError, getAuthUser } from "@/lib/api";
import { ensureUserProvisioned } from "@/lib/auth/provisioning";

export async function POST() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  try {
    const provisioned = await ensureUserProvisioned(user);
    return NextResponse.json({ ok: true, active_workspace_id: provisioned.workspaceId });
  } catch {
    return apiError("Could not finish account setup.", 500, "account_setup_failed");
  }
}
