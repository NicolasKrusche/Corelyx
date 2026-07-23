import { NextRequest, NextResponse } from "next/server";
import { createServerClient } from "@/lib/supabase/server";
import { runProgramSimulation } from "@/lib/simulation/simulation-engine";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const supabase = await createServerClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return new NextResponse("Unauthorized", { status: 401 });
    }

    const { trigger_payload } = await request.json();

    // Fetch program from database
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const result: any = await supabase
      .from("programs")
      .select("*, workspaces!inner(user_id)")
      .eq("id", id)
      .eq("workspaces.user_id", user.id)
      .single();

    const { data: program, error: programError } = result;

    if (programError || !program) {
      return new NextResponse("Program not found", { status: 404 });
    }

    // The DB program.schema is already in the format expected by runProgramSimulation
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const schema = program.schema as any;

    // Run simulation
    const simResult = await runProgramSimulation(
      schema,
      trigger_payload || {}
    );

    return NextResponse.json(simResult);
  } catch (error) {
    console.error("Simulation error:", error);
    return new NextResponse("Internal Server Error", { status: 500 });
  }
}
