"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@/lib/supabase/client";

type SupportTicket = {
  id: string;
  type: "support" | "sales" | "priority";
  subject: string;
  status: "open" | "closed";
  created_at: string;
  updated_at: string;
};

type SupportMessage = {
  id: string;
  sender_type: "user" | "admin";
  content: string;
  created_at: string;
};

const TYPE_LABEL: Record<string, string> = {
  support: "Support",
  sales: "Custom integrations",
  priority: "Priority support",
};

function formatRelative(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function SettingsSupportTab({
  tier,
  userId,
  panelClass,
  fieldClass,
  primaryBtnClass,
  neutralBtnClass,
}: {
  tier: string;
  userId: string;
  panelClass: string;
  fieldClass: string;
  primaryBtnClass: string;
  neutralBtnClass: string;
}) {
  const [view, setView] = useState<"list" | "new" | "thread">("list");
  const [tickets, setTickets] = useState<SupportTicket[]>([]);
  const [selected, setSelected] = useState<SupportTicket | null>(null);
  const [messages, setMessages] = useState<SupportMessage[]>([]);
  const [loading, setLoading] = useState(true);

  const defaultType: SupportTicket["type"] =
    tier === "builder" ? "sales" : tier === "pro" ? "priority" : "support";

  const [type, setType] = useState<SupportTicket["type"]>(defaultType);
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitStatus, setSubmitStatus] = useState<{ ok: boolean; msg: string } | null>(null);

  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);

  const endRef = useRef<HTMLDivElement>(null);

  async function fetchTickets() {
    const res = await fetch("/api/support/tickets");
    if (!res.ok) return;
    const data = (await res.json()) as { tickets: SupportTicket[] };
    setTickets(data.tickets);
    setLoading(false);
  }

  async function fetchMessages(ticketId: string) {
    const res = await fetch(`/api/support/tickets/${ticketId}/messages`);
    if (!res.ok) return;
    const data = (await res.json()) as { messages: SupportMessage[] };
    setMessages(data.messages);
  }

  useEffect(() => { void fetchTickets(); }, []);

  useEffect(() => {
    if (view !== "thread" || !selected) return;
    void fetchMessages(selected.id);

    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`support-${selected.id}-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "support_messages",
          filter: `ticket_id=eq.${selected.id}`,
        },
        (payload) => {
          const msg = payload.new as SupportMessage;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [view, selected?.id, userId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitting(true);
    setSubmitStatus(null);
    const res = await fetch("/api/support/tickets", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ type, subject, message: body }),
    });
    if (res.ok) {
      setSubmitStatus({ ok: true, msg: "Ticket created — we'll get back to you soon." });
      setSubject("");
      setBody("");
      await fetchTickets();
      setTimeout(() => { setView("list"); setSubmitStatus(null); }, 1800);
    } else {
      setSubmitStatus({ ok: false, msg: "Something went wrong. Please try again." });
    }
    setSubmitting(false);
  }

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    setReplying(true);
    const res = await fetch(`/api/support/tickets/${selected.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: reply }),
    });
    if (res.ok) {
      setReply("");
      await fetchMessages(selected.id);
    }
    setReplying(false);
  }

  // ─── Thread view ───────────────────────────────────────────────────────────
  if (view === "thread" && selected) {
    return (
      <div className="flex h-full flex-col">
        <div className="mb-4 flex items-center gap-3">
          <button type="button" onClick={() => { setView("list"); setSelected(null); setMessages([]); }} className={neutralBtnClass}>
            ← Back
          </button>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-sm">{selected.subject}</p>
            <p className="text-xs text-muted-foreground">
              {TYPE_LABEL[selected.type]} · {selected.status === "open" ? "Open" : "Closed"}
            </p>
          </div>
        </div>

        <div className="flex-1 space-y-3 overflow-y-auto rounded-2xl border border-border bg-secondary/20 p-4">
          {messages.length === 0 && (
            <p className="text-center text-sm text-muted-foreground py-8">No messages yet.</p>
          )}
          {messages.map((msg) => (
            <div key={msg.id} className={cn("flex", msg.sender_type === "user" ? "justify-end" : "justify-start")}>
              <div className={cn(
                "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                msg.sender_type === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-card border border-border text-foreground rounded-bl-sm",
              )}>
                {msg.sender_type === "admin" && (
                  <p className="mb-1 text-[11px] font-semibold text-muted-foreground">Support</p>
                )}
                <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                <p className={cn("mt-1 text-[10px]", msg.sender_type === "user" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                  {formatRelative(msg.created_at)}
                </p>
              </div>
            </div>
          ))}
          <div ref={endRef} />
        </div>

        {selected.status === "open" ? (
          <form onSubmit={handleReply} className="mt-3 flex gap-2">
            <textarea
              value={reply}
              onChange={(e) => setReply(e.target.value)}
              placeholder="Write a reply…"
              rows={2}
              className={cn(fieldClass, "flex-1 resize-none")}
              onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { void handleReply(e); } }}
            />
            <button type="submit" disabled={replying || !reply.trim()} className={cn(primaryBtnClass, "self-end")}>
              {replying ? "Sending…" : "Send"}
            </button>
          </form>
        ) : (
          <p className="mt-3 rounded-xl border border-border bg-secondary/30 px-4 py-2.5 text-center text-sm text-muted-foreground">
            This ticket is closed.
          </p>
        )}
      </div>
    );
  }

  // ─── New ticket form ───────────────────────────────────────────────────────
  if (view === "new") {
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3">
          <button type="button" onClick={() => setView("list")} className={neutralBtnClass}>
            ← Back
          </button>
          <p className="font-semibold text-sm">New ticket</p>
        </div>

        {tier === "builder" && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-sm font-semibold">Scale — Custom Integrations</p>
            <p className="mt-1 text-sm text-muted-foreground">
              As a Scale customer you have access to custom integration support. Tell us what you need and our team will respond within 2 business days.
            </p>
          </div>
        )}
        {tier === "pro" && (
          <div className="rounded-2xl border border-primary/20 bg-primary/5 px-4 py-3">
            <p className="text-sm font-semibold">Team — Priority Support</p>
            <p className="mt-1 text-sm text-muted-foreground">
              As a Team customer you have priority support. We aim to respond within 4 hours during business hours.
            </p>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-3">
          {tier === "builder" && (
            <select value={type} onChange={(e) => setType(e.target.value as SupportTicket["type"])} className={fieldClass}>
              <option value="sales">Custom integration / sales</option>
              <option value="support">General support</option>
            </select>
          )}
          <input
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Subject"
            className={fieldClass}
            required
            maxLength={200}
          />
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Describe your question or request…"
            rows={5}
            className={cn(fieldClass, "resize-none")}
            required
            maxLength={5000}
          />
          {submitStatus && (
            <p className={cn("text-xs", submitStatus.ok ? "text-green-600" : "text-red-600")}>
              {submitStatus.msg}
            </p>
          )}
          <button type="submit" disabled={submitting} className={primaryBtnClass}>
            {submitting ? "Submitting…" : "Submit ticket"}
          </button>
        </form>
      </div>
    );
  }

  // ─── Ticket list ───────────────────────────────────────────────────────────
  return (
    <div className="space-y-4">
      <section className={panelClass}>
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.18em] text-muted-foreground">Support</p>
            {tier === "builder" && (
              <p className="mt-1 text-sm text-muted-foreground">Custom integrations &amp; dedicated support for Scale customers.</p>
            )}
            {tier === "pro" && (
              <p className="mt-1 text-sm text-muted-foreground">Priority support — responses within 4 hours during business hours.</p>
            )}
            {tier !== "builder" && tier !== "pro" && (
              <p className="mt-1 text-sm text-muted-foreground">We typically respond within 1–2 business days.</p>
            )}
          </div>
          <button type="button" onClick={() => setView("new")} className={primaryBtnClass}>
            New ticket
          </button>
        </div>
      </section>

      {loading ? (
        <p className="text-center text-sm text-muted-foreground py-8">Loading…</p>
      ) : tickets.length === 0 ? (
        <div className="rounded-2xl border border-border bg-secondary/20 px-6 py-10 text-center">
          <p className="text-sm font-medium">No tickets yet</p>
          <p className="mt-1 text-sm text-muted-foreground">Open a ticket and our team will get back to you.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {tickets.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => { setSelected(ticket); setView("thread"); }}
              className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card px-4 py-3 text-left transition-colors hover:bg-accent"
            >
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium">{ticket.subject}</p>
                <p className="mt-0.5 text-xs text-muted-foreground">
                  {TYPE_LABEL[ticket.type]} · {formatRelative(ticket.updated_at)}
                </p>
              </div>
              <span className={cn(
                "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-semibold",
                ticket.status === "open"
                  ? "bg-green-500/15 text-green-700"
                  : "bg-secondary text-muted-foreground",
              )}>
                {ticket.status === "open" ? "Open" : "Closed"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
