import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { createServiceClient } from "@/lib/api";
import { deriveNodeSummary, getBrowseUseCount } from "@/lib/browse-programs";
import type { NodeSummary } from "@/lib/browse-programs";

// ─── XP level system ──────────────────────────────────────────────────────────

const XP_LEVELS = [
  { min: 0,    title: "Newcomer"  },
  { min: 50,   title: "Explorer"  },
  { min: 200,  title: "Builder"   },
  { min: 500,  title: "Automator" },
  { min: 1000, title: "Pro"       },
  { min: 2500, title: "Expert"    },
  { min: 5000, title: "Master"    },
] as const;

function getLevelInfo(xp: number) {
  let level = XP_LEVELS[0];
  for (const l of XP_LEVELS) {
    if (xp >= l.min) level = l;
  }
  const idx = XP_LEVELS.indexOf(level as typeof XP_LEVELS[number]);
  const next = XP_LEVELS[idx + 1] ?? null;
  const progress = next
    ? Math.min(1, (xp - level.min) / (next.min - level.min))
    : 1;
  return { title: level.title, progress, next: next?.min ?? null };
}

// ─── Badge meta ───────────────────────────────────────────────────────────────

const BADGE_META = {
  corelyx_team: { label: "Corelyx Team",  color: "bg-primary/10 text-primary border-primary/20" },
  expert:       { label: "Expert",        color: "bg-indigo-500/10 text-indigo-700 dark:text-indigo-300 border-indigo-500/20" },
  early_adopter:{ label: "Early Adopter", color: "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/20" },
  beta_tester:  { label: "Beta Tester",   color: "bg-violet-500/10 text-violet-700 dark:text-violet-300 border-violet-500/20" },
} as const;

type BadgeKey = keyof typeof BADGE_META;
const EARLY_ADOPTER_CUTOFF = "2026-01-01T00:00:00Z";

// ─── Types ────────────────────────────────────────────────────────────────────

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

type Program = {
  id: string;
  name: string;
  description: string | null;
  tags: string[];
  fork_count: number;
  published_at: string | null;
  node_summary: NodeSummary;
};

// ─── Metadata ─────────────────────────────────────────────────────────────────

export async function generateMetadata(
  { params }: { params: Promise<{ username: string }> }
): Promise<Metadata> {
  const { username } = await params;
  return {
    title: `@${username} — Corelyx`,
    description: `View ${username}'s public profile and automation programs on Corelyx.`,
  };
}

// ─── Page ─────────────────────────────────────────────────────────────────────

