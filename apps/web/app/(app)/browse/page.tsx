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

  let query = db
    .from("programs")
    .select(
      "id, name, description, tags, fork_count, published_at, public_author_name, schema, schema_version",
      { count: "exact" }
    )
    .eq("is_public", true)
    .order("published_at", { ascending: false });

  if (dbLimit > 0) {
    query = query.range(0, dbLimit - 1);
  } else {
    query = query.limit(0);
  }

  const { data, count } = await query;

  const publishedPrograms: BrowseProgram[] = ((data ?? []) as unknown as Array<{
    id: string;
    name: string;
    description: string | null;
    tags: string[];
    fork_count: number;
    published_at: string | null;
    public_author_name: string | null;
    schema: unknown;
    schema_version: number;
  }>).map((p) => ({
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
  const programs = [...premadePrograms, ...publishedPrograms].slice(0, INITIAL_BROWSE_LIMIT);

  return (
    <BrowseClient
      initialPrograms={programs}
      initialTotal={premadePrograms.length + (count ?? 0)}
      filterTags={filterTags}
    />
  );
}
