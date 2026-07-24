"use client";

import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";

interface InviteMemberModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  teamId: string;
  onInvited?: () => void;
}

export function InviteMemberModal({ open, onOpenChange, teamId, onInvited }: InviteMemberModalProps) {
  const [email, setEmail] = useState("");
  const [role, setRole] = useState<"admin" | "member" | "viewer">("member");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!open) {
      setEmail("");
      setRole("member");
      setError(null);
      setSuccess(false);
    }
  }, [open]);

  const handleSubmit = useCallback(async () => {
    if (!email.trim()) {
      setError("Email is required.");
      return;
    }

    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`/api/teams/${teamId}/members`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: email.trim(), role }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Failed to invite member.");
        return;
      }

      setSuccess(true);
      onInvited?.();
      setTimeout(() => onOpenChange(false), 1200);
    } catch {
      setError("Something went wrong. Please try again.");
    } finally {
      setLoading(false);
    }
  }, [email, role, teamId, onInvited, onOpenChange]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Invite member</DialogTitle>
          <DialogDescription>
            Add an existing Corelyx user to this team by email.
          </DialogDescription>
        </DialogHeader>

        {success ? (
          <div className="rounded-md bg-green-50 dark:bg-green-950/40 border border-green-200 dark:border-green-800 p-4 text-sm text-green-700 dark:text-green-300">
            Member invited successfully.
          </div>
        ) : (
          <div className="space-y-4">
            <div className="space-y-2">
              <label htmlFor="invite-email" className="text-sm font-medium">
                Email address
              </label>
              <Input
                id="invite-email"
                type="email"
                placeholder="colleague@company.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSubmit();
                }}
                disabled={loading}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <label htmlFor="invite-role" className="text-sm font-medium">
                Role
              </label>
              <Select
                id="invite-role"
                value={role}
                onChange={(e) => setRole(e.target.value as "admin" | "member" | "viewer")}
                disabled={loading}
              >
                <option value="admin">Admin — full team management</option>
                <option value="member">Member — can edit shared programs</option>
                <option value="viewer">Viewer — read-only access</option>
              </Select>
            </div>

            {error && (
              <p className="text-sm text-destructive">{error}</p>
            )}
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" size="sm" onClick={() => onOpenChange(false)} disabled={loading}>
            {success ? "Close" : "Cancel"}
          </Button>
          {!success && (
            <Button size="sm" onClick={handleSubmit} disabled={loading || !email.trim()}>
              {loading ? "Inviting…" : "Send invite"}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
