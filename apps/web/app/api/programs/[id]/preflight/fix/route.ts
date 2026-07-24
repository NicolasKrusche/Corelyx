import { NextResponse } from "next/server";
import { z } from "zod";
import { ProgramSchemaZ, type ProgramSchema, type AgentNode } from "@flowos/schema";
import { apiError, createServiceClient } from "@/lib/api";
import { createServerClient } from "@/lib/supabase/server";
import { getDefaultModelForProvider, validatePreFlight } from "@/lib/validation/pre-flight";
import { canEdit, canView, getProgramAccess } from "@/lib/workspaces";
import { applyJsonPatch, JsonPatchOpZ } from "@/lib/genesis/fixit";

const remediationSchema = z.discriminatedUnion("type", [
  z.object({
    type: z.literal("assign_agent_defaults"),
    node_id: z.string().min(1),
  }),
  z.object({
    type: z.literal("remove_invalid_edge"),
    edge_id: z.string().min(1),
  }),
  // AI Fix-It: apply an LLM-generated RFC 6902 JSON Patch. The patch is
  // re-validated below against the full ProgramSchema before it is persisted,
  // and the applier is sandboxed to nodes/edges, so a bad patch can only fail
  // closed — it never writes a partially-mutated or off-graph schema.
  z.object({
    type: z.literal("apply_json_patch"),
    patch: z.array(JsonPatchOpZ).min(1).max(50),
    description: z.string().max(500).optional(),
  }),
]);

const requestSchema = z.object({
  remediation: remediationSchema,
});

