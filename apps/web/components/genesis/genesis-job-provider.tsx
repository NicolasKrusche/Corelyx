"use client";

import {
  createContext,
  useCallback,
  useContext,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { friendlyErrorMessage } from "@/lib/friendly-errors";

// The Genesis stream used to run inside the building page, which meant leaving
// that page aborted the in-flight generation. This provider lifts the stream up
// to the root layout so it survives any in-app navigation: the building page is
// now just a live viewer of the shared job, and a floating widget + browser
// notification keep the user informed if they wander off to do something else.

export type GenesisPayload = (
  | { description: string; connection_ids: string[]; api_key_id: string; model: string }
  | { description: string; connection_ids: string[]; use_platform_key: true; model?: string }
) & { layout_direction?: "horizontal" | "vertical" };

export type GenesisJobNode = {
  id: string;
  type: "trigger" | "agent" | "step" | "connection";
  label?: string;
  description?: string;
  connection?: string | null;
  config?: unknown;
  position?: { x: number; y: number };
};

export type GenesisJobEdge = {
  id: string;
  from: string;
  to: string;
  type?: "data_flow" | "control_flow" | "event_subscription";
  label?: string | null;
};

export type GenesisJob = {
  status: string;
  programName: string;
  thoughts: string[];
  nodes: GenesisJobNode[];
  edges: GenesisJobEdge[];
  error: string | null;
  programId: string | null;
  done: boolean;
};

type GenesisJobContextValue = {
  job: GenesisJob | null;
  start: (payload: GenesisPayload) => void;
  clear: () => void;
};

export const BUILDING_PATH = "/programs/new/building";

const GenesisJobContext = createContext<GenesisJobContextValue | null>(null);

export function useGenesisJob() {
  const ctx = useContext(GenesisJobContext);
  if (!ctx) throw new Error("useGenesisJob must be used within GenesisJobProvider");
  return ctx;
}

const EMPTY_JOB: GenesisJob = {
  status: "Contacting the model...",
  programName: "",
  thoughts: [],
  nodes: [],
  edges: [],
  error: null,
  programId: null,
  done: false,
};

function requestNotificationPermission(): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission === "default") void Notification.requestPermission();
}

function fireNotification(title: string, body: string): void {
  if (typeof Notification === "undefined") return;
  if (Notification.permission !== "granted") return;
  try {
    new Notification(title, { body, icon: "/favicon.ico" });
  } catch {
    // Safari may throw even with permission granted; silently ignore
  }
}

