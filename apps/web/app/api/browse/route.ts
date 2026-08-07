import { NextResponse } from "next/server";
import { apiError, createServiceClient } from "@/lib/api";
import {
  deriveNodeSummary,
  filterPremadeBrowsePrograms,
  getBrowseUseCount,
} from "@/lib/browse-programs";

/**
 * GET /api/browse
 *
 * Lists all publicly published programs.
 *
 * Query params:
 *   tag     — filter by a single tag (exact match)
 *   q       — search name/description (case-insensitive, optional)
 *   limit   — max results (default 48, max 96)
 *   offset  — pagination offset (default 0)
 *
 * No authentication required — public endpoint.
 */
/** Parse a query-string integer, falling back to `fallback` on anything unusable. */
function boundedInt(raw: string | null, fallback: number, min: number, max: number): number {
  const parsed = Number.parseInt(raw ?? "", 10);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(Math.max(parsed, min), max);
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tag    = searchParams.get("tag") ?? undefined;
  const tags   = (searchParams.get("tags") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const q      = searchParams.get("q")?.trim() ?? undefined;
  const sort   = searchParams.get("sort") === "popular" ? "popular" : "latest";
  // parseInt("abc") is NaN, and NaN survives Math.min/Math.max — which returned
  // an empty page alongside a non-zero total, leaving the client's infinite
  // scroll convinced there was more and refetching forever.
  const limit  = boundedInt(searchParams.get("limit"), 6, 1, 96);
  const offset = boundedInt(searchParams.get("offset"), 0, 0, Number.MAX_SAFE_INTEGER);

  const db = createServiceClient();
  const activeTags = tags.length > 0 ? tags : tag ? [tag] : [];
  const premadePrograms = filterPremadeBrowsePrograms({ tags: activeTags, q }, sort);
  const premadeSlice = premadePrograms.slice(offset, offset + limit);
  const remainingLimit = limit - premadeSlice.length;
  const dbOffset = Math.max(0, offset - premadePrograms.length);

  let query = db
    .from("programs")
    .select(
      "id, name, description, tags, fork_count, published_at, public_author_name, user_id, schema, schema_version",
      { count: "exact" }
    )
    .eq("is_public", true)
    .order(sort === "popular" ? "fork_count" : "published_at", { ascending: false })
    .order("published_at", { ascending: false });

  if (activeTags.length > 0) {
    query = query.contains("tags", activeTags);
  }

  if (q) {
    // Strip PostgREST filter metacharacters before interpolating the raw term
    // into the .or() string. Without this, a comma/paren in `q` breaks out of
    // the ilike value and injects extra filter conditions (a malformed query /
    // 500 / DoS vector; private rows stay protected by the ANDed is_public
    // filter regardless). `%` `*` `\` `"` are dropped so the term stays literal.
    const safeQ = q.replace(/[,()%*\\"]/g, "").trim();
    if (safeQ) {
      // ilike on name OR description
      query = query.or(`name.ilike.%${safeQ}%,description.ilike.%${safeQ}%`);
    }
  }

  if (remainingLimit > 0) {
    query = query.range(dbOffset, dbOffset + remainingLimit - 1);
  } else {
    query = query.limit(0);
  }

  const { data, error, count } = await query;

  if (error) return apiError(error.message, 500);

  type ProgramRow = {
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
  };

  const rows = (data ?? []) as unknown as ProgramRow[];

  // Batch-fetch usernames for authors that have a user_id
  const authorIds = [...new Set(rows.map((r) => r.user_id).filter(Boolean))] as string[];
  let usernameMap: Map<string, string | null> = new Map();
  if (authorIds.length > 0) {
    const { data: profileRows } = await (db as unknown as {
      from(t: string): {
        select(c: string): {
          in(col: string, vals: string[]): Promise<{ data: { id: string; username: string | null }[] | null }>;
        };
      };
    })
      .from("profiles")
      .select("id, username")
      .in("id", authorIds);
    for (const p of (profileRows ?? [])) usernameMap.set(p.id, p.username ?? null);
  }

  const publishedPrograms = rows.map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    tags: p.tags ?? [],
    fork_count: getBrowseUseCount(p),
    published_at: p.published_at,
    public_author_name: p.public_author_name,
    // Paired with the opted-in display name only: the card links that name to
    // /u/<username>, so returning it for a publisher who left the name blank
    // would deanonymize them through the JSON even though nothing renders it.
    author_username:
      p.public_author_name && p.user_id ? (usernameMap.get(p.user_id) ?? null) : null,
    schema_version: p.schema_version,
    // Derive node summary from schema without returning the full schema
    node_summary: deriveNodeSummary(p.schema),
  }));
  const programs = [...premadeSlice, ...publishedPrograms];

  return NextResponse.json({
    programs,
    total: premadePrograms.length + (count ?? 0),
  });
}
