"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Sparkles, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { friendlyErrorMessage } from "@/lib/friendly-errors";

type Phase = "describe" | "building" | "error";

export default function NewAgentPage() {
  const router = useRouter();
  const [description, setDescription] = useState("");
  const [phase, setPhase] = useState<Phase>("describe");
  const [status, setStatus] = useState("Designing your agent...");
  const [thoughts, setThoughts] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const startedRef = useRef(false);

  // Load valid connection ids once so Genesis can wire the agent to real apps.
  const connectionIdsRef = useRef<string[]>([]);
  useEffect(() => {
    fetch("/api/connections")
      .then((r) => (r.ok ? r.json() : []))
      .then((data: Array<{ id: string; is_valid: boolean }>) => {
        connectionIdsRef.current = data.filter((c) => c.is_valid).map((c) => c.id);
      })
      .catch(() => { /* non-fatal — agent can run without connections */ });
  }, []);

  async function build() {
    if (description.trim().length < 10 || startedRef.current) return;
    startedRef.current = true;
    setPhase("building");
    setError(null);
    setThoughts([]);
    setStatus("Designing your agent...");

    const payload = {
      description: description.trim(),
      connection_ids: connectionIdsRef.current,
      use_platform_key: true as const,
      program_type: "agent" as const,
    };

    try {
      const res = await fetch("/api/genesis/stream", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok || !res.body) {
        let message = "We couldn't start building your agent. Please try again.";
        try {
          const b = (await res.clone().json()) as { error?: unknown; message?: unknown };
          if (typeof b.message === "string") message = friendlyErrorMessage(b.message, message);
          else if (typeof b.error === "string") message = friendlyErrorMessage(b.error, message);
        } catch { /* keep default */ }
        setError(message);
        setPhase("error");
        startedRef.current = false;
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
          const line = frame.split("\n").find((l) => l.startsWith("data: "));
          if (!line) continue;
          try {
            handleEvent(JSON.parse(line.slice(6)));
          } catch { /* ignore malformed frame */ }
        }
      }
    } catch (err) {
      setError(friendlyErrorMessage((err as Error).message, "We couldn't connect. Check your connection and try again."));
      setPhase("error");
      startedRef.current = false;
    }
  }

  function handleEvent(event: { type: string } & Record<string, unknown>) {
    switch (event.type) {
      case "meta":
        if (typeof event.program_name === "string") {
          setStatus(`Planning "${event.program_name}"...`);
          setThoughts((p) => [...p, `Named the agent "${event.program_name}"`]);
        }
        return;
      case "node":
        if (event.node && typeof event.node === "object") {
          const n = event.node as { type?: string; label?: string; id?: string };
          setThoughts((p) => [...p, `Added ${n.type ?? "step"}: ${n.label ?? n.id ?? ""}`]);
        }
        return;
      case "status":
        if (typeof event.message === "string") setStatus(event.message);
        return;
      case "done": {
        const programId = event.program_id as string | undefined;
        setStatus("Opening your agent...");
        if (programId) router.replace(`/agents/${programId}`);
        return;
      }
      case "error":
        setError(friendlyErrorMessage(typeof event.message === "string" ? event.message : null, "We couldn't build the agent. Please try again."));
        setPhase("error");
        startedRef.current = false;
        return;
    }
  }

  return (
    <div className="mx-auto max-w-2xl space-y-6 py-6">
      <Link href="/agents" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground">
        <ArrowLeft className="h-4 w-4" /> Agents
      </Link>

      {phase !== "building" ? (
        <div className="space-y-4">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-primary" />
            <h1 className="text-xl font-semibold">New one-time agent</h1>
          </div>
          <p className="text-sm text-muted-foreground">
            Describe a single task you want done — something big enough to be a chore but not worth a repeating
            workflow. The agent will plan it out for you to approve, then run once.
          </p>
          <Textarea
            className="min-h-[160px] text-sm"
            placeholder={`Example: "Go through my failed workflow runs from the last 7 days, figure out which ones broke because a connection expired, and send me a Slack summary grouped by app."`}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
          <div className="flex items-center justify-between">
            <p className="text-xs text-muted-foreground">{description.length}/2000</p>
            <Button disabled={description.trim().length < 10} onClick={() => void build()}>
              Plan &amp; build agent
            </Button>
          </div>
          {phase === "error" && error && (
            <p className="text-sm text-destructive">{error}</p>
          )}
        </div>
      ) : (
        <div className="space-y-4 rounded-2xl border glass-card p-6">
          <div className="flex items-center gap-3">
            <Spinner />
            <div>
              <p className="text-sm font-semibold">Building your agent</p>
              <p className="text-xs text-muted-foreground">{status}</p>
            </div>
          </div>
          {thoughts.length > 0 && (
            <div className="space-y-1.5 border-t pt-3">
              {thoughts.slice(-8).map((t, i) => (
                <div key={`${t}-${i}`} className="flex gap-2 text-xs text-muted-foreground">
                  <span className="mt-1 h-1 w-1 shrink-0 rounded-full bg-primary" />
                  <span>{t}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <svg className="h-5 w-5 shrink-0 animate-spin text-primary" fill="none" viewBox="0 0 24 24">
      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
    </svg>
  );
}
