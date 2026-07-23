import { NextResponse, type NextRequest } from "next/server";
import { ProgramSchemaZ } from "@flowos/schema";
import { createServiceClient } from "@/lib/api";
import { getRequestUser } from "@/lib/supabase/server";
import { getActiveWorkspace } from "@/lib/workspaces";
import { classifyRisk } from "@/lib/compliance/risk-classifier";
import { generateDpiaTemplate } from "@/lib/compliance/dpia-generator";

type LooseServiceClient = ReturnType<typeof createServiceClient> & {
  from(table: string): any;
};

/**
 * GET /api/compliance/dpia/[programId]
 *
 * Returns a DPIA template for the specified program.
 */
export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ programId: string }> }
) {
  try {
    const user = await getRequestUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspace = await getActiveWorkspace(user.id);
    if (!workspace) {
      return NextResponse.json({ error: "No workspace" }, { status: 404 });
    }

    const { programId } = await params;

    const db = createServiceClient() as LooseServiceClient;

    // Fetch program with schema
    const { data: program, error: fetchError } = await db
      .from("programs")
      .select("id, workspace_id, schema")
      .eq("id", programId)
      .eq("workspace_id", workspace.workspaceId)
      .single();

    if (fetchError || !program) {
      return NextResponse.json({ error: "Program not found" }, { status: 404 });
    }

    // Validate schema
    const parsed = ProgramSchemaZ.safeParse(program.schema);
    if (!parsed.success) {
      return NextResponse.json(
        { error: "Program schema is invalid — complete the workflow before generating DPIA." },
        { status: 422 }
      );
    }

    // Classify risk and generate DPIA
    const riskAssessment = classifyRisk(parsed.data);
    const dpiaTemplate = generateDpiaTemplate(parsed.data, riskAssessment);

    return NextResponse.json(dpiaTemplate);
  } catch (err: any) {
    console.error("[compliance/dpia]", err);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}
