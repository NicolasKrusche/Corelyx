import { createServiceClient } from "@/lib/api";
import {
  deriveNodeSummary,
  filterPremadeBrowsePrograms,
  type BrowseProgram,
} from "@/lib/browse-programs";
import { BrowseClient } from "./browse-client";

export default async function BrowsePage() {
  const db = createServiceClient();

  const { data, count } = await db
    .from("programs")
    .select(
      "id, name, description, tags, fork_count, published_at, public_author_name, schema, schema_version",
      { count: "exact" }
    )
    .eq("is_public", true)
    .order("published_at", { ascending: false })
    .range(0, 47);

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
    fork_count: p.fork_count ?? 0,
    published_at: p.published_at,
    public_author_name: p.public_author_name,
    schema_version: p.schema_version,
    node_summary: deriveNodeSummary(p.schema),
  }));
  const premadePrograms = filterPremadeBrowsePrograms({});
  const programs = [...premadePrograms, ...publishedPrograms];

  return <BrowseClient initialPrograms={programs} initialTotal={premadePrograms.length + (count ?? 0)} />;
}
