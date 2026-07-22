import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { fromReactFlow } from "@/lib/schema";
import { runProgramSimulation, SimulationResult } from "@/lib/simulation/simulation-engine";

export async function POST(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const supabase = await createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { trigger_payload } = await request.json();

    // Fetch program from database
    const { data: program, error: programError } = await supabase
      .from("programs")
      .select("*, workspaces!inner(user_id)")
      .eq("id", params.id)
      .eq("workspaces.user_id", user.id)
      .single();

    if (programError || !program) {
      return new NextResponse("Program not found", { status: 404 });
    }

    // Convert database schema to React Flow format
    const rfSchema = fromReactFlow(program.schema);

    // Run simulation
    const result = await runProgramSimulation(
      rfSchema.nodes,
      rfSchema.edges,
      trigger_payload || {}
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error("Simulation error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}