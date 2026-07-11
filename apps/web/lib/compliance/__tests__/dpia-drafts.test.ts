import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  DpiaDraftMutationSchema,
  MAX_DPIA_DRAFT_CHARACTERS,
  getDpiaCompletionBlockers,
  isDpiaDraftStale,
  markDpiaContentCompleted,
  markDpiaContentDraft,
  resolvePersistedDpiaStatus,
} from "@/lib/compliance/dpia-drafts";

describe("DPIA draft persistence", () => {
  it("accepts explicit generation and bounded manual saves", () => {
    expect(DpiaDraftMutationSchema.safeParse({ action: "generate" }).success).toBe(true);
    expect(
      DpiaDraftMutationSchema.safeParse({
        action: "complete",
        basedOnDraftId: "96e32733-a72b-471a-a570-984f15d55e5e",
      }).success
    ).toBe(true);
    expect(
      DpiaDraftMutationSchema.safeParse({
        action: "save",
        basedOnDraftId: "96e32733-a72b-471a-a570-984f15d55e5e",
        content: "A".repeat(50),
      }).success
    ).toBe(true);
  });

  it("rejects empty, oversized, and unlinked manual revisions", () => {
    expect(
      DpiaDraftMutationSchema.safeParse({
        action: "save",
        basedOnDraftId: "96e32733-a72b-471a-a570-984f15d55e5e",
        content: "too short",
      }).success
    ).toBe(false);
    expect(
      DpiaDraftMutationSchema.safeParse({
        action: "save",
        content: "A".repeat(50),
      }).success
    ).toBe(false);
    expect(
      DpiaDraftMutationSchema.safeParse({
        action: "save",
        basedOnDraftId: "96e32733-a72b-471a-a570-984f15d55e5e",
        content: "A".repeat(MAX_DPIA_DRAFT_CHARACTERS + 1),
      }).success
    ).toBe(false);
  });

  it("marks a saved revision stale when the workflow changes", () => {
    const draft = {
      source_schema_version: 3,
      source_program_updated_at: "2026-07-10T12:00:00.000Z",
    };

    expect(
      isDpiaDraftStale(draft, {
        schemaVersion: 4,
        updatedAt: "2026-07-10T12:00:00.000Z",
      })
    ).toBe(true);
    expect(
      isDpiaDraftStale(draft, {
        schemaVersion: 3,
        updatedAt: "2026-07-11T12:00:00.000Z",
      })
    ).toBe(false);
    expect(
      isDpiaDraftStale(draft, {
        schemaVersion: 3,
        updatedAt: "2026-07-10T12:00:00.000Z",
      })
    ).toBe(false);

    expect(
      isDpiaDraftStale(
        {
          source_schema_version: null,
          source_program_updated_at: "2026-07-10T12:00:00.000Z",
        },
        {
          schemaVersion: null,
          updatedAt: "2026-07-11T12:00:00.000Z",
        }
      )
    ).toBe(true);

    expect(
      resolvePersistedDpiaStatus(
        { ...draft, review_status: "completed" },
        { schemaVersion: 4, updatedAt: "2026-07-10T12:00:00.000Z" }
      )
    ).toBe("saved");
    expect(
      resolvePersistedDpiaStatus(
        { ...draft, review_status: "completed" },
        { schemaVersion: 3, updatedAt: "2026-07-10T12:00:00.000Z" }
      )
    ).toBe("completed");
  });

  it("requires a resolved checklist and reviewer decision before completion", () => {
    const incomplete = `# DPIA Working Draft: Example\n\n> **Status:** Draft for human review.\n\n- [ ] Risks reviewed\n- Decision and rationale: Pending human review`;
    expect(getDpiaCompletionBlockers(incomplete)).toHaveLength(2);

    const ready = `# DPIA Working Draft: Example\n\n> **Status:** Draft for human review.\n\n- [x] Risks reviewed\n- Decision and rationale: Approved with recorded mitigations`;
    expect(getDpiaCompletionBlockers(ready)).toEqual([]);

    const completed = markDpiaContentCompleted(ready, "2026-07-11T18:00:00.000Z");
    expect(completed).toContain("# DPIA Review Record: Example");
    expect(completed).toContain("Review status:** Completed");
    expect(completed).toContain("## Corelyx review record");

    const reopened = markDpiaContentDraft(completed);
    expect(reopened).toContain("# DPIA Working Draft: Example");
    expect(reopened).toContain("Status:** Draft for human review");
    expect(reopened).not.toContain("## Corelyx review record");
  });

  it("stores revisions under a workflow with program access RLS", () => {
    const migration = readFileSync(
      join(
        __dirname,
        "../../../../../supabase/migrations/20260711133000_program_dpia_drafts.sql"
      ),
      "utf8"
    );

    expect(migration).toContain("REFERENCES public.programs(id) ON DELETE CASCADE");
    expect(migration).toContain("ALTER TABLE public.program_dpia_drafts ENABLE ROW LEVEL SECURITY");
    expect(migration).toContain("public.can_view_program(program_id)");
    expect(migration).toContain("REVOKE INSERT, UPDATE, DELETE");
    expect(migration).not.toContain("FOR INSERT");
    expect(migration).not.toContain("CREATE POLICY \"editors update program_dpia_drafts\"");
    expect(migration).not.toContain("FOR DELETE");
  });
});
