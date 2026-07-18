"use client";

import { useEffect, useRef, useState, Suspense } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { BoltStyleChat, type PlatformModel } from "@/components/ui/bolt-style-chat";
import type { ValidationResult } from "@/lib/validation";
import { TEMPLATES } from "@/lib/templates";
import { writeClientLog } from "@/lib/client-logs";
import { friendlyErrorMessage } from "@/lib/friendly-errors";
import { useGenesisJob } from "@/components/genesis/genesis-job-provider";
import { AiIdentityBadge } from "@/components/ai-transparency";
import { PLATFORM_DEFAULT_MODEL } from "@/lib/genesis/platform-models";

type Connection = {
  id: string;
  name: string;
  provider: string;
  metadata: { email?: string } | null;
  is_valid: boolean;
};

type GenesisError = {
  error: "INSUFFICIENT_DESCRIPTION" | "MISSING_CONNECTIONS" | "SCHEMA_VALIDATION_FAILED" | string;
  message?: string;
  missing?: string[];
  details?: { fieldErrors: Record<string, string[]>; formErrors: string[] };
};

type ApiKey = {
  id: string;
  name: string;
  provider: string;
  is_valid: boolean;
};


type Step = "describe" | "connections" | "model" | "generating" | "result";
type InlinePhase = "idle" | "thinking" | "connections" | "generating" | "opening";

type InlineChatMessage = {
  role: "user" | "assistant";
  text: string;
};

const PROVIDER_LABELS: Record<string, string> = {
  gmail: "Gmail",
  notion: "Notion",
  slack: "Slack",
  github: "GitHub",
  sheets: "Google Sheets",
};

// fix: model-provider display names so the generation loader reflects the selected model
const MODEL_PROVIDER_LABELS: Record<string, string> = {
  anthropic: "Claude",
  openai: "GPT",
  google: "Gemini",
  groq: "Llama (Groq)",
  mistral: "Mistral",
  openrouter: "OpenRouter",
  cohere: "Command",
};

const GENERATION_THINKING_UPDATES = [
  "Turning the prompt into concrete workflow requirements...",
  "Choosing the trigger, execution mode, and node sequence...",
  "Mapping app actions, agent steps, and data handoffs...",
  "Checking selected connections against required access...",
  "Generating the program schema...",
  "Validating the graph and normalizing details...",
  "Saving the generated program...",
];

const REFINEMENT_THINKING_UPDATES = [
  "Reading the existing program and your requested change...",
  "Finding the smallest graph update that satisfies the refinement...",
  "Regenerating the schema while preserving unchanged steps...",
  "Validating and saving the refined program...",
];

function getGenesisErrorMessage(payload: unknown, fallback: string) {
  if (payload && typeof payload === "object") {
    const record = payload as Record<string, unknown>;
    if (typeof record.message === "string") return friendlyErrorMessage(record.message, fallback);
    if (typeof record.error === "string") return friendlyErrorMessage(record.error, fallback);
  }

  if (payload instanceof Error) return friendlyErrorMessage(payload.message, fallback);
  return fallback;
}

function recordClientGenesisFailure(input: {
  mode: "generation" | "refinement";
  description: string;
  model: string;
  connectionCount: number;
  durationMs: number;
  responseStatus?: number;
  payload?: unknown;
  error?: unknown;
}) {
  const message = getGenesisErrorMessage(
    input.payload ?? input.error,
    input.mode === "refinement" ? "Program refinement failed." : "Program generation failed."
  );

  writeClientLog({
    level: "error",
    source: "Genesis",
    event: `genesis.${input.mode}.client_failed`,
    status: "failed",
    message,
    durationMs: input.durationMs,
    details: {
      mode: input.mode,
      model: input.model,
      connection_count: input.connectionCount,
      response_status: input.responseStatus ?? null,
      description: input.description.slice(0, 1000),
      payload: input.payload ?? null,
      error: input.error instanceof Error ? { name: input.error.name, message: input.error.message } : input.error ?? null,
      storage: "browser fallback",
    },
  });
}

async function readJsonSafely(response: Response) {
  return response.json().catch(() => ({
    error: "INVALID_RESPONSE",
    message: "Genesis returned a response that could not be parsed as JSON.",
  }));
}

const DESCRIPTION_MAX_LENGTH = 2000;

// Emoji- or symbol-only prompts pass a raw length check but give the model
// nothing actionable — require at least a few letters or digits.
function hasMeaningfulText(text: string): boolean {
  const wordChars = text.match(/[\p{L}\p{N}]/gu);
  return (wordChars?.length ?? 0) >= 5;
}

function describeInputProblem(text: string): string | null {
  if (text.length < 10 || !hasMeaningfulText(text)) {
    return "Please describe your workflow in words — what should trigger it, and what should happen?";
  }
  if (text.length > DESCRIPTION_MAX_LENGTH) {
    return `Your description is ${text.length.toLocaleString("en-US")} characters — the limit is ${DESCRIPTION_MAX_LENGTH.toLocaleString("en-US")}. Please shorten it and try again.`;
  }
  return null;
}