export function GenesisJobProvider({ children }: { children: ReactNode }) {
  const [job, setJob] = useState<GenesisJob | null>(null);
  const runningRef = useRef(false);
  // Read inside the stream loop without re-creating `start`, so completion can
  // decide whether to fire a notification based on where the user currently is.
  const pathname = usePathname();
  const pathnameRef = useRef(pathname);
  pathnameRef.current = pathname;

  const clear = useCallback(() => {
    runningRef.current = false;
    setJob(null);
  }, []);

  const start = useCallback((payload: GenesisPayload) => {
    if (runningRef.current) return;
    runningRef.current = true;
    requestNotificationPermission();
    setJob({ ...EMPTY_JOB });

    const update = (partial: Partial<GenesisJob>) =>
      setJob((prev) => ({ ...(prev ?? EMPTY_JOB), ...partial }));
    const pushThought = (thought: string) =>
      setJob((prev) => {
        const base = prev ?? EMPTY_JOB;
        return { ...base, thoughts: [...base.thoughts, thought] };
      });
    const addNode = (node: GenesisJobNode) =>
      setJob((prev) => {
        const base = prev ?? EMPTY_JOB;
        if (base.nodes.some((n) => n.id === node.id)) return base;
        return { ...base, nodes: [...base.nodes, node] };
      });
    const addEdge = (edge: GenesisJobEdge) =>
      setJob((prev) => {
        const base = prev ?? EMPTY_JOB;
        if (base.edges.some((e) => e.id === edge.id)) return base;
        return { ...base, edges: [...base.edges, edge] };
      });

    const handleEvent = (event: { type: string } & Record<string, unknown>) => {
      switch (event.type) {
        case "meta": {
          if (typeof event.program_name === "string") {
            update({ programName: event.program_name, status: `Designing ${event.program_name}...` });
            pushThought(`Named the program "${event.program_name}"`);
          }
          return;
        }
        case "node": {
          const node = event.node as GenesisJobNode;
          addNode(node);
          pushThought(`Added ${node.type} node: ${node.label ?? node.id}`);
          return;
        }
        case "edge": {
          const edge = event.edge as GenesisJobEdge;
          addEdge(edge);
          pushThought(`Connected ${edge.from} → ${edge.to}`);
          return;
        }
        case "status": {
          if (typeof event.message === "string") update({ status: event.message });
          return;
        }
        case "done": {
          const programId = (event.program_id as string) ?? null;
          const programName = typeof event.program_name === "string" ? event.program_name : undefined;
          update({ done: true, programId, status: "Ready", ...(programName ? { programName } : {}) });
          runningRef.current = false;
          // Only ping the user if they left the building page — if they're
          // watching, the page itself opens the program for them.
          if (pathnameRef.current !== BUILDING_PATH) {
            fireNotification(
              "Your program is ready",
              programName ? `"${programName}" finished generating.` : "Your workflow finished generating."
            );
          }
          return;
        }
        case "error": {
          update({
            error: friendlyErrorMessage(
              typeof event.message === "string" ? event.message : null,
              "We could not build the workflow. Please try again."
            ),
          });
          runningRef.current = false;
          if (pathnameRef.current !== BUILDING_PATH) {
            fireNotification("Program generation failed", "Open Corelyx to try again.");
          }
          return;
        }
      }
    };

    void (async () => {
      try {
        const res = await fetch("/api/genesis/stream", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok || !res.body) {
          let message = "We could not start building the workflow. Please try again.";
          try {
            const body = (await res.clone().json()) as { error?: unknown; message?: unknown };
            if (typeof body.message === "string") message = friendlyErrorMessage(body.message, message);
            else if (typeof body.error === "string") message = friendlyErrorMessage(body.error, message);
          } catch {
            // Keep the default message when the response is not JSON.
          }
          update({ error: message });
          runningRef.current = false;
          return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";

        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });

          let idx: number;
          while ((idx = buffer.indexOf("\n\n")) !== -1) {
            const frame = buffer.slice(0, idx);
            buffer = buffer.slice(idx + 2);
            const dataLine = frame.split("\n").find((l) => l.startsWith("data: "));
            if (!dataLine) continue;
            try {
              handleEvent(JSON.parse(dataLine.slice(6)));
            } catch {
              // ignore malformed frames
            }
          }
        }
      } catch (err) {
        update({
          error: friendlyErrorMessage(
            (err as Error).message,
            "We could not connect. Check your internet connection and try again."
          ),
        });
        runningRef.current = false;
      }
    })();
  }, []);

  return (
    <GenesisJobContext.Provider value={{ job, start, clear }}>
      {children}
      <GenesisBackgroundWidget />
    </GenesisJobContext.Provider>
  );
}

/**
 * Floating status card shown anywhere in the app *except* the building page
 * itself, so a backgrounded generation stays visible and one click reopens it
 * or the finished program.
 */
function GenesisBackgroundWidget() {
  const ctx = useContext(GenesisJobContext);
  const router = useRouter();
  const pathname = usePathname();

  const job = ctx?.job ?? null;
  if (!ctx || !job) return null;
  if (pathname === BUILDING_PATH) return null;

  const title = job.programName || "Your program";

  return (
    <div className="fixed bottom-4 right-4 z-[60] w-80 max-w-[calc(100vw-2rem)] rounded-xl border glass-card bg-background/90 px-4 py-3 shadow-lg backdrop-blur-md animate-in fade-in slide-in-from-bottom-2 duration-300">
      <div className="flex items-start gap-3">
        {!job.done && !job.error && <Spinner />}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">
            {job.error ? "Generation failed" : job.done ? `${title} is ready` : `Building ${title}`}
          </p>
          <p className="truncate text-xs text-muted-foreground">
            {job.error ? job.error : job.done ? "Your workflow finished generating." : job.status}
          </p>
        </div>
        <button
          type="button"
          onClick={ctx.clear}
          aria-label="Dismiss"
          className="shrink-0 rounded-md px-1.5 text-muted-foreground transition-colors hover:text-foreground"
        >
          ×
        </button>
      </div>
      <div className="mt-2 flex gap-2">
        {!job.done && !job.error && (
          <button
            type="button"
            onClick={() => router.push(BUILDING_PATH)}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            View progress
          </button>
        )}
        {job.done && job.programId && (
          <button
            type="button"
            onClick={() => {
              const id = job.programId;
              ctx.clear();
              if (id) router.push(`/programs/${id}`);
            }}
            className="rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-opacity hover:opacity-90"
          >
            Open program →
          </button>
        )}
        {job.error && (
          <button
            type="button"
            onClick={() => {
              ctx.clear();
              router.push("/programs/new");
            }}
            className="rounded-md border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
          >
            Try again
          </button>
        )}
      </div>
    </div>
  );
}

function Spinner() {
  return (
    <svg className="mt-0.5 h-4 w-4 shrink-0 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
