import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ArrowLeft, Scale } from "lucide-react";
import { createServiceClient } from "@/lib/api";
import {
  DPIA_DRAFT_PAGE_SIZE,
  type DpiaDraftRecord,
} from "@/lib/compliance/dpia-drafts";
import { getRequestUser } from "@/lib/supabase/server";
import { canEdit, canView, getProgramAccess } from "@/lib/workspaces";
import { DpiaDraftEditor } from "./dpia-draft-editor";

export default async function WorkflowDpiaPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getRequestUser();
  if (!user) redirect("/login");

  const access = await getProgramAccess(id, user.id);
  if (!canView(access)) notFound();

  const db = createServiceClient();
  const [
    { data: program },
    { data: draftRows, error: draftError, count: draftCount },
  ] = await Promise.all([
    db
      .from("programs")
      .select("id, name, schema_version, updated_at")
      .eq("id", id)
      .single(),
    db
      .from("program_dpia_drafts")
      .select(
        "id, program_id, created_by, source_kind, review_status, reviewed_by, reviewed_at, content, source_schema_version, source_program_updated_at, created_at",
        { count: "exact" }
      )
      .eq("program_id", id)
      .order("created_at", { ascending: false })
      .limit(DPIA_DRAFT_PAGE_SIZE),
  ]);

  if (!program) notFound();
  if (draftError) throw new Error(`Could not load workflow DPIA drafts: ${draftError.message}`);

  const workflow = program as {
    id: string;
    name: string;
    schema_version: number | null;
    updated_at: string | null;
  };

  return (
    <div className="space-y-6 pb-12">
      <section className="border-b border-border pb-6">
        <Link
          href="/governance"
          className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Governance
        </Link>
        <div className="mt-4 flex items-start gap-3">
          <span className="rounded-lg border border-primary/25 bg-primary/10 p-2 text-primary">
            <Scale className="h-5 w-5" />
          </span>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
              Workflow DPIA
            </p>
            <h1 className="mt-1 text-3xl font-black tracking-tight">{workflow.name}</h1>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-muted-foreground">
              Generate, review, save, and download DPIA draft revisions for this workflow. Drafts
              here are never shared with another workflow.
            </p>
          </div>
        </div>
      </section>

      <DpiaDraftEditor
        programId={workflow.id}
        programName={workflow.name}
        schemaVersion={workflow.schema_version}
        programUpdatedAt={workflow.updated_at}
        currentUserId={user.id}
        canEdit={canEdit(access)}
        initialDrafts={(draftRows ?? []) as DpiaDraftRecord[]}
        initialTotalCount={draftCount ?? 0}
      />
    </div>
  );
}
