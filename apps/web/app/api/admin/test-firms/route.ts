import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { hasTechnicalAccess } from "@/lib/admin-auth";
import { getActiveWorkspace } from "@/lib/workspaces";

// Admin-only registry of test firms (workspaces a firm granted us for inbox
// testing). Designation is explicit here — never inferred from a connector,
// since any regular user can connect Thunderbird/IMAP.

type Svc = ReturnType<typeof createServiceClient> & { from(t: string): any };

async function requireTech() {
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user || !(await hasTechnicalAccess(user.id, user.email))) return null;
  return user;
}

const AddSchema = z
  .object({
    workspace_id: z.string().uuid().optional(),
    email: z.string().email().optional(),
    label: z.string().trim().max(200).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .refine((d) => d.workspace_id || d.email, { message: "Provide a workspace_id or an email." });

/** Resolve the target workspace from an explicit id or the firm's account email. */
async function resolveWorkspaceId(
  service: Svc,
  input: { workspace_id?: string; email?: string }
): Promise<{ workspaceId: string } | { error: string }> {
  if (input.workspace_id) {
    const { data } = await service.from("workspaces").select("id").eq("id", input.workspace_id).maybeSingle();
    if (!data) return { error: "No workspace found with that id." };
    return { workspaceId: (data as { id: string }).id };
  }
  const { data: authData, error } = await service.auth.admin.listUsers();
  if (error || !authData) return { error: "Could not look up users." };
  const found = authData.users.find((u) => u.email?.toLowerCase() === input.email!.toLowerCase());
  if (!found) return { error: "No user found with that email." };
  const ws = await getActiveWorkspace(found.id);
  if (!ws) return { error: "That user has no workspace yet." };
  return { workspaceId: ws.workspaceId };
}

// POST /api/admin/test-firms — register a workspace as a test firm.
export async function POST(request: Request) {
  const admin = await requireTech();
  if (!admin) return apiError("Forbidden", 403);

  const parsed = AddSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.issues[0]?.message ?? "Invalid body", 400);

  const service = createServiceClient() as Svc;
  const resolved = await resolveWorkspaceId(service, parsed.data);
  if ("error" in resolved) return apiError(resolved.error, 400);

  const { error } = await service.from("test_firms").upsert(
    {
      workspace_id: resolved.workspaceId,
      label: parsed.data.label || null,
      notes: parsed.data.notes || null,
      created_by: admin.id,
    } as never,
    { onConflict: "workspace_id" }
  );
  if (error) return apiError(error.message, 500);
  return NextResponse.json({ ok: true, workspace_id: resolved.workspaceId });
}

const RemoveSchema = z.object({ workspace_id: z.string().uuid() });

// DELETE /api/admin/test-firms — remove a workspace from the registry.
export async function DELETE(request: Request) {
  const admin = await requireTech();
  if (!admin) return apiError("Forbidden", 403);

  const parsed = RemoveSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("workspace_id (uuid) is required.", 400);

  const service = createServiceClient() as Svc;
  const { error } = await service.from("test_firms").delete().eq("workspace_id", parsed.data.workspace_id);
  if (error) return apiError(error.message, 500);
  return NextResponse.json({ ok: true });
}
