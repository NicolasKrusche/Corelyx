import { createHash } from "crypto";
import type { LooseServiceClient } from "@/lib/api";
import { loadGovernanceInventory } from "@/lib/compliance/governance-server";
import { collectAgentAudit } from "@/lib/compliance/agent-audit";
import { recordsToCsv, toCsv, zipArchive, type ZipEntry } from "@/lib/compliance/export";

// Bounds keep an on-demand export from unbounded scans. Approvals are drawn from
// the most recent runs per workspace; truncation (if any) is noted in MANIFEST.
const MAX_AGENTS = 500;
const MAX_RUNS_FOR_APPROVALS = 1000;
const IN_CHUNK = 300;

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

/** Filesystem-safe slug for per-agent audit filenames. */
function slug(value: string): string {
  return (value || "agent").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "agent";
}

type ApprovalRecord = {
  approval_id: string;
  program_id: string | null;
  program_name: string | null;
  node_execution_id: string;
  status: string | null;
  decided_by: string | null;
  decision_note: string | null;
  decided_at: string | null;
  created_at: string | null;
};

/**
 * Gather every approval decision in the workspace by resolving
 * approvals → node_executions → runs → programs. Best-effort: on any query error
 * this returns an empty set plus a note, so a partial data issue never sinks the
 * whole evidence pack.
 */
async function collectWorkspaceApprovals(
  db: LooseServiceClient,
  programsById: Map<string, string>
): Promise<{ approvals: ApprovalRecord[]; note: string | null }> {
  try {
    const programIds = [...programsById.keys()];
    if (programIds.length === 0) return { approvals: [], note: null };

    // Runs for workspace programs (most recent first, bounded).
    const runToProgram = new Map<string, string>();
    for (const group of chunk(programIds, IN_CHUNK)) {
      const { data } = await db
        .from("runs")
        .select("id, program_id")
        .in("program_id", group)
        .order("created_at", { ascending: false })
        .limit(MAX_RUNS_FOR_APPROVALS);
      for (const r of (data ?? []) as Array<{ id: string; program_id: string }>) {
        runToProgram.set(r.id, r.program_id);
      }
    }
    if (runToProgram.size === 0) return { approvals: [], note: null };
    const truncated = runToProgram.size >= MAX_RUNS_FOR_APPROVALS;

    // node_executions for those runs → map execution id to its run.
    const execToRun = new Map<string, string>();
    for (const group of chunk([...runToProgram.keys()], IN_CHUNK)) {
      const { data } = await db.from("node_executions").select("id, run_id").in("run_id", group);
      for (const ne of (data ?? []) as Array<{ id: string; run_id: string }>) {
        execToRun.set(ne.id, ne.run_id);
      }
    }
    if (execToRun.size === 0) return { approvals: [], note: null };

    // Approvals attached to those executions.
    const approvals: ApprovalRecord[] = [];
    for (const group of chunk([...execToRun.keys()], IN_CHUNK)) {
      const { data } = await db
        .from("approvals")
        .select("id, node_execution_id, user_id, status, decision_note, decided_at, created_at")
        .in("node_execution_id", group);
      for (const a of (data ?? []) as Array<{
        id: string;
        node_execution_id: string;
        user_id: string | null;
        status: string | null;
        decision_note: string | null;
        decided_at: string | null;
        created_at: string | null;
      }>) {
        const runId = execToRun.get(a.node_execution_id) ?? null;
        const programId = runId ? runToProgram.get(runId) ?? null : null;
        approvals.push({
          approval_id: a.id,
          program_id: programId,
          program_name: programId ? programsById.get(programId) ?? null : null,
          node_execution_id: a.node_execution_id,
          status: a.status,
          decided_by: a.user_id,
          decision_note: a.decision_note,
          decided_at: a.decided_at,
          created_at: a.created_at,
        });
      }
    }

    approvals.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
    return {
      approvals,
      note: truncated
        ? `Approvals drawn from the most recent ${MAX_RUNS_FOR_APPROVALS} runs per workspace; older runs may be omitted.`
        : null,
    };
  } catch (error) {
    return { approvals: [], note: `Approval history unavailable: ${(error as Error).message}` };
  }
}

const APPROVAL_HEADERS = [
  "approval_id",
  "program_id",
  "program_name",
  "node_execution_id",
  "status",
  "decided_by",
  "decision_note",
  "decided_at",
  "created_at",
] as const;

function approvalsToCsv(approvals: ApprovalRecord[]): string {
  return toCsv(
    APPROVAL_HEADERS as unknown as string[],
    approvals.map((a) => APPROVAL_HEADERS.map((h) => a[h]))
  );
}

export type EvidencePack = { filename: string; buffer: Buffer };

