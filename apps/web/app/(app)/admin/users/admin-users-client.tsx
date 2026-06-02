"use client";

import { useState } from "react";
import { Loader2, ShieldOff, ShieldCheck } from "lucide-react";

type UserResult = {
  id: string;
  email: string;
  created_at: string;
  banned_until?: string | null;
};

export function AdminUsersClient({ currentUserId }: { currentUserId: string }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<UserResult[]>([]);
  const [searching, setSearching] = useState(false);
  const [actionUserId, setActionUserId] = useState<string | null>(null);
  const [reason, setReason] = useState("");
  const [feedback, setFeedback] = useState<{ id: string; msg: string; ok: boolean } | null>(null);

  async function search() {
    if (query.trim().length < 3) return;
    setSearching(true);
    setFeedback(null);
    const res = await fetch(`/api/admin/users/search?q=${encodeURIComponent(query)}`);
    const data = await res.json() as { users: UserResult[] };
    setResults(data.users ?? []);
    setSearching(false);
  }

  async function doAction(userId: string, action: "ban" | "unban") {
    setActionUserId(userId);
    setFeedback(null);
    const res = await fetch(`/api/admin/users/${userId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason: reason.trim() || undefined }),
    });
    const body = await res.json() as { ok?: boolean; error?: string };
    setFeedback({
      id: userId,
      ok: !!body.ok,
      msg: body.ok
        ? `User ${action === "ban" ? "banned" : "unbanned"} successfully.`
        : (body.error ?? "Action failed."),
    });
    setActionUserId(null);
    setReason("");
    // Refresh results
    await search();
  }

  function isBanned(u: UserResult) {
    if (!u.banned_until) return false;
    if (u.banned_until === "infinity") return true;
    return new Date(u.banned_until) > new Date();
  }

  return (
    <div className="space-y-4">
      {/* Search bar */}
      <div className="flex gap-2">
        <input
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") void search(); }}
          placeholder="Search by email…"
          className="flex-1 rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
        <button
          type="button"
          onClick={() => void search()}
          disabled={searching || query.trim().length < 3}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-50"
        >
          {searching && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
          Search
        </button>
      </div>

      {/* Reason field (shown when results exist) */}
      {results.length > 0 && (
        <input
          type="text"
          value={reason}
          onChange={(e) => setReason(e.target.value)}
          placeholder="Ban reason (optional, logged)"
          className="w-full rounded-lg border border-input bg-background/60 px-3 py-2 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50"
        />
      )}

      {/* Results */}
      {results.length > 0 && (
        <div className="overflow-hidden rounded-lg border border-border">
          <table className="w-full text-sm">
            <thead className="bg-muted/40 text-[11px] uppercase tracking-[0.14em] text-muted-foreground">
              <tr>
                <th className="px-4 py-3 text-left">Email</th>
                <th className="px-4 py-3 text-left">Joined</th>
                <th className="px-4 py-3 text-left">Status</th>
                <th className="px-4 py-3 text-right">Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {results.map((u) => {
                const banned = isBanned(u);
                const isLoading = actionUserId === u.id;
                const isSelf = u.id === currentUserId;
                return (
                  <tr key={u.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3 font-mono text-xs">{u.email}</td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {new Date(u.created_at).toLocaleDateString("en-GB")}
                    </td>
                    <td className="px-4 py-3">
                      <span className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                        banned
                          ? "bg-destructive/10 text-destructive"
                          : "bg-green-500/10 text-green-600 dark:text-green-400"
                      }`}>
                        {banned ? "Banned" : "Active"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      {isSelf ? (
                        <span className="text-xs text-muted-foreground">—</span>
                      ) : (
                        <button
                          type="button"
                          disabled={isLoading}
                          onClick={() => void doAction(u.id, banned ? "unban" : "ban")}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors disabled:opacity-50 ${
                            banned
                              ? "bg-green-500/10 text-green-700 hover:bg-green-500/20 dark:text-green-400"
                              : "bg-destructive/10 text-destructive hover:bg-destructive/20"
                          }`}
                        >
                          {isLoading
                            ? <Loader2 className="h-3 w-3 animate-spin" />
                            : banned
                              ? <ShieldCheck className="h-3 w-3" />
                              : <ShieldOff className="h-3 w-3" />
                          }
                          {banned ? "Unban" : "Ban"}
                        </button>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Feedback */}
      {feedback && (
        <p className={`rounded-lg border px-3 py-2 text-xs ${
          feedback.ok
            ? "border-green-500/20 bg-green-500/10 text-green-600 dark:text-green-400"
            : "border-destructive/20 bg-destructive/10 text-destructive"
        }`}>
          {feedback.msg}
        </p>
      )}
    </div>
  );
}
