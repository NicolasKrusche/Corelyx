import { redirect } from "next/navigation";
import { createServerClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/api";
import { getActiveWorkspace } from "@/lib/workspaces";
import { loadGovernanceInventory } from "@/lib/compliance/governance-server";
import { PanelSection } from "../_components/ui";
import { AiActTable, type AiActRow } from "./ai-act-table";

export const metadata = {
  title: "AI Act Checkpoints — Governance & Compliance",
};

export default async function GovernanceAiActPage({
  searchParams,
}: {
  searchParams: Promise<{ highlight?: string }>;
}) {
  const supabase = await createServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const activeWorkspace = await getActiveWorkspace(user.id);
  if (!activeWorkspace) redirect("/workspaces");

  const db = createServiceClient() as ReturnType<typeof createServiceClient> & {
    from(table: string): any;
  };

  const [{ data: programRows }, inventory, { highlight }] = await Promise.all([
    db
      .from("programs")
      .select(
        "id, name, ai_use_case_category, ai_act_risk_level, human_oversight_required, transparency_notice_required, reviewer, reviewed_at, ai_act_notes"
      )
      .eq("workspace_id", activeWorkspace.workspaceId)
      .order("updated_at", { ascending: false }),
    loadGovernanceInventory(activeWorkspace.workspaceId, db as never),
    searchParams,
  ]);

  const inventoryByProgram = new Map(
    inventory.records.filter((r) => r.program_id).map((r) => [r.program_id as string, r])
  );

  const rows: AiActRow[] = ((programRows ?? []) as Array<Record<string, unknown>>).map((p) => {
    const record = inventoryByProgram.get(p.id as string);
    return {
      id: p.id as string,
      name: (p.name as string) ?? "Untitled workflow",
      ai_use_case_category: (p.ai_use_case_category as string | null) ?? null,
      ai_act_risk_level: (p.ai_act_risk_level as string) ?? "unknown",
      human_oversight_required: Boolean(p.human_oversight_required),
      transparency_notice_required: Boolean(p.transparency_notice_required),
      reviewer: (p.reviewer as string | null) ?? null,
      reviewed_at: (p.reviewed_at as string | null) ?? null,
      ai_act_notes: (p.ai_act_notes as string | null) ?? null,
      sensitive_data: record?.special_category_data_processed ?? "Unknown",
      has_approval_gate: record?.has_approval_gate ?? false,
    };
  });

  return (
    <div className="space-y-6 pb-12">
      <section className="border-b border-border pb-6">
        <h1 className="text-3xl font-black tracking-tight bg-gradient-to-r from-foreground via-foreground to-foreground/60 bg-clip-text text-transparent">EU AI Act checkpoints</h1>
        <p className="mt-2 max-w-3xl text-sm leading-7 text-muted-foreground">
          A living record for each workflow: what the AI is used for, how risky it is, whether
          a person stays in the loop, and when it was last reviewed. Anyone with edit access
          can keep it current — no legal background needed. These records feed the governance
          dashboard and every compliance export.
        </p>
      </section>

      <PanelSection
        title={`Checkpoints (${rows.length})`}
        description="Click a workflow to edit its record. This documents your own assessment — it is a governance aid, not legal advice."
      >
        <AiActTable rows={rows} highlight={highlight} />
      </PanelSection>
    </div>
  );
}
