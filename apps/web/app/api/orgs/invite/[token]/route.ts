import { NextResponse } from "next/server";
import { apiError, createServiceClient, getAuthUser } from "@/lib/api";
import { writeAppLog } from "@/lib/app-logs";

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

type InviteRow = {
  id: string;
  org_id: string;
  email: string;
  role: string;
  token: string;
  expires_at: string;
  created_at: string;
  accepted_at: string | null;
};

type OrgRow = {
  id: string;
  name: string;
  slug: string;
};

/**
 * GET /api/orgs/invite/[token] — Fetch invite details (for the accept page UI).
 * Returns org name, invite email, role, and expiry. Does not require auth
 * because the invite page may be visited before the user is fully loaded.
 */
export async function GET(
  _request: Request,
  { params: routeParams }: { params: Promise<{ token: string }> }
) {
  const params = await routeParams;
  const service = createServiceClient() as LooseServiceClient;

  const { data: invite, error: inviteError } = await service
    .from("org_invites")
    .select("id, org_id, email, role, token, expires_at, created_at, accepted_at")
    .eq("token", params.token)
    .maybeSingle();

  if (inviteError) return apiError(inviteError.message, 500);
  if (!invite) return apiError("Invalid invitation.", 404);

  const row = invite as InviteRow;

  if (row.accepted_at) {
    return apiError("This invitation has already been accepted.", 410);
  }

  if (new Date(row.expires_at) < new Date()) {
    return apiError("This invitation has expired.", 410);
  }

  // Fetch org name
  const { data: org } = await service
    .from("organizations")
    .select("id, name, slug")
    .eq("id", row.org_id)
    .maybeSingle();

  return NextResponse.json({
    invite: {
      org_id: row.org_id,
      org_name: (org as OrgRow | null)?.name ?? null,
      email: row.email,
      role: row.role,
      expires_at: row.expires_at,
    },
  });
}

/**
 * POST /api/orgs/invite/[token] — Accept an org invite using a token.
 * Creates an org_memberships record and marks the invite as accepted.
 */
export async function POST(
  _request: Request,
  { params: routeParams }: { params: Promise<{ token: string }> }
) {
  const params = await routeParams;
  const user = await getAuthUser();
  if (!user) return apiError("Unauthorized", 401);

  const service = createServiceClient() as LooseServiceClient;

  // Look up the invite by token
  const { data: invite, error: inviteError } = await service
    .from("org_invites")
    .select("id, org_id, email, role, token, expires_at, created_at, accepted_at")
    .eq("token", params.token)
    .maybeSingle();

  if (inviteError) return apiError(inviteError.message, 500);
  if (!invite) return apiError("Invalid or expired invitation.", 404);

  const row = invite as InviteRow;

  if (row.accepted_at) {
    return apiError("This invitation has already been accepted.", 409);
  }

  if (new Date(row.expires_at) < new Date()) {
    return apiError("This invitation has expired.", 410);
  }

  // Verify the invitee email matches the current user
  const normalizedEmail = row.email.trim().toLowerCase();
  const userEmail = user.email?.trim().toLowerCase();
  if (normalizedEmail !== userEmail) {
    return apiError(
      "This invitation was sent to a different email address.",
      403
    );
  }

  // Check if already a member
  const { data: existingMembership } = await service
    .from("org_memberships")
    .select("id")
    .eq("org_id", row.org_id)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingMembership) {
    // Already a member — just mark the invite as accepted
    await service
      .from("org_invites")
      .update({ accepted_at: new Date().toISOString() } as never)
      .eq("id", row.id);

    return NextResponse.json({ message: "You are already a member of this organization." });
  }

  // Create membership
  const { error: membershipError } = await service
    .from("org_memberships")
    .insert({
      org_id: row.org_id,
      user_id: user.id,
      role: row.role,
      invited_at: row.created_at,
      accepted_at: new Date().toISOString(),
    } as never);

  if (membershipError) return apiError(membershipError.message, 500);

  // Mark invite as accepted
  await service
    .from("org_invites")
    .update({ accepted_at: new Date().toISOString() } as never)
    .eq("id", row.id);

  // Set as active org if user has no org set yet
  await service
    .from("profiles")
    .update({ org_id: row.org_id, updated_at: new Date().toISOString() } as never)
    .eq("id", user.id)
    .is("org_id", null);

  await writeAppLog(service, {
    userId: user.id,
    level: "info",
    source: "Organization",
    event: "org.invite.accepted",
    status: "completed",
    message: "User accepted an organization invitation.",
    details: { org_id: row.org_id, role: row.role },
  });

  return NextResponse.json({
    message: "You have joined the organization.",
    org_id: row.org_id,
    role: row.role,
  });
}
