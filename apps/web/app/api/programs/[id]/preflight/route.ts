import { NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { apiError, createServiceClient } from "@/lib/api";
import { validatePreFlight } from "@/lib/validation/pre-flight";
import { ProgramSchemaZ } from "@flowos/schema";
import type { ProgramSchema } from "@flowos/schema";
import { canRun, canView, getProgramAccess } from "@/lib/workspaces";
import { loadWorkspaceComplianceSettings } from "@/lib/compliance/server";
import { validateWorkflowCompliance } from "@/lib/compliance/workflow";
import { normalizeSchema } from "@/lib/genesis/parsing";

// POST /api/programs/[id]/preflight — run pre-flight checks before execution
export async function POST(
  _request: Request,
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
  if (!canRun(access)) return apiError("You cannot run preflight for this program.", 403);

  const { data: program, error: progError } = await supabase
    .from("programs")
    .select("id, schema")
    .eq("id", params.id)
    .single();

  if (progError || !program) return apiError("Program not found", 404);

  const programRow = program as unknown as { schema: unknown };
  // Normalize the stored schema in-memory to heal known deviations (e.g. HTTP
  // headers stored as {Name: value} instead of {key, value}) before strict parse.
  normalizeSchema(programRow.schema);
  const executableSchema = ProgramSchemaZ.safeParse(programRow.schema);
  if (!executableSchema.success) {
    // Derive per-node errors from Zod issue paths so the UI can highlight the
    // specific nodes that are incomplete rather than showing a generic message.
    const rawNodes = Array.isArray((programRow.schema as Record<string, unknown>)?.nodes)
      ? ((programRow.schema as Record<string, unknown>).nodes as Array<Record<string, unknown>>)
      : [];

    const nodeErrorIds = new Set<string>();
    for (const issue of executableSchema.error.issues) {
      // Path shape for node issues: ["nodes", <index>, ...]
      if (issue.path[0] === "nodes" && typeof issue.path[1] === "number") {
        const n = rawNodes[issue.path[1]];
        if (n?.id && typeof n.id === "string") nodeErrorIds.add(n.id);
      }
    }

    const node_states: Record<string, "error"> = {};
    for (const id of nodeErrorIds) node_states[id] = "error";

    const failures = nodeErrorIds.size > 0
      ? [...nodeErrorIds].map((id) => {
          const n = rawNodes.find((r) => r.id === id);
          const label = typeof n?.label === "string" ? n.label : id;
          return {
            node_id: id,
            message: `"${label}" has incomplete or invalid configuration.`,
            fix_suggestion: "Open this node and fill in all required fields.",
          };
        })
      : [
          {
            node_id: null,
            message: "This workflow is saved as a draft but is not ready to run.",
            fix_suggestion: "Complete required node fields before validating or running.",
          },
        ];

    const errors = failures.map((f) => ({
      code: "PRE_DRAFT",
      severity: "blocking" as const,
      node_id: f.node_id,
      edge_id: null,
      message: f.message,
      fix_suggestion: f.fix_suggestion,
    }));

    return NextResponse.json(
      {
        result: { valid: false, errors, warnings: [], node_states },
        checks: [
          {
            code: "PRE_004",
            label: "Draft completeness",
            status: "fail",
            failures,
          },
        ],
      },
      { status: 200 }
    );
  }
  const schema = executableSchema.data as unknown as ProgramSchema;

  // Use service client to bypass RLS for Vault-adjacent reads
  const serviceClient = createServiceClient();

  // Fetch connections linked to this program
  const { data: linkedConns } = await serviceClient
    .from("program_connections")
    .select("connection_id")
    .eq("program_id", params.id);

  const connectionIds = ((linkedConns ?? []) as Array<{ connection_id: string }>).map((r) => r.connection_id);

  let connections: Array<{
    id: string;
    name: string;
    provider: string;
    scopes: string[] | null;
    is_valid: boolean;
  }> = [];

  if (connectionIds.length > 0) {
    const { data } = await serviceClient
      .from("connections")
      .select("id, name, provider, scopes, is_valid")
      .in("id", connectionIds)
      .eq("workspace_id", access!.workspaceId);
    connections = (data ?? []) as typeof connections;
  }

  const { data: apiKeys } = await serviceClient
    .from("api_keys")
    .select("id, name, provider, is_valid")
    .eq("workspace_id", access!.workspaceId);

  const { result, checks } = await validatePreFlight(
    schema,
    connections,
    (apiKeys ?? []) as Array<{ id: string; name: string; provider: string; is_valid: boolean }>
  );

  const workspaceCompliance = await loadWorkspaceComplianceSettings(access!.workspaceId, serviceClient);
  const complianceChecks = validateWorkflowCompliance(
    schema,
    workspaceCompliance,
    {
      connections,
      apiKeys: (apiKeys ?? []) as Array<{ id: string; name: string; provider: string; is_valid: boolean }>,
    }
  );

  return NextResponse.json({ result, checks, compliance_checks: complianceChecks });
}
