"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const EXAMPLES = [
  "When I get a new GitHub issue, summarize it with AI and post to Slack",
  "Every morning, pull my unread Gmail and save summaries to Notion",
  "When a Typeform submission comes in, create a HubSpot contact",
  "Summarize my weekly Google Sheets data and email me a report",
];

export function GenesisPrompt() {
  const router = useRouter();
  const [value, setValue] = useState("");
  const [focused, setFocused] = useState(false);
  const [isCreatingScratch, setIsCreatingScratch] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setCreateError(null);
    const prompt = value.trim();
    if (prompt) {
      router.push(`/programs/new?prompt=${encodeURIComponent(prompt)}`);
    } else {
      router.push("/programs/new");
    }
  }

  async function handleStartFromScratch() {
    setCreateError(null);
    setIsCreatingScratch(true);

    let res: Response;
    try {
      res = await fetch("/api/programs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ mode: "blank" }),
      });
    } catch {
      setCreateError("Could not create a blank workflow. Check your network and try again.");
      setIsCreatingScratch(false);
      return;
    }

    const data = await res.json().catch(() => ({
      message: "Could not create a blank workflow. Please try again.",
    }));

    if (!res.ok) {
      const message =
        typeof data?.message === "string"
          ? data.message
          : typeof data?.error === "string"
          ? data.error
          : "Could not create a blank workflow. Please try again.";
      setCreateError(message);
      setIsCreatingScratch(false);
      return;
    }

    router.push(`/programs/${data.program.id}/editor`);
  }

  return (
    <div className="relative overflow-hidden rounded-2xl border border-border">
      <div className="absolute inset-0 bg-grid-dots opacity-[0.18]" />
      <div
        className="absolute inset-0 transition-opacity duration-500"
        style={{
          background: "radial-gradient(ellipse 70% 90% at 50% 130%, hsl(var(--primary) / 0.1) 0%, transparent 70%)",
          opacity: focused ? 1 : 0.5,
        }}
      />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/20 to-transparent" />

      <div className="relative px-8 py-7">
        <p className="mb-2 font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-muted-foreground/40">
          New automation
        </p>
        <h2 className="mb-5 text-lg font-bold">What do you want to automate?</h2>

        <form onSubmit={handleSubmit} className="flex flex-col gap-3 sm:flex-row">
          <input
            value={value}
            onChange={(e) => setValue(e.target.value)}
            onFocus={() => setFocused(true)}
            onBlur={() => setFocused(false)}
            placeholder={`${EXAMPLES[Math.floor(Date.now() / 8000) % EXAMPLES.length]}...`}
            className="min-w-0 flex-1 rounded-xl border border-border bg-background/70 px-4 py-3 text-sm placeholder:text-muted-foreground/30 transition-all duration-200 focus:border-primary/40 focus:outline-none focus:ring-1 focus:ring-primary/40"
          />
          <div className="flex gap-3 shrink-0">
            <button
              type="submit"
              disabled={isCreatingScratch}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl bg-primary px-5 py-3 text-sm font-bold text-primary-foreground shadow-[0_0_20px_hsl(var(--primary)/0.3)] transition-all duration-200 hover:opacity-95 hover:shadow-[0_0_30px_hsl(var(--primary)/0.45)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              Generate
              <svg viewBox="0 0 16 16" fill="currentColor" className="h-3.5 w-3.5">
                <path
                  fillRule="evenodd"
                  d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z"
                  clipRule="evenodd"
                />
              </svg>
            </button>
            <button
              type="button"
              disabled={isCreatingScratch}
              onClick={() => {
                void handleStartFromScratch();
              }}
              className="inline-flex items-center gap-2 whitespace-nowrap rounded-xl border border-border bg-background/70 px-5 py-3 text-sm font-bold text-foreground transition-all duration-200 hover:border-primary/40 hover:bg-background disabled:cursor-not-allowed disabled:opacity-60"
            >
              {isCreatingScratch ? "Opening editor..." : "Start from scratch"}
            </button>
          </div>
        </form>

        <p className="mt-3 text-[11px] text-muted-foreground/35">
          Describe in plain English for AI, or jump straight into the editor and build by hand.
        </p>
        {createError && <p className="mt-2 text-[11px] text-red-500">{createError}</p>}
      </div>
    </div>
  );
}
