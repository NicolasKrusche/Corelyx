"use client";

import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { UserEmailAutocomplete } from "@/components/admin/user-email-autocomplete";

const FALLBACK_SENDERS = ["noreply@corelyx.app", "support@corelyx.app", "legal@corelyx.app"];

type Status = { kind: "idle" } | { kind: "error"; message: string } | { kind: "sent" };

export function AdminComposeClient() {
  const [senders, setSenders] = useState<string[]>(FALLBACK_SENDERS);
  const [from, setFrom] = useState(FALLBACK_SENDERS[0]);
  const [to, setTo] = useState("");
  const [cc, setCc] = useState("");
  const [bcc, setBcc] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);
  const [status, setStatus] = useState<Status>({ kind: "idle" });
  const [showCcBcc, setShowCcBcc] = useState(false);

  useEffect(() => {
    void (async () => {
      const res = await fetch("/api/admin/compose");
      if (!res.ok) return;
      const data = (await res.json()) as { senders: string[] };
      if (data.senders?.length) {
        setSenders(data.senders);
        setFrom(data.senders[0]);
      }
    })();
  }, []);

  async function handleSend(e: React.FormEvent) {
    e.preventDefault();
    if (!to.trim() || !subject.trim() || !body.trim()) return;
    setSending(true);
    setStatus({ kind: "idle" });

    const res = await fetch("/api/admin/compose", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to,
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject,
        body,
      }),
    });

    if (res.ok) {
      setStatus({ kind: "sent" });
      setTo("");
      setCc("");
      setBcc("");
      setSubject("");
      setBody("");
    } else {
      const data = (await res.json().catch(() => null)) as { error?: string } | null;
      setStatus({ kind: "error", message: data?.error ?? "Failed to send email" });
    }
    setSending(false);
  }

  return (
    <div className="mx-auto max-w-2xl">
      <div className="rounded-2xl border border-border bg-card p-6">
        <h2 className="font-semibold">Compose email</h2>
        <p className="mt-1 text-sm text-muted-foreground">
          Send a one-off email as any Corelyx address. Not tied to a support ticket or template.
        </p>

        <form onSubmit={handleSend} className="mt-5 space-y-4">
          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">From</label>
            <select
              value={from}
              onChange={(e) => setFrom(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            >
              {senders.map((s) => (
                <option key={s} value={s}>{s}</option>
              ))}
            </select>
          </div>

          <div>
            <div className="flex items-center justify-between">
              <label htmlFor="compose-to" className="mb-1.5 block text-xs font-semibold text-muted-foreground">To</label>
              {!showCcBcc && (
                <button
                  type="button"
                  onClick={() => setShowCcBcc(true)}
                  className="mb-1.5 text-xs text-muted-foreground hover:text-foreground"
                >
                  + Cc/Bcc
                </button>
              )}
            </div>
            <UserEmailAutocomplete
              id="compose-to"
              value={to}
              onChange={setTo}
              multiple
              placeholder="someone@example.com, someone-else@example.com"
              disabled={sending}
            />
          </div>

          {showCcBcc && (
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label htmlFor="compose-cc" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Cc</label>
                <UserEmailAutocomplete
                  id="compose-cc"
                  value={cc}
                  onChange={setCc}
                  multiple
                  disabled={sending}
                />
              </div>
              <div>
                <label htmlFor="compose-bcc" className="mb-1.5 block text-xs font-semibold text-muted-foreground">Bcc</label>
                <UserEmailAutocomplete
                  id="compose-bcc"
                  value={bcc}
                  onChange={setBcc}
                  multiple
                  disabled={sending}
                />
              </div>
            </div>
          )}

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Subject</label>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              className="w-full rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <div>
            <label className="mb-1.5 block text-xs font-semibold text-muted-foreground">Message</label>
            <textarea
              value={body}
              onChange={(e) => setBody(e.target.value)}
              rows={10}
              placeholder="Write your message…"
              className="w-full resize-y rounded-xl border border-border bg-background px-3 py-2 text-sm outline-none focus:border-primary"
            />
          </div>

          <div className="flex items-center justify-between">
            <div className="text-xs">
              {status.kind === "sent" && <span className="text-green-600 font-medium">Sent.</span>}
              {status.kind === "error" && <span className="text-destructive font-medium">{status.message}</span>}
            </div>
            <button
              type="submit"
              disabled={sending || !to.trim() || !subject.trim() || !body.trim()}
              className={cn(
                "rounded-xl bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-40",
              )}
            >
              {sending ? "Sending…" : "Send"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
