"use client";

import { useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  FileArchive,
  Loader2,
  Plug,
  Puzzle,
  Sparkles,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { previewFromJsonString, type RelayWorkflowPreview } from "@/lib/migrate/relay/extract";
import { summarizeCoverage } from "@/lib/migrate/relay/mapping";

type Phase = "intake" | "preview" | "importing" | "report";
type WfStatus = "pending" | "converting" | "done" | "error" | "skipped";

type ImportResult = {
  programId: string;
  programName: string;
  errors: number;
  warnings: number;
  missing: string[];
  manualNotes: number;
  gaps: { label: string; suggestion: string | null }[];
};

type Workflow = {
  id: string;
  name: string;
  buildPrompt: string | null;
  workflowJson: unknown | null;
  preview: RelayWorkflowPreview | null;
  selected: boolean;
  status: WfStatus;
  message?: string;
  result?: ImportResult;
};

const RUN_FILE_RE = /(^|\/)runs?\//i;
const RUN_NAME_RE = /(^|[^a-z])run[-_.]/i;

function looksLikeWorkflow(text: string): number {
  // Higher = more likely the workflow definition (vs a run record).
  let score = 0;
  const lower = text.toLowerCase();
  for (const key of ["\"steps\"", "\"nodes\"", "\"trigger\"", "\"actions\"", "\"blocks\""]) {
    if (lower.includes(key)) score += 10;
  }
  for (const runKey of ["\"startedat\"", "\"finishedat\"", "\"runid\"", "\"status\"", "\"executionhistory\""]) {
    if (lower.includes(runKey)) score -= 6;
  }
  return score + Math.min(text.length / 1000, 5);
}

let idSeq = 0;
function nextId(): string {
  idSeq += 1;
  return `wf_${idSeq}`;
}

/**
 * Parse a Relay export .zip entirely in the browser. Only the workflow
 * definition JSON and the build-prompt markdown are read; run history, run
 * JSONs, and Tables CSVs are ignored and never leave the machine.
 */
async function parseRelayZip(file: File): Promise<{ workflows: Workflow[]; unrecognized: string[] }> {
  const { default: JSZip } = await import("jszip");
  const zip = await JSZip.loadAsync(file);

  // Pass 1 (sync): group entry names by top-level folder. We only track names
  // here so the "best prompt md" choice is deterministic before any async read.
  type RawGroup = { folder: string; mdNames: { name: string; weight: number }[]; jsonNames: string[] };
  const groups = new Map<string, RawGroup>();

  zip.forEach((path, entry) => {
    if (entry.dir) return;
    const lower = path.toLowerCase();
    const parts = path.split("/").filter(Boolean);
    const folder = parts.length > 1 ? parts[0]! : parts[0]!.replace(/\.[^.]+$/, "");
    const base = parts[parts.length - 1]!.toLowerCase();

    const group = groups.get(folder) ?? { folder, mdNames: [], jsonNames: [] };
    groups.set(folder, group);

    if (lower.endsWith(".md")) {
      group.mdNames.push({ name: path, weight: base.includes("prompt") ? 2 : 1 });
    } else if (lower.endsWith(".json")) {
      // Skip run data — it's not the workflow definition and carries customer PII.
      if (RUN_FILE_RE.test(lower) || RUN_NAME_RE.test(base)) return;
      group.jsonNames.push(path);
    }
    // .csv, images, etc. are intentionally ignored and never read.
  });

  const readText = async (name: string): Promise<string | null> => {
    const f = zip.file(name);
    return f ? f.async("string") : null;
  };

  const workflows: Workflow[] = [];
  const unrecognized: string[] = [];

  for (const group of groups.values()) {
    // Pick the highest-weight prompt md and read it.
    const bestMd = group.mdNames.sort((a, b) => b.weight - a.weight)[0];
    const mdText = bestMd ? await readText(bestMd.name) : null;

    // Read candidate jsons and pick the one that looks most like a definition.
    const jsonTexts = (await Promise.all(group.jsonNames.map((n) => readText(n)))).filter((t): t is string => !!t);
    const bestJson = jsonTexts
      .map((text) => ({ text, score: looksLikeWorkflow(text) }))
      .sort((a, b) => b.score - a.score)[0];

    if (!bestJson && !mdText) {
      unrecognized.push(group.folder);
      continue;
    }

    let parsedJson: unknown = null;
    let preview: RelayWorkflowPreview | null = null;
    if (bestJson) {
      preview = previewFromJsonString(bestJson.text, group.folder);
      try {
        parsedJson = JSON.parse(bestJson.text);
      } catch {
        parsedJson = null;
      }
    }

    workflows.push({
      id: nextId(),
      name: preview?.name?.trim() || group.folder,
      buildPrompt: mdText,
      workflowJson: parsedJson,
      preview,
      selected: true,
      status: "pending",
    });
  }

  workflows.sort((a, b) => a.name.localeCompare(b.name));
  return { workflows, unrecognized };
}

function CoverageChips({ preview }: { preview: RelayWorkflowPreview | null }) {
  if (!preview || preview.apps.length === 0) {
    return <span className="text-xs text-muted-foreground">No apps detected — the build prompt will drive the import.</span>;
  }
  const { covered, gaps } = summarizeCoverage(preview.apps.map((a) => a.resolution));
  return (
    <div className="flex flex-wrap gap-1.5">
      {covered.map((c) => (
        <span key={c.label} className="inline-flex items-center gap-1 rounded-full border border-green-500/30 bg-green-500/10 px-2 py-0.5 text-[11px] text-green-700 dark:text-green-400">
          <CheckCircle2 className="h-3 w-3" /> {c.label}
        </span>
      ))}
      {gaps.map((g) => (
        <span key={g.label} className="inline-flex items-center gap-1 rounded-full border border-yellow-500/30 bg-yellow-500/10 px-2 py-0.5 text-[11px] text-yellow-700 dark:text-yellow-400">
          <Puzzle className="h-3 w-3" /> {g.label}
        </span>
      ))}
    </div>
  );
}

export default function RelayMigratePage() {
  const router = useRouter();
  const [phase, setPhase] = useState<Phase>("intake");
  const [workflows, setWorkflows] = useState<Workflow[]>([]);
  const [unrecognized, setUnrecognized] = useState<string[]>([]);
  const [parsing, setParsing] = useState(false);
  const [intakeError, setIntakeError] = useState<string | null>(null);
  const [pasteBuildPrompt, setPasteBuildPrompt] = useState("");
  const [pasteJson, setPasteJson] = useState("");
  const [mode, setMode] = useState<"zip" | "paste">("zip");
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const selectedCount = useMemo(() => workflows.filter((w) => w.selected).length, [workflows]);

  async function handleFiles(files: FileList | null) {
    if (!files || files.length === 0) return;
    setIntakeError(null);
    setParsing(true);
    try {
      const collected: Workflow[] = [];
      const unrec: string[] = [];
      for (const file of Array.from(files)) {
        const lower = file.name.toLowerCase();
        if (lower.endsWith(".zip")) {
          const { workflows: wfs, unrecognized: u } = await parseRelayZip(file);
          collected.push(...wfs);
          unrec.push(...u);
        } else if (lower.endsWith(".json")) {
          const text = await file.text();
          const preview = previewFromJsonString(text, file.name.replace(/\.json$/i, ""));
          let parsed: unknown = null;
          try { parsed = JSON.parse(text); } catch { parsed = null; }
          collected.push({
            id: nextId(),
            name: preview?.name?.trim() || file.name.replace(/\.json$/i, ""),
            buildPrompt: null,
            workflowJson: parsed,
            preview,
            selected: true,
            status: "pending",
          });
        }
      }
      if (collected.length === 0) {
        setIntakeError("No Relay workflows found. Upload the .zip from Relay's “Export workspace data”, or individual workflow .json files.");
        return;
      }
      setWorkflows(collected);
      setUnrecognized(unrec);
      setPhase("preview");
    } catch {
      setIntakeError("Could not read that file. Make sure it's the .zip Relay emailed you, or a workflow .json.");
    } finally {
      setParsing(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function handleAddPasted() {
    const bp = pasteBuildPrompt.trim();
    const rawJson = pasteJson.trim();
    if (!bp && !rawJson) {
      setIntakeError("Paste the build prompt Relay generated, the workflow JSON, or both.");
      return;
    }
    let parsed: unknown = null;
    let preview: RelayWorkflowPreview | null = null;
    if (rawJson) {
      preview = previewFromJsonString(rawJson);
      try { parsed = JSON.parse(rawJson.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim()); } catch { parsed = null; }
    }
    setWorkflows([
      {
        id: nextId(),
        name: preview?.name?.trim() || "Pasted Relay workflow",
        buildPrompt: bp || null,
        workflowJson: parsed,
        preview,
        selected: true,
        status: "pending",
      },
    ]);
    setUnrecognized([]);
    setIntakeError(null);
    setPhase("preview");
  }

  function toggle(id: string) {
    setWorkflows((prev) => prev.map((w) => (w.id === id ? { ...w, selected: !w.selected } : w)));
  }

  function updateWf(id: string, patch: Partial<Workflow>) {
    setWorkflows((prev) => prev.map((w) => (w.id === id ? { ...w, ...patch } : w)));
  }

  async function importOne(wf: Workflow, limitReached: { value: boolean }): Promise<void> {
    if (limitReached.value) {
      updateWf(wf.id, { status: "skipped", message: "Plan limit reached — upgrade to import more." });
      return;
    }
    updateWf(wf.id, { status: "converting", message: undefined });
    try {
      const res = await fetch("/api/migrate/relay", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: wf.name,
          prompt_md: wf.buildPrompt ?? undefined,
          workflow_json: wf.workflowJson ?? undefined,
          providers: wf.preview?.providers ?? undefined,
        }),
      });
      const data = await res.json().catch(() => null);

      if (res.status === 403 && data?.error === "PROGRAM_LIMIT_REACHED") {
        limitReached.value = true;
        updateWf(wf.id, { status: "skipped", message: data?.message ?? "Plan limit reached." });
        return;
      }
      if (!res.ok || !data?.program) {
        updateWf(wf.id, { status: "error", message: data?.message ?? "Conversion failed." });
        return;
      }

      updateWf(wf.id, {
        status: "done",
        result: {
          programId: data.program.id,
          programName: data.program.name,
          errors: data.validation?.errors?.length ?? 0,
          warnings: data.validation?.warnings?.length ?? 0,
          missing: data.missing_connection_names ?? [],
          manualNotes: data.manual_setup_notes ?? 0,
          gaps: data.coverage?.gaps ?? [],
        },
      });
    } catch {
      updateWf(wf.id, { status: "error", message: "Network error — please retry this workflow." });
    }
  }

  async function startImport() {
    const selected = workflows.filter((w) => w.selected);
    if (selected.length === 0) return;
    setPhase("importing");
    // Reset selected items to pending.
    setWorkflows((prev) => prev.map((w) => (w.selected ? { ...w, status: "pending", message: undefined, result: undefined } : w)));

    const limitReached = { value: false };
    const queue = [...selected];
    let cursor = 0;
    const CONCURRENCY = 2;
    const runners = Array.from({ length: Math.min(CONCURRENCY, queue.length) }, async () => {
      while (cursor < queue.length) {
        const item = queue[cursor++]!;
        // Read the latest selected flag (unchanged here) and import.
        await importOne(item, limitReached);
      }
    });
    await Promise.all(runners);
    setPhase("report");
  }

  // ─── Report aggregation ─────────────────────────────────────────────────────
  const done = workflows.filter((w) => w.status === "done");
  const failed = workflows.filter((w) => w.status === "error");
  const skipped = workflows.filter((w) => w.status === "skipped");
  const reconnectList = useMemo(() => {
    const set = new Set<string>();
    for (const w of done) for (const m of w.result?.missing ?? []) set.add(m);
    return [...set].sort();
  }, [done]);
  const gapList = useMemo(() => {
    const map = new Map<string, string | null>();
    for (const w of done) for (const g of w.result?.gaps ?? []) if (!map.has(g.label)) map.set(g.label, g.suggestion);
    return [...map.entries()].map(([label, suggestion]) => ({ label, suggestion }));
  }, [done]);
  const totalManualNotes = done.reduce((n, w) => n + (w.result?.manualNotes ?? 0), 0);

  return (
    <div className="mx-auto max-w-3xl space-y-6 py-2">
      <div>
        <p className="mb-1 text-sm text-muted-foreground">
          <Link href="/dashboard" className="hover:underline">Dashboard</Link>
          <span className="mx-1">/</span>
          <span>Migrate from Relay</span>
        </p>
        <h1 className="flex items-center gap-2 text-2xl font-semibold">
          <Sparkles className="h-5 w-5 text-primary" />
          Bring your Relay.app workflows over
        </h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Relay is shutting down. Drop your export and we&apos;ll rebuild each workflow here as a draft — run history stays on your machine, only the workflow definitions are read.
        </p>
      </div>

      {/* ── Intake ── */}
      {phase === "intake" && (
        <Card>
          <CardHeader>
            <div className="flex gap-2">
              <Button size="sm" variant={mode === "zip" ? "default" : "outline"} onClick={() => setMode("zip")}>Upload Relay export</Button>
              <Button size="sm" variant={mode === "paste" ? "default" : "outline"} onClick={() => setMode("paste")}>Paste one workflow</Button>
            </div>
          </CardHeader>
          <CardContent className="space-y-4">
            {mode === "zip" ? (
              <>
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="flex w-full flex-col items-center justify-center gap-3 rounded-xl border-2 border-dashed border-border/70 bg-muted/20 px-6 py-12 text-center transition-colors hover:border-primary/50 hover:bg-muted/40"
                >
                  {parsing ? <Loader2 className="h-8 w-8 animate-spin text-primary" /> : <FileArchive className="h-8 w-8 text-muted-foreground" />}
                  <div>
                    <p className="text-sm font-medium">{parsing ? "Reading your export…" : "Drop your Relay export .zip here"}</p>
                    <p className="mt-0.5 text-xs text-muted-foreground">or click to choose — you can also select individual workflow .json files</p>
                  </div>
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".zip,.json,application/zip,application/json"
                  multiple
                  className="hidden"
                  onChange={(e) => handleFiles(e.target.files)}
                />
                <div className="rounded-lg border border-border/60 bg-muted/20 px-3 py-2 text-xs text-muted-foreground">
                  <p className="font-medium text-foreground">How to get your export</p>
                  In Relay, open <span className="font-mono">Export workspace data</span> → download the .zip Relay emails you (the link is valid 48 hours). Then drop it here.
                </div>
              </>
            ) : (
              <div className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="paste-prompt">Build prompt <span className="text-muted-foreground">(Relay → “Copy build prompt”)</span></Label>
                  <Textarea id="paste-prompt" className="min-h-[140px] text-sm" placeholder="Paste the plain-language build prompt Relay generated for the workflow…" value={pasteBuildPrompt} onChange={(e) => setPasteBuildPrompt(e.target.value)} />
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="paste-json">Workflow JSON <span className="text-muted-foreground">(optional — Relay → “Export workflow”)</span></Label>
                  <Textarea id="paste-json" className="min-h-[120px] font-mono text-xs" placeholder='Optionally paste the workflow .json for extra accuracy…' value={pasteJson} onChange={(e) => setPasteJson(e.target.value)} />
                </div>
              </div>
            )}

            {intakeError && (
              <p className="rounded-md border border-destructive/20 bg-destructive/10 px-3 py-2 text-sm text-destructive">{intakeError}</p>
            )}

            {mode === "paste" && (
              <Button onClick={handleAddPasted}>Continue <ArrowRight className="ml-1 h-4 w-4" /></Button>
            )}
          </CardContent>
        </Card>
      )}

      {/* ── Preview / select ── */}
      {phase === "preview" && (
        <div className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{workflows.length} workflow{workflows.length !== 1 ? "s" : ""} found</CardTitle>
              <CardDescription>Pick which to import. Each becomes a draft you review and activate — nothing runs automatically, and you can edit before enabling.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-2.5">
              {workflows.map((wf) => (
                <label key={wf.id} className={`flex cursor-pointer items-start gap-3 rounded-lg border px-3 py-2.5 transition-colors ${wf.selected ? "border-ring/60 bg-accent/40" : "border-border hover:bg-accent/20"}`}>
                  <input type="checkbox" checked={wf.selected} onChange={() => toggle(wf.id)} className="mt-1 h-4 w-4 accent-primary" />
                  <div className="min-w-0 flex-1 space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <p className="truncate text-sm font-medium">{wf.name}</p>
                      <span className="shrink-0 text-xs text-muted-foreground">
                        {wf.preview?.stepCount ? `${wf.preview.stepCount} steps` : wf.buildPrompt ? "from prompt" : "—"}
                      </span>
                    </div>
                    <CoverageChips preview={wf.preview} />
                  </div>
                </label>
              ))}

              {unrecognized.length > 0 && (
                <p className="pt-1 text-xs text-muted-foreground">
                  {unrecognized.length} folder{unrecognized.length !== 1 ? "s" : ""} had no readable workflow file and were skipped: {unrecognized.slice(0, 6).join(", ")}{unrecognized.length > 6 ? "…" : ""}
                </p>
              )}
            </CardContent>
          </Card>

          <div className="flex items-center gap-3">
            <Button disabled={selectedCount === 0} onClick={startImport}>
              Import {selectedCount} workflow{selectedCount !== 1 ? "s" : ""} <ArrowRight className="ml-1 h-4 w-4" />
            </Button>
            <Button variant="outline" onClick={() => { setPhase("intake"); setWorkflows([]); }}>Back</Button>
          </div>
        </div>
      )}

      {/* ── Importing ── */}
      {(phase === "importing" || phase === "report") && (
        <div className="space-y-4">
          {phase === "report" && (
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Migration complete</CardTitle>
                <CardDescription>
                  {done.length} imported{failed.length > 0 ? `, ${failed.length} failed` : ""}{skipped.length > 0 ? `, ${skipped.length} skipped` : ""}. They&apos;re drafts — reconnect the apps below, review, then activate.
                </CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                {reconnectList.length > 0 && (
                  <div className="rounded-lg border border-primary/25 bg-primary/5 p-3">
                    <p className="mb-2 flex items-center gap-1.5 text-sm font-medium"><Plug className="h-4 w-4 text-primary" /> Reconnect your apps</p>
                    <p className="mb-2 text-xs text-muted-foreground">Relay deletes its stored logins, so each app needs reconnecting once. Do it here and every workflow that uses it links up.</p>
                    <div className="flex flex-wrap gap-1.5">
                      {reconnectList.map((name) => (
                        <span key={name} className="rounded-full border border-border bg-background px-2.5 py-1 text-xs">{name}</span>
                      ))}
                    </div>
                    <Button size="sm" className="mt-3" onClick={() => router.push("/connections")}>Go to Connections <ArrowRight className="ml-1 h-3.5 w-3.5" /></Button>
                  </div>
                )}

                {(gapList.length > 0 || totalManualNotes > 0) && (
                  <div className="rounded-lg border border-yellow-500/25 bg-yellow-500/5 p-3 text-xs">
                    <p className="mb-1 flex items-center gap-1.5 text-sm font-medium text-yellow-700 dark:text-yellow-400"><AlertTriangle className="h-4 w-4" /> Needs a manual look</p>
                    {totalManualNotes > 0 && <p className="text-muted-foreground">{totalManualNotes} step{totalManualNotes !== 1 ? "s" : ""} had no direct equivalent and were added as notes in the editor.</p>}
                    {gapList.length > 0 && (
                      <p className="mt-1 text-muted-foreground">
                        Apps without a direct connector: {gapList.map((g) => g.suggestion ? `${g.label} (try ${g.suggestion})` : g.label).join(", ")}.
                      </p>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>
          )}

          <Card>
            <CardHeader>
              <CardTitle className="text-base">{phase === "importing" ? "Importing…" : "Workflows"}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {workflows.filter((w) => w.selected || w.status !== "pending").map((wf) => (
                <div key={wf.id} className="flex items-center justify-between gap-3 rounded-lg border border-border px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-medium">{wf.result?.programName ?? wf.name}</p>
                    {wf.status === "done" && wf.result && (
                      <p className="text-xs text-muted-foreground">
                        {wf.result.errors > 0 ? `${wf.result.errors} error${wf.result.errors !== 1 ? "s" : ""}, ` : ""}
                        {wf.result.warnings} warning{wf.result.warnings !== 1 ? "s" : ""}
                        {wf.result.missing.length > 0 ? ` · ${wf.result.missing.length} to reconnect` : ""}
                        {wf.result.manualNotes > 0 ? ` · ${wf.result.manualNotes} manual note${wf.result.manualNotes !== 1 ? "s" : ""}` : ""}
                      </p>
                    )}
                    {(wf.status === "error" || wf.status === "skipped") && wf.message && (
                      <p className="text-xs text-muted-foreground">{wf.message}</p>
                    )}
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    {wf.status === "converting" && <Loader2 className="h-4 w-4 animate-spin text-primary" />}
                    {wf.status === "pending" && <span className="text-xs text-muted-foreground">queued</span>}
                    {wf.status === "done" && (
                      <>
                        <CheckCircle2 className="h-4 w-4 text-green-600 dark:text-green-400" />
                        <Button size="sm" variant="outline" onClick={() => router.push(`/programs/${wf.result!.programId}`)}>Open</Button>
                      </>
                    )}
                    {wf.status === "error" && <XCircle className="h-4 w-4 text-destructive" />}
                    {wf.status === "skipped" && <AlertTriangle className="h-4 w-4 text-yellow-600 dark:text-yellow-400" />}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {phase === "report" && (
            <div className="flex flex-wrap gap-3">
              <Button onClick={() => router.push("/dashboard")}>Go to dashboard</Button>
              {(failed.length > 0 || skipped.length > 0) && (
                <Button variant="outline" onClick={() => setPhase("preview")}>Back to selection</Button>
              )}
              <Button variant="outline" onClick={() => { setPhase("intake"); setWorkflows([]); setUnrecognized([]); }}>Import more</Button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
