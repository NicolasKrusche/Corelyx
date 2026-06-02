"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { cn } from "@/lib/utils";
import { createBrowserClient } from "@/lib/supabase/client";

type Assignee = {
  id: string;
  display_name: string | null;
  username: string | null;
};

type Ticket = {
  id: string;
  user_email: string;
  user_tier: string;
  type: "support" | "sales" | "priority";
  subject: string;
  status: "open" | "closed";
  assigned_to: string | null;
  assignee: Assignee | null;
  created_at: string;
  updated_at: string;
};

type TeamMember = {
  id: string;
  email: string;
  display_name: string | null;
  username: string | null;
};

type Message = {
  id: string;
  sender_type: "user" | "admin";
  content: string;
  created_at: string;
};

type GrantRow = {
  id: string;
  user_id: string;
  program_id: string;
  expires_at: string;
  created_at: string;
  programs: { id: string; name: string; description: string | null } | null;
};

const TYPE_BADGE: Record<string, string> = {
  support: "bg-blue-500/10 text-blue-700",
  sales: "bg-amber-500/10 text-amber-700",
  priority: "bg-violet-500/10 text-violet-700",
};

const TIER_BADGE: Record<string, string> = {
  free: "bg-secondary text-muted-foreground",
  plus: "bg-emerald-500/15 text-emerald-700",
  pro: "bg-violet-500/15 text-violet-700",
  builder: "bg-blue-500/15 text-blue-700",
  unlimited: "bg-amber-500/15 text-amber-700",
};

const TIER_LABEL: Record<string, string> = {
  free: "Free", plus: "Solo", pro: "Team", builder: "Scale", unlimited: "Unlimited",
};

