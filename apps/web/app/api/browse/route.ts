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
export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const tag    = searchParams.get("tag") ?? undefined;
  const tags   = (searchParams.get("tags") ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);
  const q      = searchParams.get("q")?.trim() ?? undefined;
  const limit  = Math.min(Math.max(parseInt(searchParams.get("limit") ?? "6", 10), 1), 96);
  const offset = Math.max(parseInt(searchParams.get("offset") ?? "0", 10), 0);

  const db = createServiceClient();
  const activeTags = tags.length > 0 ? tags : tag ? [tag] : [];
  const premadePrograms = filterPremadeBrowsePrograms({ tags: activeTags, q });
  const premadeSlice = premadePrograms.slice(offset, offset + limit);
  const remainingLimit = limit - premadeSlice.length;
  const dbOffset = Math.max(0, offset - premadePrograms.length);

  let query = db
    .from("programs")
    .select(
      "id, name, description, tags, fork_count, published_at, public_author_name, schema, schema_version",
      { count: "exact" }
    )
    .eq("is_public", true)
    .order("published_at", { ascending: false });

  if (activeTags.length > 0) {
    query = query.contains("tags", activeTags);
  }

  if (q) {
    // ilike on name OR description
    query = query.or(`name.ilike.%${q}%,description.ilike.%${q}%`);
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
    schema: unknown;
    schema_version: number;
  };

  const publishedPrograms = ((data ?? []) as unknown as ProgramRow[]).map((p) => ({
    id: p.id,
    name: p.name,
    description: p.description,
    tags: p.tags ?? [],
    fork_count: getBrowseUseCount(p),
    published_at: p.published_at,
    public_author_name: p.public_author_name,
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
