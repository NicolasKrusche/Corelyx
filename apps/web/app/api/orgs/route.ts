import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { writeAppLog } from "@/lib/app-logs";

const CreateOrgSchema = z.object({
  name: z.string().trim().min(1).max(120),
  slug: z
    .string()
    .trim()
    .min(1)
    .max(60)
    .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Slug must be lowercase alphanumeric with hyphens"),
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

/**
 * GET /api/orgs — List organizations the current user belongs to.
 */
export async function GET() {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;

  // Find all orgs the user is a member of
  const { data: memberships, error: membershipError } = await service
    .from("org_memberships")
    .select("org_id, user_id, role")
    .eq("user_id", user.id);

  if (membershipError) return apiError(membershipError.message, 500);

  const rows = (memberships ?? []) as MembershipRow[];
  if (rows.length === 0) {
    return NextResponse.json({ organizations: [] });
  }

  const orgIds = rows.map((r) => r.org_id);
  const { data: orgs, error: orgError } = await service
    .from("organizations")
    .select("id, name, slug, owner_id, created_at, updated_at")
    .in("id", orgIds)
    .order("created_at", { ascending: true });

  if (orgError) return apiError(orgError.message, 500);

  // Get member counts per org
  const { data: counts } = await service
    .from("org_memberships")
    .select("org_id")
    .in("org_id", orgIds);

  const memberCounts = new Map<string, number>();
  for (const row of (counts ?? []) as Array<{ org_id: string }>) {
    memberCounts.set(row.org_id, (memberCounts.get(row.org_id) ?? 0) + 1);
  }

  const roleByOrg = new Map(rows.map((r) => [r.org_id, r.role]));

  return NextResponse.json({
    organizations: ((orgs ?? []) as OrgRow[]).map((org) => ({
      ...org,
      role: roleByOrg.get(org.id) ?? "viewer",
      member_count: memberCounts.get(org.id) ?? 1,
    })),
  });
}

/**
 * POST /api/orgs — Create a new organization with the creator as owner.
 */
export async function POST(request: Request) {
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const parsed = CreateOrgSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError(parsed.error.message, 400);

  const service = createServiceClient() as LooseServiceClient;

  // Check slug uniqueness
  const { data: existing } = await service
    .from("organizations")
    .select("id")
    .eq("slug", parsed.data.slug)
    .maybeSingle();

  if (existing) {
    return apiError("An organization with this slug already exists.", 409);
  }

  // Create the organization
  const { data: org, error: orgError } = await service
    .from("organizations")
    .insert({
      name: parsed.data.name,
      slug: parsed.data.slug,
      owner_id: user.id,
    } as never)
    .select("id, name, slug, owner_id, created_at, updated_at")
    .single();

  if (orgError || !org) return apiError(orgError?.message ?? "Organization could not be created.", 500);

  const row = org as OrgRow;

  // Add creator as owner member
  const { error: memberError } = await service
    .from("org_memberships")
    .insert({
      org_id: row.id,
      user_id: user.id,
      role: "owner",
      invited_by: user.id,
      accepted_at: new Date().toISOString(),
    } as never);

  if (memberError) return apiError(memberError.message, 500);

  // Set as active org in profile
  await service
    .from("profiles")
    .update({ org_id: row.id, updated_at: new Date().toISOString() } as never)
    .eq("id", user.id);

  await writeAppLog(service, {
    userId: user.id,
    level: "info",
    source: "Organization",
    event: "org.created",
    status: "completed",
    message: "User created an organization.",
    details: { org_id: row.id, name: row.name, slug: row.slug },
  });

  return NextResponse.json(
    { organization: { ...row, role: "owner", member_count: 1 } },
    { status: 201 }
  );
}
