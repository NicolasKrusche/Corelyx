"use client";

import { useState } from "react";
import { usePathname } from "next/navigation";
import { Bug, Lightbulb, MessageCircle, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";

type FeedbackType = "bug" | "idea" | "other";

const TYPES: Array<{ value: FeedbackType; label: string; icon: typeof Bug }> = [
  { value: "bug", label: "Bug", icon: Bug },
  { value: "idea", label: "Idea", icon: Lightbulb },
  { value: "other", label: "Other", icon: MessageCircle },
];

export function FeedbackWidget() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [type, setType] = useState<FeedbackType>("idea");
  const [message, setMessage] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function reset() {
    setType("idea");
    setMessage("");
    setDone(false);
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!message.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ type, message: message.trim(), page_path: pathname }),
      });
      if (!res.ok) {
        setError("Could not send feedback. Please try again.");
        return;
      }
      setDone(true);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="fixed bottom-5 right-5 z-40 flex h-11 items-center gap-2 rounded-full border border-border bg-card px-4 text-sm font-medium text-foreground shadow-lg transition-all hover:-translate-y-0.5 hover:shadow-xl"
      >
        <MessageCircle className="h-4 w-4" />
        Feedback
      </button>

      <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
        <DialogContent>
          {done ? (
            <div className="space-y-3 py-2 text-center">
              <DialogTitle>Thanks!</DialogTitle>
              <DialogDescription>We read every submission — appreciate you taking the time.</DialogDescription>
              <Button size="sm" onClick={() => setOpen(false)}>Close</Button>
            </div>
          ) : (
            <>
              <DialogHeader>
                <DialogTitle>Send feedback</DialogTitle>
                <DialogDescription>Spot a bug or have an idea? Tell us directly — no ticket needed.</DialogDescription>
              </DialogHeader>

              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="flex gap-2">
                  {TYPES.map(({ value, label, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      onClick={() => setType(value)}
                      className={cn(
                        "flex flex-1 items-center justify-center gap-1.5 rounded-lg border px-3 py-2 text-xs font-medium transition-colors",
                        type === value
                          ? "border-primary bg-primary/10 text-primary"
                          : "border-border text-muted-foreground hover:bg-accent",
                      )}
                    >
                      <Icon className="h-3.5 w-3.5" />
                      {label}
                    </button>
                  ))}
                </div>

                <Textarea
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={type === "bug" ? "What went wrong?" : "What would you like to see?"}
                  rows={4}
                  maxLength={4000}
                  autoFocus
                />

                {error && <p className="text-xs text-destructive">{error}</p>}

                <div className="flex justify-end gap-2">
                  <Button type="button" variant="outline" size="sm" onClick={() => setOpen(false)}>
                    Cancel
                  </Button>
                  <Button type="submit" size="sm" disabled={submitting || !message.trim()}>
                    {submitting ? "Sending…" : "Send"}
                  </Button>
                </div>
              </form>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
