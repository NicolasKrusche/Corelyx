"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { HelpCircle, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { friendlyResponseMessage } from "@/lib/friendly-errors";
import { AiIdentityBadge } from "@/components/ai-transparency";

/**
 * Inline card for answering a question an agent asked mid-run (corelyx.ask_user).
 * The agent run is paused server-side until this is answered or declined.
 */
export function AgentQuestion({ approvalId, question }: { approvalId: string; question: string }) {
  const router = useRouter();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState<null | "answer" | "decline">(null);
  const [error, setError] = useState<string | null>(null);

  async function send(decline: boolean) {
    if (busy) return;
    if (!decline && answer.trim().length === 0) return;
    setBusy(decline ? "decline" : "answer");
    setError(null);
    try {
      const res = await fetch(`/api/agents/questions/${approvalId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(decline ? { decline: true } : { answer: answer.trim() }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(friendlyResponseMessage(data, "Could not send your answer. Please try again."));
        return;
      }
      setAnswer("");
      router.refresh();
    } catch {
      setError("We couldn't reach the server. Please try again.");
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="rounded-2xl border border-amber-500/30 bg-amber-500/5 shadow-sm">
      <div className="flex items-center gap-2 border-b border-amber-500/20 px-5 py-3">
        <HelpCircle className="h-4 w-4 text-amber-600 dark:text-amber-400" />
        <p className="text-sm font-semibold text-amber-700 dark:text-amber-300">
          The agent needs your input
        </p>
        <AiIdentityBadge label="AI agent" />
      </div>
      <div className="space-y-3 px-5 py-4">
        <p className="text-sm text-foreground/90">{question}</p>
        <Textarea
          className="min-h-[80px] resize-none text-sm"
          placeholder="Type your answer…"
          value={answer}
          onChange={(e) => setAnswer(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
              e.preventDefault();
              void send(false);
            }
          }}
        />
        <div className="flex items-center gap-2">
          <Button onClick={() => void send(false)} disabled={busy !== null || answer.trim().length === 0}>
            <Send className="mr-1.5 h-4 w-4" />
            {busy === "answer" ? "Sending…" : "Send answer"}
          </Button>
          <Button variant="ghost" onClick={() => void send(true)} disabled={busy !== null}>
            {busy === "decline" ? "…" : "Skip"}
          </Button>
        </div>
        {error && <p className="text-sm text-destructive">{error}</p>}
      </div>
    </div>
  );
}
