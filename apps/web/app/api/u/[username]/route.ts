import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import { deriveNodeSummary, getBrowseUseCount } from "@/lib/browse-programs";

const EARLY_ADOPTER_CUTOFF = "2026-01-01T00:00:00Z";

type ProfileRow = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  is_admin: boolean;
  is_expert: boolean;
  is_beta_tester: boolean;
  created_at: string;
};

type ProgramRow = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  fork_count: number;
  published_at: string | null;
  public_author_name: string | null;
  schema: unknown;
  schema_version: number;
};

export type PublicProfileProgram = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  fork_count: number;
  published_at: string | null;
  public_author_name: string | null;
  schema_version: number;
  node_summary: ReturnType<typeof deriveNodeSummary>;
};

export type PublicProfileBadge = "corelyx_team" | "expert" | "early_adopter" | "beta_tester";

export type PublicProfileResponse = {
  id: string;
  username: string;
  display_name: string | null;
  avatar_url: string | null;
  bio: string | null;
  badges: PublicProfileBadge[];
  member_since: string;
  skill_xp: number;
  programs: PublicProfileProgram[];
  stats: { programs: number; runs: number };
};

// GET /api/u/[username] — public profile, no auth required.
export async function GET(
  _request: Request,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;
  if (!username || typeof username !== "string") return apiError("Not found", 404);

  const service = createServiceClient();

  // Fetch profile by username (case-insensitive)
  const { data: profileRaw, error: profileError } = await (service as unknown as {
    from(t: string): {
      select(c: string): {
        ilike(col: string, val: string): {
          single(): Promise<{ data: ProfileRow | null; error: { message: string } | null }>;
        };
      };
    };
  })
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio, is_admin, is_expert, is_beta_tester, created_at")
    .ilike("username", username)
    .single();

  if (profileError || !profileRaw) return apiError("Profile not found", 404);
  const profile = profileRaw as ProfileRow;

  // Fetch public programs by this user
  const { data: programsRaw } = await (service as unknown as {
    from(t: string): {
      select(c: string): {
        eq(col: string, val: string): {
          eq(col2: string, val2: boolean): {
            order(col: string, opts: { ascending: boolean }): {
              limit(n: number): Promise<{ data: ProgramRow[] | null; error: unknown }>;
            };
          };
        };
      };
    };
  })
    .from("programs")
    .select("id, name, description, tags, fork_count, published_at, public_author_name, schema, schema_version")
    .eq("user_id", profile.id)
    .eq("is_public", true)
    .order("published_at", { ascending: false })
    .limit(24);

  const programs: PublicProfileProgram[] = ((programsRaw ?? []) as ProgramRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    tags: p.tags ?? [],
    fork_count: getBrowseUseCount(p),
    published_at: p.published_at,
    public_author_name: p.public_author_name,
    schema_version: p.schema_version,
    node_summary: deriveNodeSummary(p.schema),
  }));

  // Fetch run count and connection count for XP
  const [{ count: runCount }, { count: connectionCount }] = await Promise.all([
    (service as unknown as {
      from(t: string): { select(c: string, o: { count: string; head: boolean }): { eq(col: string, val: string): Promise<{ count: number | null }> } };
    }).from("runs").select("id", { count: "exact", head: true }).eq("user_id", profile.id),
    (service as unknown as {
      from(t: string): { select(c: string, o: { count: string; head: boolean }): { eq(col: string, val: string): Promise<{ count: number | null }> } };
    }).from("connections").select("id", { count: "exact", head: true }).eq("user_id", profile.id),
  ]);

  const skillXp =
    (runCount ?? 0) * 5 +
    programs.length * 50 +
    (connectionCount ?? 0) * 25;

  // Derive badges
  const badges: PublicProfileBadge[] = [];
  if (profile.is_admin) badges.push("corelyx_team");
  if (profile.is_expert) badges.push("expert");
  if (new Date(profile.created_at) < new Date(EARLY_ADOPTER_CUTOFF)) badges.push("early_adopter");
  if (profile.is_beta_tester) badges.push("beta_tester");

  const result: PublicProfileResponse = {
    id: profile.id,
    username: profile.username,
    display_name: profile.display_name,
    avatar_url: profile.avatar_url,
    bio: profile.bio,
    badges,
    member_since: profile.created_at,
    skill_xp: skillXp,
    programs,
    stats: { programs: programs.length, runs: runCount ?? 0 },
  };

  return NextResponse.json(result);
}