/**
 * Assemble a single ZIP that an auditor can open standalone: the AI system
 * inventory, every agent's action audit, the full approval-decision history, a
 * human-readable README, and an integrity MANIFEST (SHA-256 per file).
 *
 * Nothing here is a substitute for a signing key — the manifest is
 * tamper-evidence, not a cryptographic signature.
 */
export async function buildEvidencePack(
  db: LooseServiceClient,
  opts: { workspaceId: string; exportedBy: string }
): Promise<EvidencePack> {
  const { workspaceId, exportedBy } = opts;
  const generatedAt = new Date().toISOString();

  const bundle = await loadGovernanceInventory(workspaceId, db as never);

  // Programs in the workspace (for names) + the agents that get audit trails.
  const { data: programRows } = await db
    .from("programs")
    .select("id, name, program_type")
    .eq("workspace_id", workspaceId)
    .limit(5000);
  const programs = (programRows ?? []) as Array<{ id: string; name: string; program_type: string | null }>;
  const programsById = new Map(programs.map((p) => [p.id, p.name]));
  const agents = programs.filter((p) => p.program_type === "agent").slice(0, MAX_AGENTS);

  const agentAudits = await Promise.all(
    agents.map((a) => collectAgentAudit(db, { id: a.id, name: a.name }))
  );

  const { approvals, note: approvalsNote } = await collectWorkspaceApprovals(db, programsById);

  // ── Assemble content files (README first; MANIFEST is appended last) ──────
  const files: ZipEntry[] = [];

  files.push({
    name: "README.txt",
    content: [
      "Corelyx Auditor Evidence Pack",
      "=============================",
      "",
      `Workspace:    ${workspaceId}`,
      `Generated at: ${generatedAt}`,
      `Exported by:  ${exportedBy}`,
      "",
      "Contents",
      "--------",
      "ai-inventory.csv / .json  AI system inventory (owners, purpose, data,",
      "                          risk classification, DPIA & oversight status).",
      "approvals.csv / .json     Every human approval decision, linked to the",
      "                          program and node execution it gated.",
      "agents/<name>.json        Per-agent action audit: runs, node executions,",
      "                          tool calls (arguments are never stored), and the",
      "                          report produced for each run.",
      "MANIFEST.txt              SHA-256 of every file above for integrity checks.",
      "",
      "This pack is generated on demand and reflects data at the time above.",
    ].join("\n"),
  });

  files.push({ name: "ai-inventory.csv", content: recordsToCsv(bundle.records) });
  files.push({ name: "ai-inventory.json", content: JSON.stringify(bundle, null, 2) });
  files.push({ name: "approvals.csv", content: approvalsToCsv(approvals) });
  files.push({
    name: "approvals.json",
    content: JSON.stringify({ generated_at: generatedAt, count: approvals.length, approvals }, null, 2),
  });

  const usedNames = new Set<string>();
  for (const audit of agentAudits) {
    let name = slug(audit.agent.name);
    // Disambiguate collisions with a short id suffix so no file is overwritten.
    if (usedNames.has(name)) name = `${name}-${audit.agent.id.slice(0, 8)}`;
    usedNames.add(name);
    files.push({ name: `agents/${name}.json`, content: JSON.stringify(audit, null, 2) });
  }

  // ── Integrity manifest over every file above ─────────────────────────────
  const sha256 = (content: string | Buffer) =>
    createHash("sha256").update(Buffer.isBuffer(content) ? content : Buffer.from(content, "utf8")).digest("hex");

  const manifestLines = [
    "Corelyx Auditor Evidence Pack — Integrity Manifest",
    "==================================================",
    "",
    `Workspace:    ${workspaceId}`,
    `Generated at: ${generatedAt}`,
    `Exported by:  ${exportedBy}`,
    "",
    "Summary",
    "-------",
    `AI systems in inventory : ${bundle.records.length}`,
    `Agents with audit trails: ${agentAudits.length}`,
    `Approval decisions      : ${approvals.length}`,
    ...(approvalsNote ? ["", `Note: ${approvalsNote}`] : []),
    "",
    "SHA-256 (file)",
    "--------------",
    ...files.map((f) => `${sha256(f.content)}  ${f.name}`),
    "",
    "Checksums cover file contents at generation time. This is an integrity",
    "manifest for tamper-evidence, not a cryptographic signature.",
  ];

  const entries: ZipEntry[] = [...files, { name: "MANIFEST.txt", content: manifestLines.join("\n") }];
  const buffer = zipArchive(entries);
  const filename = `corelyx-evidence-pack-${workspaceId.slice(0, 8)}-${generatedAt.slice(0, 10)}.zip`;
  return { filename, buffer };
}