function formatRelative(iso: string) {
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export function AdminSupportClient() {
  const router = useRouter();
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [canAssign, setCanAssign] = useState(false);
  const [teamMembers, setTeamMembers] = useState<TeamMember[]>([]);
  const [selected, setSelected] = useState<Ticket | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [filter, setFilter] = useState<"all" | "open" | "closed">("open");
  const [loading, setLoading] = useState(true);
  const [reply, setReply] = useState("");
  const [replying, setReplying] = useState(false);
  const [closing, setClosing] = useState(false);
  const [assigning, setAssigning] = useState(false);
  const [grants, setGrants] = useState<GrantRow[]>([]);
  const endRef = useRef<HTMLDivElement>(null);

  async function fetchTickets() {
    const res = await fetch("/api/admin/support");
    if (!res.ok) return;
    const data = (await res.json()) as { tickets: Ticket[]; can_assign: boolean };
    setTickets(data.tickets);
    setCanAssign(data.can_assign);
    setLoading(false);
  }

  async function fetchTeam() {
    const res = await fetch("/api/admin/team");
    if (!res.ok) return;
    const data = (await res.json()) as { members: TeamMember[] };
    setTeamMembers(data.members);
  }

  async function fetchMessages(ticketId: string) {
    const res = await fetch(`/api/admin/support/${ticketId}/messages`);
    if (!res.ok) return;
    const data = (await res.json()) as { messages: Message[] };
    setMessages(data.messages);
  }

  async function fetchGrants(ticketId: string) {
    const res = await fetch(`/api/admin/support/${ticketId}/grants`);
    if (!res.ok) return;
    const data = (await res.json()) as { grants: GrantRow[] };
    setGrants(data.grants);
  }

  useEffect(() => {
    void fetchTickets();
    void fetchTeam();
  }, []);

  const selectedId = selected?.id;

  useEffect(() => {
    if (!selectedId) return;
    void fetchMessages(selectedId);
    void fetchGrants(selectedId);

    const supabase = createBrowserClient();
    const channel = supabase
      .channel(`admin-support-${selectedId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "support_messages", filter: `ticket_id=eq.${selectedId}` },
        (payload) => {
          const msg = payload.new as Message;
          setMessages((prev) => (prev.some((m) => m.id === msg.id) ? prev : [...prev, msg]));
        },
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [selectedId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function handleReply(e: React.FormEvent) {
    e.preventDefault();
    if (!selected || !reply.trim()) return;
    setReplying(true);
    await fetch(`/api/admin/support/${selected.id}/messages`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ content: reply }),
    });
    setReply("");
    await fetchMessages(selected.id);
    await fetchTickets();
    setReplying(false);
  }

  async function handleAssign(assignedTo: string | null) {
    if (!selected) return;
    setAssigning(true);
    await fetch(`/api/admin/support/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ assigned_to: assignedTo }),
    });
    const assignee = assignedTo ? (teamMembers.find((m) => m.id === assignedTo) ?? null) : null;
    const updatedAssignee = assignee ? { id: assignee.id, display_name: assignee.display_name, username: assignee.username } : null;
    setSelected((t) => t ? { ...t, assigned_to: assignedTo, assignee: updatedAssignee } : t);
    setTickets((ts) => ts.map((t) => t.id === selected.id ? { ...t, assigned_to: assignedTo, assignee: updatedAssignee } : t));
    setAssigning(false);
  }

  async function handleSetStatus(status: "open" | "closed") {
    if (!selected) return;
    setClosing(true);
    await fetch(`/api/admin/support/${selected.id}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status }),
    });
    setSelected((t) => t ? { ...t, status } : t);
    setTickets((ts) => ts.map((t) => t.id === selected.id ? { ...t, status } : t));
    setClosing(false);
    router.refresh();
  }

  const filtered = tickets.filter((t) => filter === "all" || t.status === filter);

  return (
    <div className="flex h-[calc(100vh-8rem)] gap-4">
      {/* Ticket list */}
      <div className="flex w-80 shrink-0 flex-col rounded-2xl border border-border bg-card overflow-hidden">
        <div className="border-b border-border px-4 py-3">
          <h2 className="font-semibold">Support tickets</h2>
          <div className="mt-2 flex gap-1">
            {(["open", "closed", "all"] as const).map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => setFilter(f)}
                className={cn(
                  "rounded-lg px-2.5 py-1 text-xs font-medium capitalize transition-colors",
                  filter === f ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:bg-accent",
                )}
              >
                {f}
              </button>
            ))}
          </div>
        </div>

        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <p className="p-4 text-sm text-muted-foreground">Loading…</p>
          ) : filtered.length === 0 ? (
            <p className="p-4 text-sm text-muted-foreground">No tickets.</p>
          ) : filtered.map((ticket) => (
            <button
              key={ticket.id}
              type="button"
              onClick={() => setSelected(ticket)}
              className={cn(
                "w-full border-b border-border px-4 py-3 text-left transition-colors hover:bg-accent",
                selected?.id === ticket.id && "bg-accent",
              )}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="min-w-0 truncate text-sm font-medium">{ticket.subject}</p>
                <span className={cn("shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-semibold", ticket.status === "open" ? "bg-green-500/15 text-green-700" : "bg-secondary text-muted-foreground")}>
                  {ticket.status}
                </span>
              </div>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold", TIER_BADGE[ticket.user_tier] ?? TIER_BADGE.free)}>
                  {TIER_LABEL[ticket.user_tier] ?? ticket.user_tier}
                </span>
                <span className={cn("rounded-full px-1.5 py-0.5 text-[10px] font-semibold capitalize", TYPE_BADGE[ticket.type])}>
                  {ticket.type}
                </span>
                <span className="text-[11px] text-muted-foreground">{ticket.user_email}</span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-1">
                <p className="text-[11px] text-muted-foreground">{formatRelative(ticket.updated_at)}</p>
                {ticket.assignee && (
                  ticket.assignee.username ? (
                    <a
                      href={`/u/${ticket.assignee.username}`}
                      onClick={(e) => e.stopPropagation()}
                      className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary hover:bg-primary/20 transition-colors"
                    >
                      {ticket.assignee.display_name ?? ticket.assignee.username}
                    </a>
                  ) : (
                    <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                      {ticket.assignee.display_name ?? "Assigned"}
                    </span>
                  )
                )}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Thread */}
      <div className="flex flex-1 flex-col rounded-2xl border border-border bg-card overflow-hidden">
        {!selected ? (
          <div className="flex flex-1 items-center justify-center text-sm text-muted-foreground">
            Select a ticket to view the conversation.
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between gap-3 border-b border-border px-5 py-3">
              <div className="min-w-0">
                <p className="font-semibold truncate">{selected.subject}</p>
                <p className="text-xs text-muted-foreground">{selected.user_email} · {TIER_LABEL[selected.user_tier] ?? selected.user_tier}</p>
              </div>
              <div className="flex shrink-0 items-center gap-2">
                {canAssign && (
                  <select
                    value={selected.assigned_to ?? ""}
                    onChange={(e) => void handleAssign(e.target.value || null)}
                    disabled={assigning}
                    className="rounded-lg border border-border bg-background px-2.5 py-1.5 text-xs focus:outline-none focus:border-primary disabled:opacity-50"
                  >
                    <option value="">Unassigned</option>
                    {teamMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.display_name ?? m.email}
                      </option>
                    ))}
                  </select>
                )}
                <button
                  type="button"
                  onClick={() => handleSetStatus(selected.status === "open" ? "closed" : "open")}
                  disabled={closing}
                  className={cn(
                    "rounded-xl px-3 py-1.5 text-xs font-semibold transition-colors disabled:opacity-40",
                    selected.status === "open"
                      ? "bg-secondary text-foreground hover:bg-destructive hover:text-destructive-foreground"
                      : "bg-green-600 text-white hover:bg-green-700",
                  )}
                >
                  {closing ? "…" : selected.status === "open" ? "Close ticket" : "Reopen"}
                </button>
              </div>
            </div>

            {grants.length > 0 && (
              <div className="border-b border-border px-5 py-2.5 flex flex-wrap items-center gap-2">
                <span className="text-[11px] font-semibold uppercase tracking-widest text-muted-foreground mr-1">Shared programs:</span>
                {grants.map((grant) => (
                  <a
                    key={grant.id}
                    href={`/admin/grants/${grant.id}`}
                    className="inline-flex items-center gap-1 rounded-lg border border-border bg-background px-2.5 py-1 text-xs font-medium hover:bg-accent transition-colors"
                  >
                    {grant.programs?.name ?? grant.program_id.slice(0, 8)}
                    <span className="text-[10px] text-muted-foreground">→</span>
                  </a>
                ))}
              </div>
            )}

            <div className="flex-1 space-y-3 overflow-y-auto p-5">
              {messages.map((msg) => (
                <div key={msg.id} className={cn("flex", msg.sender_type === "admin" ? "justify-end" : "justify-start")}>
                  <div className={cn(
                    "max-w-[75%] rounded-2xl px-4 py-2.5 text-sm",
                    msg.sender_type === "admin"
                      ? "bg-primary text-primary-foreground rounded-br-sm"
                      : "bg-secondary text-foreground rounded-bl-sm",
                  )}>
                    {msg.sender_type === "user" && (
                      <p className="mb-1 text-[11px] font-semibold text-muted-foreground">{selected.user_email}</p>
                    )}
                    <p className="whitespace-pre-wrap break-words">{msg.content}</p>
                    <p className={cn("mt-1 text-[10px]", msg.sender_type === "admin" ? "text-primary-foreground/70" : "text-muted-foreground")}>
                      {formatRelative(msg.created_at)}
                    </p>
                  </div>
                </div>
              ))}
              <div ref={endRef} />
            </div>

            <form onSubmit={handleReply} className="flex gap-2 border-t border-border p-4">
              <textarea
                value={reply}
                onChange={(e) => setReply(e.target.value)}
                placeholder="Reply as support…"
                rows={2}
                className="flex-1 resize-none rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
                onKeyDown={(e) => { if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) { void handleReply(e); } }}
              />
              <button
                type="submit"
                disabled={replying || !reply.trim()}
                className="self-end rounded-xl bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40"
              >
                {replying ? "Sending…" : "Send"}
              </button>
            </form>
          </>
        )}
      </div>
    </div>
  );
}
