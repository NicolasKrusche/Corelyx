import { createServiceClient } from "@/lib/api";
import {
  deriveNodeSummary,
  filterPremadeBrowsePrograms,
  getBrowseUseCount,
  type BrowseProgram,
} from "@/lib/browse-programs";
import { BrowseClient } from "./browse-client";

const INITIAL_BROWSE_LIMIT = 15;

export default async function BrowsePage() {
  const db = createServiceClient();
  const premadePrograms = filterPremadeBrowsePrograms({});
  const filterTags = [...new Set(premadePrograms.flatMap((program) => program.tags))].sort();
  const dbLimit = Math.max(0, INITIAL_BROWSE_LIMIT - premadePrograms.length);

  // `author_username` is not a column on programs — it lives on profiles and is
  // resolved below, exactly as /api/browse does. Selecting it here made
  // PostgREST fail the whole query (42703); the error was discarded along with
  // `data`, so the first render of /browse never showed a single community
  // program — they only appeared once infinite scroll hit the API route.
  let query = db
    .from("programs")
    .select(
      "id, name, description, tags, fork_count, published_at, public_author_name, user_id, schema, schema_version",
      { count: "exact" }
    )
    .eq("is_public", true)
    .order("published_at", { ascending: false });

  if (dbLimit > 0) {
    query = query.range(0, dbLimit - 1);
  } else {
    query = query.limit(0);
  }

  const { data, error, count } = await query;
  if (error) {
    console.error("[browse] failed to load published programs", error.message);
  }

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    name: string;
    description: string | null;
    tags: string[];
    fork_count: number;
    published_at: string | null;
    public_author_name: string | null;
    user_id: string | null;
    schema: unknown;
    schema_version: number;
  }>;

  const authorIds = [...new Set(rows.map((row) => row.user_id).filter(Boolean))] as string[];
  const usernameByAuthor = new Map<string, string | null>();
  if (authorIds.length > 0) {
    const { data: profileRows } = await db
      .from("profiles")
      .select("id, username")
      .in("id", authorIds);
    for (const profile of ((profileRows ?? []) as unknown as Array<{ id: string; username: string | null }>)) {
      usernameByAuthor.set(profile.id, profile.username ?? null);
    }
  }

  const publishedPrograms: BrowseProgram[] = rows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    tags: p.tags ?? [],
    fork_count: getBrowseUseCount(p),
    published_at: p.published_at,
    public_author_name: p.public_author_name,
    // Only ever paired with an opted-in display name — the card links the name
    // to /u/<username>. Returning it for a publisher who left the display name
    // blank would deanonymize them through the JSON alone.
    author_username:
      p.public_author_name && p.user_id ? (usernameByAuthor.get(p.user_id) ?? null) : null,
    schema_version: p.schema_version,
    node_summary: deriveNodeSummary(p.schema),
  }));
  const programs = [...premadePrograms, ...publishedPrograms].slice(0, INITIAL_BROWSE_LIMIT);

  return (
    <BrowseClient
      initialPrograms={programs}
      initialTotal={premadePrograms.length + (count ?? 0)}
      filterTags={filterTags}
    />
  );
}
