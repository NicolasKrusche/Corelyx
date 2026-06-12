import { embeddingsAvailable } from "@/lib/agents/embeddings";

/**
 * Compliance gate for the embeddings pipeline. The platform OpenAI key is a
 * US-resident project unless the operator explicitly asserts otherwise, so
 * eu_only workspaces must not send knowledge content or search queries to it —
 * they fall back to keyword retrieval instead (same contract as "no key").
 *
 * Set OPENAI_EU_RESIDENCY=true only when the platform OPENAI_API_KEY belongs
 * to a verified EU-resident OpenAI project; that lifts the eu_only block.
 */

type LooseClient = { from(table: string): any };

export function platformEmbeddingsEuResident(): boolean {
  return process.env.OPENAI_EU_RESIDENCY === "true";
}

/**
 * True when semantic embeddings may be used for ALL of the given workspaces.
 * A single eu_only workspace in the set blocks the semantic path for the whole
 * query — never silently degrade one workspace's compliance mode.
 *
 * Fails closed: if the compliance modes cannot be read, embeddings are blocked.
 */
export async function embeddingsAllowedForWorkspaces(
  service: LooseClient,
  workspaceIds: string[]
): Promise<boolean> {
  if (!embeddingsAvailable()) return false;
  if (workspaceIds.length === 0) return false;
  if (platformEmbeddingsEuResident()) return true;

  const { data, error } = await service
    .from("workspaces")
    .select("id, compliance_mode")
    .in("id", workspaceIds);

  if (error || !Array.isArray(data) || data.length !== workspaceIds.length) {
    return false;
  }

  return (data as Array<{ compliance_mode: string | null }>).every(
    (row) => row.compliance_mode !== "eu_only"
  );
}