// POST /api/programs/[id]/preflight/fix - apply one safe remediation and re-run pre-flight
export async function POST(
  request: Request,
  { params: routeParams }: { params: Promise<{ id: string }> }
) {
  const params = await routeParams;
  const supabase = await createServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return apiError("Unauthorized", 401);

  const access = await getProgramAccess(params.id, user.id);
  if (!canView(access)) return apiError("Program not found", 404);
  if (!canEdit(access)) return apiError("Only program editors can apply fixes.", 403);

  const body = await request.json().catch(() => null);
  const parsedBody = requestSchema.safeParse(body);
  if (!parsedBody.success) return apiError(parsedBody.error.message, 400);

  const { data: programRow, error: programError } = await supabase
    .from("programs")
    .select("id, schema, schema_version")
    .eq("id", params.id)
    .single();

  if (programError || !programRow) return apiError("Program not found", 404);
  type ProgramRow = { id: string; schema: unknown; schema_version: number | null };
  const program = programRow as unknown as ProgramRow;

  const parsedSchema = ProgramSchemaZ.safeParse(program.schema);
  if (!parsedSchema.success) {
    return apiError("Program schema is invalid and cannot be auto-fixed", 409);
  }

  const serviceClient = createServiceClient();
  const remediation = parsedBody.data.remediation;

  let nextSchema = parsedSchema.data as ProgramSchema;
  let changeSummary = "Pre-flight remediation";

  if (remediation.type === "remove_invalid_edge") {
    const edgeExists = nextSchema.edges.some((edge) => edge.id === remediation.edge_id);
    if (!edgeExists) return apiError("Edge was already removed", 409);

    nextSchema = {
      ...nextSchema,
      edges: nextSchema.edges.filter((edge) => edge.id !== remediation.edge_id),
      updated_at: new Date().toISOString(),
    };

    changeSummary = `Pre-flight fix: removed invalid edge ${remediation.edge_id}`;
  }

  if (remediation.type === "assign_agent_defaults") {
    const nodeIndex = nextSchema.nodes.findIndex((node) => node.id === remediation.node_id);
    if (nodeIndex === -1) return apiError("Target node not found", 404);

    const targetNode = nextSchema.nodes[nodeIndex];
    if (!targetNode || targetNode.type !== "agent") {
      return apiError("Only agent nodes support this remediation", 400);
    }

    const agentNode = targetNode as AgentNode;

    const { data: validKeysRaw } = await serviceClient
      .from("api_keys")
      .select("id, name, provider, is_valid")
      .eq("workspace_id", access!.workspaceId)
      .eq("is_valid", true);

    type ValidKey = { id: string; name: string; provider: string; is_valid: boolean };
    const validKeys = (validKeysRaw ?? []) as ValidKey[];
    if (validKeys.length === 0) {
      return apiError("No valid API key is available for auto-assignment", 409);
    }

    const currentKeyRef = agentNode.config.api_key_ref;
    const selectedKey =
      validKeys.find((key) => key.id === currentKeyRef) ??
      [...validKeys].sort((a, b) => a.name.localeCompare(b.name))[0];

    if (!selectedKey) {
      return apiError("No valid API key is available for auto-assignment", 409);
    }

    let nextModel = agentNode.config.model;
    if (nextModel === "__USER_ASSIGNED__") {
      const defaultModel = getDefaultModelForProvider(selectedKey.provider);
      if (!defaultModel) {
        return apiError(
          `No default model preset is configured for provider \"${selectedKey.provider}\"`,
          409
        );
      }
      nextModel = defaultModel;
    }

    const patchedNode: AgentNode = {
      ...agentNode,
      config: {
        ...agentNode.config,
        api_key_ref: selectedKey.id,
        model: nextModel,
      },
    };

    const nextNodes = [...nextSchema.nodes];
    nextNodes[nodeIndex] = patchedNode;

    nextSchema = {
      ...nextSchema,
      nodes: nextNodes,
      updated_at: new Date().toISOString(),
    };

    changeSummary = `Pre-flight fix: assigned model and API key for node ${agentNode.id}`;
  }

  if (remediation.type === "apply_json_patch") {
    const patched = applyJsonPatch(nextSchema, remediation.patch);
    if (!patched.ok) {
      return apiError(patched.error ?? "The AI fix could not be applied", 422);
    }

    // Re-validate the patched document against the full schema. This is the
    // trust boundary: the LLM output is never persisted unless it still parses
    // as a valid ProgramSchema.
    const revalidated = ProgramSchemaZ.safeParse(patched.result);
    if (!revalidated.success) {
      return apiError("The AI fix produced an invalid workflow schema", 422);
    }

    nextSchema = {
      ...(revalidated.data as ProgramSchema),
      updated_at: new Date().toISOString(),
    };

    changeSummary = remediation.description
      ? `Pre-flight AI fix: ${remediation.description}`
      : "Pre-flight AI fix: applied schema patch";
  }

  const nextVersion = (program.schema_version ?? 0) + 1;
  const now = new Date().toISOString();

  const { error: updateError } = await supabase
    .from("programs")
    .update({
      schema: nextSchema as unknown,
      schema_version: nextVersion,
      updated_at: now,
    } as unknown as never)
    .eq("id", params.id);

  if (updateError) return apiError(updateError.message, 500);

  await supabase
    .from("program_versions")
    .insert({
      program_id: params.id,
      version: nextVersion,
      schema: nextSchema as unknown,
      change_summary: changeSummary,
    } as unknown as never);

  const { data: linkedConnsRaw } = await serviceClient
    .from("program_connections")
    .select("connection_id")
    .eq("program_id", params.id);

  const connectionIds = (linkedConnsRaw ?? []).map(
    (row: { connection_id: string }) => row.connection_id
  );

  let connections: Array<{
    id: string;
    name: string;
    provider: string;
    scopes: string[] | null;
    is_valid: boolean;
  }> = [];

  if (connectionIds.length > 0) {
    const { data: connRows } = await serviceClient
      .from("connections")
      .select("id, name, provider, scopes, is_valid")
      .in("id", connectionIds)
      .eq("workspace_id", access!.workspaceId);

    connections = (connRows ?? []) as typeof connections;
  }

  const { data: apiKeysRaw } = await serviceClient
    .from("api_keys")
    .select("id, name, provider, is_valid")
    .eq("workspace_id", access!.workspaceId);

  const { result, checks } = await validatePreFlight(
    nextSchema,
    connections,
    (apiKeysRaw ?? []) as Array<{ id: string; name: string; provider: string; is_valid: boolean }>
  );

  return NextResponse.json({
    ok: true,
    applied: remediation.type,
    // The fix wrote a new schema + schema_version server-side. The editor must
    // adopt BOTH: the schema so its local draft includes the fix, and the
    // version so its next version-guarded autosave is neither rejected as
    // stale nor silently clobbers this fix with the pre-fix draft.
    schema: nextSchema,
    schema_version: nextVersion,
    validation: { result, checks },
  });
}