export default async function UserProfilePage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const service = createServiceClient();

  const { data: profileRaw } = await (service as unknown as {
    from(t: string): {
      select(c: string): {
        ilike(col: string, val: string): {
          single(): Promise<{ data: ProfileRow | null; error: unknown }>;
        };
      };
    };
  })
    .from("profiles")
    .select("id, username, display_name, avatar_url, bio, is_admin, is_expert, is_beta_tester, created_at")
    .ilike("username", username)
    .single();

  if (!profileRaw) notFound();
  const profile = profileRaw as ProfileRow;

  const [{ data: programsRaw }, { count: runCount }, { count: connectionCount }] = await Promise.all([
    (service as unknown as {
      from(t: string): {
        select(c: string): {
          eq(c: string, v: string): {
            eq(c2: string, v2: boolean): {
              order(c: string, o: { ascending: boolean }): {
                limit(n: number): Promise<{ data: ProgramRow[] | null }>;
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
      .limit(24),
    (service as unknown as {
      from(t: string): { select(c: string, o: { count: string; head: boolean }): { eq(c: string, v: string): Promise<{ count: number | null }> } };
    }).from("runs").select("id", { count: "exact", head: true }).eq("user_id", profile.id),
    (service as unknown as {
      from(t: string): { select(c: string, o: { count: string; head: boolean }): { eq(c: string, v: string): Promise<{ count: number | null }> } };
    }).from("connections").select("id", { count: "exact", head: true }).eq("user_id", profile.id),
  ]);

  const programs: Program[] = ((programsRaw ?? []) as ProgramRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    tags: p.tags ?? [],
    fork_count: getBrowseUseCount(p),
    published_at: p.published_at,
    node_summary: deriveNodeSummary(p.schema),
  }));

  const skillXp =
    (runCount ?? 0) * 5 +
    programs.length * 50 +
    (connectionCount ?? 0) * 25;
  const { title: levelTitle, progress: levelProgress, next: nextLevelXp } = getLevelInfo(skillXp);

  const badges: BadgeKey[] = [];
  if (profile.is_admin) badges.push("corelyx_team");
  if (profile.is_expert) badges.push("expert");
  if (new Date(profile.created_at) < new Date(EARLY_ADOPTER_CUTOFF)) badges.push("early_adopter");
  if (profile.is_beta_tester) badges.push("beta_tester");

  const displayName = profile.display_name || profile.username;
  const initial = displayName.slice(0, 1).toUpperCase();
  const memberSince = new Date(profile.created_at).toLocaleDateString("en-GB", {
    month: "long", year: "numeric",
  });

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-3xl px-4 py-12 sm:px-6">

        {/* Back link */}
        <a
          href="/browse"
          className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground"
        >
          <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
            <path d="M9 11L5 7l4-4" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          Browse
        </a>

        {/* Profile header */}
        <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
          {/* Avatar */}
          <div className="relative flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-2xl bg-primary text-2xl font-bold text-primary-foreground">
            {initial}
            {profile.avatar_url && (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={profile.avatar_url}
                alt=""
                className="absolute inset-0 h-full w-full object-cover"
              />
            )}
          </div>

          <div className="flex-1 min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-xl font-bold text-foreground">{displayName}</h1>
              {badges.length > 0 && (
                <div className="flex flex-wrap gap-1.5">
                  {badges.map((b) => (
                    <span
                      key={b}
                      className={`rounded-full border px-2.5 py-0.5 text-[11px] font-semibold ${BADGE_META[b].color}`}
                    >
                      {BADGE_META[b].label}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <p className="mt-0.5 text-sm text-muted-foreground">@{profile.username}</p>
            {profile.bio && (
              <p className="mt-2 text-sm text-foreground/80 leading-relaxed max-w-lg">
                {profile.bio}
              </p>
            )}
          </div>
        </div>

        {/* Stats + skill row */}
        <div className="mt-8 grid grid-cols-2 gap-4 sm:grid-cols-3">
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Programs</p>
            <p className="mt-0.5 text-xl font-bold text-foreground">{programs.length}</p>
          </div>
          <div className="rounded-2xl border border-border bg-card px-4 py-3">
            <p className="text-xs text-muted-foreground">Member since</p>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{memberSince}</p>
          </div>
          <div className="col-span-2 sm:col-span-1 rounded-2xl border border-border bg-card px-4 py-3">
            <div className="flex items-center justify-between">
              <p className="text-xs text-muted-foreground">Skill level</p>
              <p className="text-xs font-semibold text-foreground">{skillXp} XP</p>
            </div>
            <p className="mt-0.5 text-sm font-semibold text-foreground">{levelTitle}</p>
            <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-muted">
              <div
                className="h-full rounded-full bg-primary transition-all"
                style={{ width: `${Math.round(levelProgress * 100)}%` }}
              />
            </div>
            {nextLevelXp !== null && (
              <p className="mt-1 text-[10px] text-muted-foreground">{nextLevelXp - skillXp} XP to next level</p>
            )}
          </div>
        </div>

        {/* Programs grid */}
        <div className="mt-10">
          <h2 className="text-sm font-semibold uppercase tracking-widest text-muted-foreground">
            Public programs
          </h2>

          {programs.length === 0 ? (
            <div className="mt-4 rounded-2xl border border-border bg-card p-10 text-center">
              <p className="text-sm text-muted-foreground">No public programs yet.</p>
            </div>
          ) : (
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {programs.map((p) => (
                <a
                  key={p.id}
                  href="/browse"
                  className="flex flex-col gap-2 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-border/60 hover:bg-card/80"
                >
                  <p className="font-semibold text-sm text-foreground line-clamp-1">{p.name}</p>
                  {p.description && (
                    <p className="text-xs text-muted-foreground line-clamp-2 leading-relaxed">
                      {p.description}
                    </p>
                  )}
                  {p.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-auto pt-1">
                      {p.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="rounded-full bg-muted px-2 py-0.5 text-[10px] text-muted-foreground"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                  <div className="flex items-center gap-3 text-[10px] text-muted-foreground border-t border-border pt-2 mt-1">
                    <span>{p.node_summary.total} node{p.node_summary.total !== 1 ? "s" : ""}</span>
                    {p.node_summary.has_ai && <span>· AI</span>}
                    <span className="ml-auto">{p.fork_count} uses</span>
                  </div>
                </a>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