function NewProgramPageInner() {
  const router = useRouter();
  const { start: startGenesisJob } = useGenesisJob();
  const searchParams = useSearchParams();
  const progressTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [step, setStep] = useState<Step>("describe");
  const [generationThoughts, setGenerationThoughts] = useState<string[]>([]);
  const [generatingMessage, setGeneratingMessage] = useState("Generating your program...");
  const [description, setDescription] = useState(searchParams.get("prompt") ?? "");
  const [connections, setConnections] = useState<Connection[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [genesisError, setGenesisError] = useState<GenesisError | null>(null);
  const [validationResult, setValidationResult] = useState<ValidationResult | null>(null);
  const [apiKeys, setApiKeys] = useState<ApiKey[]>([]);
  const [loadingKeys, setLoadingKeys] = useState(false);
  const [selectedKeyId, setSelectedKeyId] = useState<string | null>(null);
  const [model, setModel] = useState("");
  const [programId, setProgramId] = useState<string | null>(null);
  const [programName, setProgramName] = useState<string>("");
  // Stored schema returned from genesis — used as input to the refinement call
  const [generatedSchema, setGeneratedSchema] = useState<unknown>(null);
  // Refinement loop state
  const [refinement, setRefinement] = useState("");
  const [isRefining, setIsRefining] = useState(false);
  const [refinementError, setRefinementError] = useState<string | null>(null);
  const [wasRefined, setWasRefined] = useState(false);
  // Template import state
  const [importingTemplateId, setImportingTemplateId] = useState<string | null>(null);
  const [inlinePhase, setInlinePhase] = useState<InlinePhase>("idle");
  const [inlineMessages, setInlineMessages] = useState<InlineChatMessage[]>([]);
  const [connectionsOpen, setConnectionsOpen] = useState(false);
  const [isCreatingScratch, setIsCreatingScratch] = useState(false);
  const [scratchCreateError, setScratchCreateError] = useState<string | null>(null);
  const connectionsPopoverRef = useRef<HTMLDivElement | null>(null);
  // Resolves with the initial connection ids so a submit that races the load
  // still grants access; set to true once the user customizes the selection.
  const connectionsLoadRef = useRef<Promise<string[]>>(Promise.resolve([]));
  const connectionsTouchedRef = useRef(false);
  // Platform model picker — loaded on mount, shown in BoltStyleChat bottom bar
  const [platformModels, setPlatformModels] = useState<PlatformModel[]>([]);
  const [selectedPlatformModel, setSelectedPlatformModel] = useState<string>(PLATFORM_DEFAULT_MODEL);
  // True once the user explicitly picks a model in the platform picker. When set,
  // generation uses the platform key with that model instead of silently
  // preferring an auto-selected BYOK key (which ignored the picker entirely).
  const [platformModelChosen, setPlatformModelChosen] = useState(false);
  // Genesis V2 (dev-gated): toggle shown only when the server reports access.
  const [v2Available, setV2Available] = useState(false);
  const [useV2, setUseV2] = useState(false);

  useEffect(() => {
    if (!connectionsOpen) return;
    const handler = (e: MouseEvent) => {
      if (connectionsPopoverRef.current && !connectionsPopoverRef.current.contains(e.target as Node)) {
        setConnectionsOpen(false);
      }
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setConnectionsOpen(false);
    };
    document.addEventListener("mousedown", handler);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", handler);
      document.removeEventListener("keydown", esc);
    };
  }, [connectionsOpen]);

  useEffect(() => {
    const previousBodyOverflow = document.body.style.overflow;
    const previousHtmlOverflow = document.documentElement.style.overflow;
    document.body.style.overflow = "hidden";
    document.documentElement.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousBodyOverflow;
      document.documentElement.style.overflow = previousHtmlOverflow;
    };
  }, []);

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) {
        clearInterval(progressTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    connectionsLoadRef.current = fetch("/api/connections")
      .then((r) => r.json())
      .then((data) => {
        const valid = data.filter((c: Connection) => c.is_valid);
        setConnections(valid);
        const ids = valid.map((c: Connection) => c.id);
        setSelectedIds(new Set(ids));
        setLoadingConnections(false);
        return ids;
      })
      .catch(() => {
        setLoadingConnections(false);
        return [] as string[];
      });
  }, []);

  // Fetch available platform models once on mount
  useEffect(() => {
    fetch("/api/genesis/models")
      .then((r) => r.ok ? r.json() : null)
      .then((data) => {
        if (!data) return;
        const models = (data.models ?? []) as PlatformModel[];
        setPlatformModels(models);
        setSelectedPlatformModel(data.defaultModel ?? PLATFORM_DEFAULT_MODEL);
        setV2Available(data.v2Available === true);
      })
      .catch(() => { /* non-fatal — stays on default free model */ });
  }, []);

  const DEFAULT_MODELS: Record<string, string> = {
    anthropic: "claude-sonnet-4-6",
    openai: "gpt-4o",
    google: "gemini-1.5-pro",
    groq: "llama-3.3-70b-versatile",
    mistral: "mistral-large-latest",
    openrouter: "openai/gpt-oss-120b",
  };

  // Providers ranked by Genesis suitability (large prompt support, reliability)
  const PROVIDER_PRIORITY: Record<string, number> = {
    anthropic: 0,
    openai: 1,
    openrouter: 2,
    mistral: 3,
    google: 4,
    groq: 5,
  };

  function bestKey(keys: ApiKey[]): ApiKey | undefined {
    return [...keys].sort(
      (a, b) => (PROVIDER_PRIORITY[a.provider] ?? 99) - (PROVIDER_PRIORITY[b.provider] ?? 99)
    )[0];
  }

  async function loadApiKeys() {
    setLoadingKeys(true);
    const res = await fetch("/api/keys");
    if (res.ok) {
      const data: ApiKey[] = await res.json();
      const valid = data.filter((k) => k.is_valid);
      setApiKeys(valid);
      const best = bestKey(valid);
      if (best) {
        setSelectedKeyId(best.id);
        setModel(DEFAULT_MODELS[best.provider] ?? "");
      }
    }
    setLoadingKeys(false);
  }

  function toggleConnection(id: string) {
    connectionsTouchedRef.current = true;
    setSelectedIds((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  }

  function stopThinkingProgress() {
    if (progressTimerRef.current) {
      clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
  }

  function appendInlineAssistantMessage(text: string) {
    setInlineMessages((prev) => [...prev, { role: "assistant", text }]);
  }

  function startThinkingProgress(options?: { inline?: boolean; refinement?: boolean }) {
    stopThinkingProgress();

    const updates = options?.refinement ? REFINEMENT_THINKING_UPDATES : GENERATION_THINKING_UPDATES;
    let index = 0;

    if (!options?.inline) {
      setGenerationThoughts([]);
    }

    const pushUpdate = () => {
      const update = updates[index];
      if (!update) {
        stopThinkingProgress();
        return;
      }

      if (options?.inline) {
        appendInlineAssistantMessage(update);
      } else {
        setGenerationThoughts((prev) => [...prev, update]);
      }

      index += 1;
    };

    pushUpdate();
    progressTimerRef.current = setInterval(pushUpdate, 1300);
  }

  async function handleGenerate(overrides?: { description?: string; keyId?: string; modelId?: string }) {
    const descriptionToUse = overrides?.description ?? description;
    const keyIdToUse = overrides?.keyId ?? selectedKeyId;
    const modelToUse = (overrides?.modelId ?? model).trim();

    if (!keyIdToUse || !modelToUse || descriptionToUse.trim().length < 10) {
      return;
    }

    setStep("generating");
    setGenesisError(null);
    setWasRefined(false);
    setGeneratingMessage("Generating your program...");
    startThinkingProgress();
    const startedAt = Date.now();

    let res: Response;
    try {
      res = await fetch("/api/genesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description: descriptionToUse,
          connection_ids: [...selectedIds],
          api_key_id: keyIdToUse,
          model: modelToUse,
          ...(v2Available && useV2 ? { genesis_v2: true } : {}),
        }),
      });
    } catch (error) {
      stopThinkingProgress();
      recordClientGenesisFailure({
        mode: "generation",
        description: descriptionToUse,
        model: modelToUse,
        connectionCount: selectedIds.size,
        durationMs: Date.now() - startedAt,
        error,
      });
      setGenesisError({
        error: "NETWORK_ERROR",
        message: getGenesisErrorMessage(error, "Generation failed before the server returned a response."),
      });
      setStep("result");
      return;
    }

    const data = await readJsonSafely(res);
    stopThinkingProgress();

    if (!res.ok) {
      recordClientGenesisFailure({
        mode: "generation",
        description: descriptionToUse,
        model: modelToUse,
        connectionCount: selectedIds.size,
        durationMs: Date.now() - startedAt,
        responseStatus: res.status,
        payload: data,
      });
      if (data.error) {
        setGenesisError(data);
      } else {
        setGenesisError({ error: "INSUFFICIENT_DESCRIPTION", message: data.error ?? "Unknown error" });
      }
      setStep("result");
      return;
    }

    setProgramId(data.program.id);
    setProgramName(data.program.name);
    setValidationResult(data.validation);
    setGeneratedSchema(data.schema);
    setGeneratingMessage(`Opening ${data.program.name}...`);
    setGenerationThoughts((prev) => [
      ...prev,
      `Program "${data.program.name}" is ready. Opening it now...`,
    ]);
    router.push(`/programs/${data.program.id}`);
  }

  async function handleRefine() {
    if (!programId || !generatedSchema || !refinement.trim()) return;
    setIsRefining(true);
    setRefinementError(null);
    setStep("generating");
    setGeneratingMessage("Refining your program...");
    startThinkingProgress({ refinement: true });
    const startedAt = Date.now();

    let res: Response;
    try {
      res = await fetch("/api/genesis", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          description,
          connection_ids: [...selectedIds],
          api_key_id: selectedKeyId,
          model: model.trim(),
          existing_schema: generatedSchema,
          refinement: refinement.trim(),
          existing_program_id: programId,
        }),
      });
    } catch (error) {
      stopThinkingProgress();
      recordClientGenesisFailure({
        mode: "refinement",
        description,
        model: model.trim(),
        connectionCount: selectedIds.size,
        durationMs: Date.now() - startedAt,
        error,
      });
      setRefinementError(getGenesisErrorMessage(error, "Refinement failed before the server returned a response."));
      setIsRefining(false);
      setStep("result");
      return;
    }

    const data = await readJsonSafely(res);
    stopThinkingProgress();

    if (!res.ok) {
      recordClientGenesisFailure({
        mode: "refinement",
        description,
        model: model.trim(),
        connectionCount: selectedIds.size,
        durationMs: Date.now() - startedAt,
        responseStatus: res.status,
        payload: data,
      });
      const msg = getGenesisErrorMessage(data, "The requested change did not work. Please try again.");
      setRefinementError(msg);
      setIsRefining(false);
      setStep("result");
      return;
    }

    setProgramName(data.program.name);
    setValidationResult(data.validation);
    setGeneratedSchema(data.schema);
    setRefinement("");
    setWasRefined(true);
    setIsRefining(false);
    setStep("result");
  }

  async function handleImportTemplate(templateId: string) {
    const template = TEMPLATES.find((t) => t.id === templateId);
    if (!template) return;
    setImportingTemplateId(templateId);

    try {
      const res = await fetch("/api/programs/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ schema: template.schema }),
      });

      const data = await res.json();
      if (!res.ok) {
        console.error("[template import] failed:", data);
        return;
      }
      router.push(`/programs/${(data.program as { id: string }).id}`);
    } catch {
      // Fall through — user stays on page
    } finally {
      setImportingTemplateId(null);
    }
  }

  async function handleCreateBlankProgram() {
    setScratchCreateError(null);
    setIsCreatingScratch(true);
    setInlinePhase("opening");

    let res: Response;
    try {
      res = await fetch("/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "blank" }),
      });
    } catch (error) {
      setScratchCreateError(getGenesisErrorMessage(error, "Failed to create a blank program."));
      setInlinePhase("idle");
      setIsCreatingScratch(false);
      return;
    }

    const data = await readJsonSafely(res);
    if (!res.ok) {
      setScratchCreateError(getGenesisErrorMessage(data, "Failed to create a blank program."));
      setInlinePhase("idle");
      setIsCreatingScratch(false);
      return;
    }

    router.push(`/programs/${data.program.id}/editor`);
  }

  const errorCount = validationResult?.errors.length ?? 0;
  const warningCount = validationResult?.warnings.length ?? 0;

  const runInlineBuild = async (message: string) => {
    const trimmedMessage = message.trim();
    const inputProblem = describeInputProblem(trimmedMessage);
    if (inputProblem) {
      setInlineMessages([
        { role: "user", text: trimmedMessage },
        { role: "assistant", text: inputProblem },
      ]);
      return;
    }

    setDescription(trimmedMessage);
    setInlineMessages([{ role: "user", text: trimmedMessage }]);
    // Start generation right away — no scripted planning messages, no
    // connections confirmation step. All valid connections are granted by
    // default and Genesis picks what it needs.
    await handleInlineGenerate(trimmedMessage);
  };

  const runInlinePlan = async (message: string) => {
    const trimmedMessage = message.trim();
    const inputProblem = describeInputProblem(trimmedMessage);
    if (inputProblem) {
      setInlineMessages([
        { role: "user", text: trimmedMessage },
        { role: "assistant", text: inputProblem },
      ]);
      return;
    }

    setDescription(trimmedMessage);
    setInlineMessages([{ role: "user", text: trimmedMessage }]);
    setInlinePhase("thinking");

    await new Promise((resolve) => setTimeout(resolve, 450));

    const lower = trimmedMessage.toLowerCase();
    const trigger =
      lower.includes("webhook") ? "Webhook trigger" :
      lower.includes("email") || lower.includes("gmail") ? "Email trigger" :
      lower.includes("schedule") || lower.includes("daily") || lower.includes("morning") ? "Scheduled trigger" :
      "Manual or app event trigger";
    const actions = [
      lower.includes("slack") ? "send a Slack update" : null,
      lower.includes("notion") ? "write structured data to Notion" : null,
      lower.includes("sheet") ? "append rows to a spreadsheet" : null,
      lower.includes("github") ? "create or update GitHub work items" : null,
    ].filter(Boolean);

    const goalSummary =
      trimmedMessage.length > 120 ? `${trimmedMessage.slice(0, 117)}...` : trimmedMessage;

    appendInlineAssistantMessage(
      [
        `Plan for: "${goalSummary}"`,
        `1. Start with a ${trigger.toLowerCase()} that captures the initial payload.`,
        "2. Add a transform step to normalize the incoming data into fields the rest of the workflow can trust.",
        actions.length > 0
          ? `3. Add action nodes to ${actions.join(" and ")}.`
          : "3. Add the app/action nodes needed for the external side effects.",
        "4. Add validation and error-handling branches for missing or malformed data.",
        "5. Generate the draft, review validation warnings, then run once with a sample payload.",
      ].join("\n")
    );
    setInlinePhase("connections");
  };

  const navigateImportSource = (source: string) => {
    router.push(source === "browse" ? "/browse" : "/programs/import");
  };

  const handleInlineGenerate = async (descriptionOverride?: string) => {
    const descriptionToUse = (descriptionOverride ?? description).trim();
    const inputProblem = describeInputProblem(descriptionToUse);
    if (inputProblem) {
      setInlineMessages((prev) => [
        ...prev,
        { role: "assistant", text: inputProblem },
      ]);
      return;
    }

    setInlinePhase("generating");

    // The inline chat is platform-first: by default use the platform key + the
    // selected platform model. Use a personal (BYOK) key ONLY when the user
    // explicitly chose one via the key selector (selectedKeyId is set only then,
    // not on mount) and hasn't picked a platform model.
    const selection: { keyId: string; modelId: string } | null =
      !platformModelChosen && selectedKeyId && model.trim()
        ? { keyId: selectedKeyId, modelId: model.trim() }
        : null;

    // Honor the user's last-chosen layout orientation (set via the editor's
    // Auto-layout control). Defaults to horizontal when unset.
    const storedDirection =
      typeof window !== "undefined"
        ? window.localStorage.getItem("flowos.layoutDirection")
        : null;
    const layout_direction: "horizontal" | "vertical" =
      storedDirection === "vertical" ? "vertical" : "horizontal";

    // If the user customized the selection, honor it; otherwise wait for the
    // initial load so a fast submit still grants all valid connections.
    const loadedIds = await connectionsLoadRef.current;
    const connectionIds = connectionsTouchedRef.current ? [...selectedIds] : loadedIds;

    // Genesis V2 opt-in — only meaningful for dev users; server gates regardless.
    const v2Field = v2Available && useV2 ? { genesis_v2: true as const } : {};

    const payload = selection
      ? {
          description: descriptionToUse,
          connection_ids: connectionIds,
          api_key_id: selection.keyId,
          model: selection.modelId,
          layout_direction,
          ...v2Field,
        }
      : {
          description: descriptionToUse,
          connection_ids: connectionIds,
          use_platform_key: true as const,
          // Include the chosen platform model (may be non-default for paid tiers)
          model: selectedPlatformModel,
          layout_direction,
          ...v2Field,
        };

    // Hand the job to the app-wide provider so it keeps running even if the user
    // leaves the building page to do something else; they'll be notified on done.
    startGenesisJob(payload);
    router.push("/programs/new/building");
  };

  const chatFeed = (
    <div className="space-y-3 rounded-2xl border border-border/50 bg-background/55 p-4 backdrop-blur-md shadow-sm">
      {inlineMessages.length === 0 ? (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Describe your program and click Build now, or skip AI and open a blank workflow in the editor.
          </p>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={isCreatingScratch}
              onClick={() => { void handleCreateBlankProgram(); }}
              className="flex items-center gap-1.5 rounded-full border glass-card px-4 py-1.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground active:scale-95 disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreatingScratch ? "Opening editor..." : "Start from scratch"}
            </button>
            <button
              type="button"
              onClick={() => navigateImportSource("browse")}
              className="flex items-center gap-1.5 rounded-full border glass-card px-4 py-1.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground active:scale-95"
            >
              Browse
            </button>
            <button
              type="button"
              onClick={() => navigateImportSource("json")}
              className="flex items-center gap-1.5 rounded-full border glass-card px-4 py-1.5 text-sm font-medium text-muted-foreground transition-all duration-200 hover:bg-muted hover:text-foreground active:scale-95"
            >
              Import
            </button>
            <button
              type="button"
              onClick={() => router.push("/migrate/relay")}
              className="flex items-center gap-1.5 rounded-full border border-primary/40 bg-primary/5 px-4 py-1.5 text-sm font-medium text-primary transition-all duration-200 hover:bg-primary/10 active:scale-95"
            >
              From Relay.app
            </button>
          </div>
          {scratchCreateError && (
            <p className="text-xs text-red-300">{scratchCreateError}</p>
          )}
          {v2Available && (
            <button
              type="button"
              onClick={() => setUseV2((v) => !v)}
              aria-pressed={useV2}
              className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium transition-all duration-200 ${
                useV2
                  ? "border-primary/50 bg-primary/10 text-primary"
                  : "border-border/60 bg-background/40 text-muted-foreground hover:text-foreground"
              }`}
            >
              <span
                className={`inline-flex h-4 w-7 shrink-0 items-center rounded-full p-0.5 transition-colors ${
                  useV2 ? "bg-primary" : "bg-muted-foreground/30"
                }`}
              >
                <span
                  className={`h-3 w-3 rounded-full bg-white transition-transform ${
                    useV2 ? "translate-x-3" : "translate-x-0"
                  }`}
                />
              </span>
              <span>
                Genesis V2 <span className="opacity-60">· dev · live introspection, patch edits, clarifying questions</span>
              </span>
            </button>
          )}
        </div>
      ) : (
        <div className="max-h-[300px] space-y-3 overflow-y-auto pr-1">
          {inlineMessages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={`max-w-[92%] whitespace-pre-wrap rounded-xl px-3 py-2 text-sm animate-in fade-in slide-in-from-bottom-2 duration-300 ${
                message.role === "user"
                  ? "ml-auto bg-primary/20 text-primary"
                  : "bg-muted/60 text-foreground"
              }`}
            >
              {message.role === "assistant" && (
                <AiIdentityBadge label="Genesis AI" className="mb-1.5" />
              )}
              <span className={message.role === "assistant" ? "block" : undefined}>
                {message.text}
              </span>
            </div>
          ))}
        </div>
      )}

      {(inlinePhase === "thinking" || inlinePhase === "generating" || inlinePhase === "opening") && (
        <div className="inline-flex items-center gap-2 rounded-xl bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
          <Spinner />
          {inlinePhase === "thinking" ? "Thinking..." : inlinePhase === "opening" ? "Opening..." : "Generating..."}
        </div>
      )}

      {inlinePhase === "connections" && (
        <div className="space-y-3 rounded-xl border border-border bg-background/80 p-3">
          {loadingConnections ? (
            <p className="text-sm text-muted-foreground">Loading available connections...</p>
          ) : connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              No connections found. You can continue without connections, or add some in Connections.
            </p>
          ) : (
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm text-muted-foreground">
                Using <span className="font-medium text-foreground">{selectedIds.size}</span> of {connections.length} connections. Genesis will pick what it needs.
              </p>
              <div className="relative" ref={connectionsPopoverRef}>
                <button
                  type="button"
                  onClick={() => setConnectionsOpen((v) => !v)}
                  className="text-xs font-medium text-primary hover:underline"
                >
                  Customize
                </button>
                {connectionsOpen && (
                  <div className="absolute right-0 top-full z-20 mt-2 w-72 rounded-lg border border-border bg-popover p-3 shadow-lg">
                    <div className="mb-2 flex items-center justify-between">
                      <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Connections</p>
                      <div className="flex gap-2 text-xs">
                        <button
                          type="button"
                          onClick={() => {
                            connectionsTouchedRef.current = true;
                            setSelectedIds(new Set(connections.map((c) => c.id)));
                          }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          All
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            connectionsTouchedRef.current = true;
                            setSelectedIds(new Set());
                          }}
                          className="text-muted-foreground hover:text-foreground"
                        >
                          None
                        </button>
                      </div>
                    </div>
                    <div className="flex flex-wrap gap-1.5 max-h-56 overflow-y-auto">
                      {connections.map((conn) => {
                        const selected = selectedIds.has(conn.id);
                        return (
                          <button
                            key={conn.id}
                            type="button"
                            onClick={() => toggleConnection(conn.id)}
                            className={`rounded-full border px-2.5 py-1 text-xs transition-colors ${
                              selected
                                ? "border-primary bg-primary/20 text-primary"
                                : "border-border bg-muted/40 text-muted-foreground hover:border-border/80 hover:text-foreground"
                            }`}
                          >
                            {conn.name || PROVIDER_LABELS[conn.provider] || conn.provider}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-wrap gap-2 pt-1">
            <Button
              size="sm"
              disabled={isCreatingScratch}
              onClick={() => { void handleInlineGenerate(); }}
            >
              Generate Program
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={isCreatingScratch}
              onClick={() => { void handleCreateBlankProgram(); }}
            >
              {isCreatingScratch ? "Opening editor..." : "Start from scratch"}
            </Button>
            <Button size="sm" variant="outline" onClick={() => router.push("/connections")}>
              Manage Connections
            </Button>
            {programId && (
              <Button size="sm" variant="outline" onClick={() => router.push(`/programs/${programId}`)}>
                Open Program
              </Button>
            )}
          </div>

          {genesisError?.message && (
            <p className="text-xs text-red-300">{genesisError.message}</p>
          )}
          {scratchCreateError && (
            <p className="text-xs text-red-300">{scratchCreateError}</p>
          )}
        </div>
      )}
    </div>
  );

  if (step === "describe") {
    return (
      <div className="relative left-1/2 right-1/2 -ml-[50vw] -mr-[50vw] -mt-6 w-screen lg:-mt-8">
        <BoltStyleChat
          title="What will you"
          subtitle="Create powerful workflows by chatting with AI."
          announcementText="New Program Builder"
          placeholder="Describe the workflow you want to automate..."
          initialMessage=""
          chatFeed={chatFeed}
          inputDisabled={inlinePhase === "thinking" || inlinePhase === "generating" || inlinePhase === "opening"}
          hideHero={inlineMessages.length > 0 || inlinePhase !== "idle"}
          onSend={(message) => { void runInlineBuild(message); }}
          onPlan={(message) => { void runInlinePlan(message); }}
          onImport={navigateImportSource}
          availableModels={platformModels}
          selectedModelId={selectedPlatformModel}
          onModelChange={(id) => { setSelectedPlatformModel(id); setPlatformModelChosen(true); }}
        />
      </div>
    );
  }

  const renderedStep = step as Step;

  return (
    <div className="max-w-2xl space-y-6">
      {/* Step: Describe */}
      {renderedStep === "describe" && (
        <>
          <div>
            <h1 className="text-xl font-semibold">New program</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Describe what you want to automate. Be specific about inputs, outputs, and any conditions.
            </p>
          </div>

          {/* ── Templates section ── */}
          <div className="space-y-3">
            <p className="text-sm font-medium">Start from a template</p>
            <div className="grid grid-cols-2 gap-3">
              {TEMPLATES.map((template) => {
                const isLoading = importingTemplateId === template.id;
                return (
                  <button
                    key={template.id}
                    disabled={importingTemplateId !== null}
                    onClick={() => handleImportTemplate(template.id)}
                    className="text-left rounded-lg border border-border px-4 py-3 hover:bg-accent/60 transition-colors disabled:opacity-50 disabled:cursor-not-allowed space-y-1.5"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium leading-tight">{template.name}</p>
                      {isLoading && <Spinner />}
                    </div>
                    <p className="text-xs text-muted-foreground leading-snug line-clamp-2">
                      {template.description}
                    </p>
                    <div className="flex flex-wrap gap-1 pt-0.5">
                      {template.tags.map((tag) => (
                        <Badge key={tag} variant="secondary" className="text-[10px] px-1.5 py-0">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  </button>
                );
              })}
            </div>

            <div className="relative flex items-center">
              <div className="flex-1 border-t border-border" />
              <span className="px-3 text-xs text-muted-foreground bg-background">or describe your own</span>
              <div className="flex-1 border-t border-border" />
            </div>
          </div>

          {/* ── Description textarea ── */}
          <div className="space-y-2">
            <Textarea
              className="min-h-[160px] text-sm"
              placeholder={`Example: "Every morning at 8am, check my Gmail for emails with invoices, extract the amount and sender, save them to a Notion database called 'Invoices', and send me a Slack summary of what was added."`}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              maxLength={DESCRIPTION_MAX_LENGTH}
            />
            <p className="text-xs text-muted-foreground">
              {description.length}/{DESCRIPTION_MAX_LENGTH} characters
            </p>
          </div>

          <Button
            disabled={description.trim().length < 10}
            onClick={() => setStep("connections")}
          >
            Continue →
          </Button>
        </>
      )}

      {/* Step: Select connections */}
      {step === "connections" && (
        <>
          <div>
            <h1 className="text-xl font-semibold">Select connections</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Choose which connected apps this program can access.
            </p>
          </div>

          {loadingConnections ? (
            <p className="text-sm text-muted-foreground">Loading connections…</p>
          ) : connections.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  No connections yet. You can still generate without them, or add connections first.
                </p>
                <Button variant="outline" size="sm" onClick={() => router.push("/connections")}>
                  Add connections
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {connections.map((conn) => (
                <button
                  key={conn.id}
                  onClick={() => toggleConnection(conn.id)}
                  className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                    selectedIds.has(conn.id)
                      ? "border-ring bg-accent"
                      : "border-border hover:bg-accent/50"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium">{conn.name || PROVIDER_LABELS[conn.provider] || conn.provider}</p>
                    <p className="text-xs text-muted-foreground">
                      {PROVIDER_LABELS[conn.provider] ?? conn.provider}
                      {conn.metadata?.email && <> · {conn.metadata.email}</>}
                    </p>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border-2 transition-colors ${
                      selectedIds.has(conn.id) ? "border-ring bg-ring" : "border-muted-foreground"
                    }`}
                  />
                </button>
              ))}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep("describe")}>
              ← Back
            </Button>
            <Button onClick={() => { loadApiKeys(); setStep("model"); }}>
              Continue →
            </Button>
          </div>
        </>
      )}

      {/* Step: Select model / API key */}
      {step === "model" && (
        <>
          <div>
            <h1 className="text-xl font-semibold">Choose a model</h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              Select which API key to use for generating this program.
            </p>
          </div>

          {loadingKeys ? (
            <p className="text-sm text-muted-foreground">Loading keys…</p>
          ) : apiKeys.length === 0 ? (
            <Card>
              <CardContent className="py-8 text-center space-y-3">
                <p className="text-sm text-muted-foreground">
                  No API keys yet. Add one to generate programs.
                </p>
                <Button variant="outline" size="sm" onClick={() => router.push("/api-keys")}>
                  Add API key
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="space-y-2">
              {apiKeys.map((k) => (
                <button
                  key={k.id}
                  onClick={() => { setSelectedKeyId(k.id); setModel(DEFAULT_MODELS[k.provider] ?? ""); }}
                  className={`w-full flex items-center justify-between rounded-lg border px-4 py-3 text-left transition-colors ${
                    selectedKeyId === k.id
                      ? "border-ring bg-accent"
                      : "border-border hover:bg-accent/50"
                  }`}
                >
                  <div>
                    <p className="text-sm font-medium">{k.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{k.provider}</p>
                  </div>
                  <div
                    className={`w-4 h-4 rounded-full border-2 transition-colors ${
                      selectedKeyId === k.id ? "border-ring bg-ring" : "border-muted-foreground"
                    }`}
                  />
                </button>
              ))}
              {selectedKeyId && (
                <div className="pt-2">
                  <Label htmlFor="model">Model</Label>
                  <Input
                    id="model"
                    className="mt-1"
                    placeholder="e.g. claude-sonnet-4-6 or anthropic/claude-sonnet-4.6"
                    value={model}
                    onChange={(e) => setModel(e.target.value)}
                  />
                  <p className="text-xs text-muted-foreground mt-1">
                    For OpenRouter use format: <span className="font-mono">anthropic/claude-sonnet-4.6</span>
                  </p>
                </div>
              )}
            </div>
          )}

          <div className="flex gap-3">
            <Button variant="outline" onClick={() => setStep("connections")}>
              ← Back
            </Button>
            <Button disabled={!selectedKeyId || !model.trim()} onClick={() => { void handleGenerate(); }}>
              Generate program
            </Button>
          </div>
        </>
      )}

      {/* Generating / Refining */}
      {step === "generating" && (() => {
        // fix: use the selected model's provider label instead of hardcoded "Claude"
        const selectedKey = apiKeys.find((k) => k.id === selectedKeyId);
        const modelDisplay =
          (selectedKey && MODEL_PROVIDER_LABELS[selectedKey.provider]) ||
          model.trim() ||
          "The model";
        return (
          <div className="py-20 text-center space-y-3">
            <div className="inline-flex items-center gap-2 text-sm text-muted-foreground">
              <Spinner />
              {generatingMessage}
            </div>
            {generationThoughts.length > 0 && (
              <div className="mx-auto mt-5 max-w-md space-y-2 rounded-lg border glass-card p-4 text-left">
                <p className="text-xs font-semibold uppercase text-muted-foreground">Thinking through the build</p>
                <div className="space-y-2">
                  {generationThoughts.map((thought, index) => (
                    <div key={`${thought}-${index}`} className="flex gap-2 text-sm text-muted-foreground">
                      <span className="mt-1 h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
                      <span>{thought}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
            <p className="text-xs text-muted-foreground">
              {modelDisplay} is designing the graph schema. This usually takes about 1 minute.
            </p>
          </div>
        );
      })()}

      {/* Result */}
      {step === "result" && (
        <>
          {genesisError ? (
            <div className="space-y-4">
              <div className="rounded-md bg-destructive/10 border border-destructive/20 text-destructive px-4 py-3 text-sm space-y-1">
                <p className="font-medium">
                  {genesisError.error === "INSUFFICIENT_DESCRIPTION" ? "Description too vague"
                    : genesisError.error === "MISSING_CONNECTIONS" ? "Missing connections"
                    : genesisError.error === "SCHEMA_VALIDATION_FAILED" ? "Schema validation failed"
                    : genesisError.error === "PROGRAM_LIMIT_REACHED" ? "Program limit reached"
                    : "Generation failed"}
                </p>
                {genesisError.message && <p>{genesisError.message}</p>}
                {genesisError.error === "PROGRAM_LIMIT_REACHED" && (
                  <p><Link href="/plan" className="underline font-medium">View plans →</Link></p>
                )}
                {!genesisError.message && genesisError.error !== "INSUFFICIENT_DESCRIPTION" && genesisError.error !== "MISSING_CONNECTIONS" && genesisError.error !== "SCHEMA_VALIDATION_FAILED" && (
                  <p>{genesisError.error}</p>
                )}
                {genesisError.missing && (
                  <p>Required: {genesisError.missing.join(", ")}</p>
                )}
                {genesisError.details && (
                  <div className="mt-1 space-y-0.5 text-xs opacity-80">
                    {genesisError.details.formErrors.map((e, i) => <p key={i}>{e}</p>)}
                    {Object.entries(genesisError.details.fieldErrors).slice(0, 5).map(([field, errs]) => (
                      <p key={field}><span className="font-mono">{field}</span>: {(errs as string[]).join(", ")}</p>
                    ))}
                  </div>
                )}
              </div>
              <Button variant="outline" onClick={() => setStep("describe")}>
                ← Try again
              </Button>
            </div>
          ) : (
            <div className="space-y-6">
              <div>
                <div className="flex items-center gap-2">
                  <h1 className="text-xl font-semibold">{programName}</h1>
                  <AiIdentityBadge label="Genesis AI" />
                  {wasRefined && (
                    <Badge variant="secondary" className="text-xs">
                      Refined ✓
                    </Badge>
                  )}
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">Program generated successfully.</p>
              </div>

              {validationResult && (errorCount > 0 || warningCount > 0) && (
                <div className="rounded-md border border-border p-4 space-y-2">
                  <p className="text-sm font-medium">Validation</p>
                  <div className="flex gap-2">
                    {errorCount > 0 && (
                      <Badge variant="destructive">{errorCount} error{errorCount !== 1 ? "s" : ""}</Badge>
                    )}
                    {warningCount > 0 && (
                      <Badge variant="warning">{warningCount} warning{warningCount !== 1 ? "s" : ""}</Badge>
                    )}
                  </div>
                  <div className="space-y-1">
                    {validationResult.errors.map((e, i) => (
                      <p key={i} className="text-xs text-destructive">{e.message}</p>
                    ))}
                    {validationResult.warnings.map((w, i) => (
                      <p key={i} className="text-xs text-yellow-600 dark:text-yellow-400">{w.message}</p>
                    ))}
                  </div>
                </div>
              )}

              {validationResult?.valid && (
                <div className="rounded-md bg-green-500/10 border border-green-500/20 text-green-700 dark:text-green-400 px-4 py-3 text-sm">
                  Schema is valid and ready.
                </div>
              )}

              {/* ── Refinement section ── */}
              {!!generatedSchema && !!selectedKeyId && !!model && (
                <div className="rounded-md border border-border p-4 space-y-3">
                  <p className="text-sm font-medium">Refine this program</p>
                  <Textarea
                    className="min-h-[80px] text-sm"
                    placeholder="e.g. Also send a Slack DM to #alerts when done"
                    value={refinement}
                    onChange={(e) => setRefinement(e.target.value)}
                    disabled={isRefining}
                  />
                  {refinementError && (
                    <p className="text-xs text-destructive">{refinementError}</p>
                  )}
                  <Button
                    size="sm"
                    disabled={isRefining || refinement.trim().length === 0}
                    onClick={handleRefine}
                  >
                    {isRefining ? (
                      <span className="inline-flex items-center gap-2">
                        <Spinner />
                        Refining…
                      </span>
                    ) : (
                      "Refine →"
                    )}
                  </Button>
                </div>
              )}

              <div className="flex gap-3">
                <Button onClick={() => router.push(`/programs/${programId}`)}>
                  Open program →
                </Button>
                <Button variant="outline" onClick={() => router.push("/dashboard")}>
                  Back to dashboard
                </Button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="animate-spin w-4 h-4" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}

export default function NewProgramPage() {
  return <Suspense><NewProgramPageInner /></Suspense>;
}
