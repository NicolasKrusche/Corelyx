import { z } from "zod";

export const MAX_DPIA_DRAFT_CHARACTERS = 100_000;
export const DPIA_DRAFT_PAGE_SIZE = 50;

export const DpiaDraftMutationSchema = z.discriminatedUnion("action", [
  z.object({ action: z.literal("generate") }).strict(),
  z
    .object({
      action: z.literal("save"),
      basedOnDraftId: z.string().uuid(),
      content: z
        .string()
        .trim()
        .min(50, "A DPIA draft must contain at least 50 characters.")
        .max(
          MAX_DPIA_DRAFT_CHARACTERS,
          `A DPIA draft cannot exceed ${MAX_DPIA_DRAFT_CHARACTERS.toLocaleString("en")} characters.`
        ),
    })
    .strict(),
  z
    .object({
      action: z.literal("complete"),
      basedOnDraftId: z.string().uuid(),
    })
    .strict(),
  z
    .object({
      action: z.literal("reopen"),
      basedOnDraftId: z.string().uuid(),
    })
    .strict(),
]);

export type DpiaDraftMutation = z.infer<typeof DpiaDraftMutationSchema>;

export type DpiaDraftRecord = {
  id: string;
  program_id: string;
  created_by: string | null;
  source_kind: "generated" | "edited" | "status_change";
  review_status: "draft" | "completed";
  reviewed_by: string | null;
  reviewed_at: string | null;
  content: string;
  source_schema_version: number | null;
  source_program_updated_at: string | null;
  created_at: string;
};

const REVIEW_RECORD_HEADING = "## Corelyx review record";

function stripCorelyxReviewRecord(content: string): string {
  const marker = `\n${REVIEW_RECORD_HEADING}`;
  const index = content.indexOf(marker);
  return (index >= 0 ? content.slice(0, index) : content).trim();
}

function setDpiaStatusLine(content: string, statusLine: string): string {
  const statusPattern = /^> \*\*(?:Status|Review status):\*\*.*$/m;
  if (statusPattern.test(content)) return content.replace(statusPattern, statusLine);

  const firstLineEnd = content.indexOf("\n");
  if (firstLineEnd < 0) return `${content}\n\n${statusLine}`;
  return `${content.slice(0, firstLineEnd)}\n\n${statusLine}${content.slice(firstLineEnd)}`;
}

/** Reasons a working draft cannot yet be represented as completed evidence. */
export function getDpiaCompletionBlockers(content: string): string[] {
  const blockers: string[] = [];
  if (/^- \[ \]/m.test(content)) {
    blockers.push("Complete or remove every unchecked review item before marking the DPIA completed.");
  }
  if (/Not recorded in this draft|Pending human review/i.test(content)) {
    blockers.push("Record the required reviewers and decision rationale before marking the DPIA completed.");
  }
  return blockers;
}

/** Snapshot a reviewed document so its text agrees with its audit status. */
export function markDpiaContentCompleted(content: string, reviewedAt: string): string {
  let next = stripCorelyxReviewRecord(content).replace(
    /^# DPIA Working Draft:/m,
    "# DPIA Review Record:"
  );
  next = setDpiaStatusLine(
    next,
    `> **Review status:** Completed in Corelyx at ${reviewedAt}. This records the authenticated workflow review; it is not legal advice.`
  );
  return `${next}\n\n${REVIEW_RECORD_HEADING}\n- Review status: Completed\n- Reviewed at: ${reviewedAt}\n- Reviewer identity: Stored in the immutable Corelyx revision metadata\n`;
}

/** Reopen or edit a completed snapshot as a new working-draft revision. */
export function markDpiaContentDraft(content: string): string {
  let next = stripCorelyxReviewRecord(content).replace(
    /^# DPIA Review Record:/m,
    "# DPIA Working Draft:"
  );
  next = setDpiaStatusLine(
    next,
    "> **Status:** Draft for human review. Confirm this revision against the workflow's current data flow and governance evidence before recording completion. It is not legal advice."
  );
  return `${next.trim()}\n`;
}

export function isDpiaDraftStale(
  draft: Pick<DpiaDraftRecord, "source_schema_version" | "source_program_updated_at">,
  program: { schemaVersion: number | null; updatedAt: string | null }
): boolean {
  if (draft.source_schema_version !== null && program.schemaVersion !== null) {
    // schema_version tracks the workflow definition. programs.updated_at also
    // changes for operational state such as agent_state after a run, which
    // must not invalidate reviewed governance evidence.
    return draft.source_schema_version !== program.schemaVersion;
  }

  // Timestamp comparison is only a legacy fallback for revisions created
  // before both sides had a reliable schema version.
  if (!draft.source_program_updated_at || !program.updatedAt) return false;
  return new Date(draft.source_program_updated_at).getTime() < new Date(program.updatedAt).getTime();
}

export function resolvePersistedDpiaStatus(
  draft: Pick<
    DpiaDraftRecord,
    "review_status" | "source_schema_version" | "source_program_updated_at"
  >,
  program: { schemaVersion: number | null; updatedAt: string | null }
): "saved" | "completed" {
  return draft.review_status === "completed" && !isDpiaDraftStale(draft, program)
    ? "completed"
    : "saved";
}
