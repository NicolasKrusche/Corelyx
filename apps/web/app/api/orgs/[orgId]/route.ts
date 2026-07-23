import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { writeAppLog } from "@/lib/app-logs";

const UpdateOrgSchema = z.object({
  name: z.string().trim().min(1).max(120),
});

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

type OrgRow = {
  id: string;
  name: string;
  slug: string;
  owner_id: string;
  created_at: string;
  updated_at: string;
};

type MembershipRow = {
  org_id: string;
  user_id: string;
  role: string;
};

async function getMembership(
  service: LooseServiceClient,
  orgId: string,
  userId: string
): Promise<MembershipRow | null> {
  const { data } = await service
    .from("org_memberships")
    .select("org_id, user_id, role")
    .eq("org_id", orgId)
    .eq("user_id", userId)
    .maybeSingle();

  return (data ?? null) as MembershipRow | null;
}

/**
 * GET /api/orgs/[orgId] — Get org details (requires membership).
 */
export async function GET(
  _request: Request,
  { params: routeParams }: { params: Promise<{ orgId: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;

  const membership = await getMembership(service, params.orgId, user.id);
  if (!membership) return apiError("Organization not found.", 404);

  const { data: org, error } = await service
    .from("organizations")
    .select("id, name, slug, owner_id, created_at, updated_at")
    .eq("id", params.orgId)
    .single();

  if (error || !org) return apiError("Organization not found.", 404);

  // Get member count
  const { count } = await service
    .from("org_memberships")
    .select("id", { count: "exact", head: true })
    .eq("org_id", params.orgId);

  return NextResponse.json({
    organization: {
      ...(org as OrgRow),
      role: membership.role,
      member_count: count ?? 1,
    },
  });
}

/**
 * PATCH /api/orgs/[orgId] — Update org name (owner/admin only).
 */
export async function PATCH(
  request: Request,
  { params: routeParams }: { params: Promise<{ orgId: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;
  const membership = await getMembership(service, params.orgId, user.id);
  if (!membership) return apiError("Organization not found.", 404);
  if (membership.role !== "owner" && membership.role !== "admin") {
    return apiError("Only owners and admins can update organization details.", 403);
  }

  const parsed = UpdateOrgSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const { data, error } = await service
    .from("organizations")
    .update({ name: parsed.data.name } as never)
    .eq("id", params.orgId)
    .select("id, name, slug, owner_id, created_at, updated_at")
    .single();

  if (error || !data) return apiError(error?.message ?? "Organization could not be updated.", 500);

  await writeAppLog(service, {
    userId: user.id,
    level: "info",
    source: "Organization",
    event: "org.renamed",
    status: "completed",
    message: "User renamed an organization.",
    details: { org_id: params.orgId, name: parsed.data.name },
  });

  return NextResponse.json({ organization: data as OrgRow });
}

/**
 * DELETE /api/orgs/[orgId] — Delete org (owner only).
 */
export async function DELETE(
  _request: Request,
  { params: routeParams }: { params: Promise<{ orgId: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;
  const membership = await getMembership(service, params.orgId, user.id);
  if (!membership) return apiError("Organization not found.", 404);
  if (membership.role !== "owner") {
    return apiError("Only the organization owner can delete it.", 403);
  }

  await writeAppLog(service, {
    userId: user.id,
    level: "warning",
    source: "Organization",
    event: "org.deleted",
    status: "completed",
    message: "User deleted an organization.",
    details: { org_id: params.orgId },
  });

  const { error } = await service
    .from("organizations")
    .delete()
    .eq("id", params.orgId);

  if (error) return apiError(error.message, 500);

  return NextResponse.json({ deleted: true });
}
