"use client";

import { useState } from "react";
import Link from "next/link";
import { createBrowserClient } from "@/lib/supabase/client";

interface Props {
  email: string;
  isOAuthUser: boolean;
  createdAt: string;
}

function Section({ title, description, children }: { title: string; description?: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 py-8 border-t border-border/60 first:border-t-0 first:pt-0">
      <div>
        <h2 className="text-sm font-semibold">{title}</h2>
        {description && <p className="text-xs text-muted-foreground mt-1 leading-relaxed">{description}</p>}
      </div>
      <div className="lg:col-span-2 space-y-4">
        {children}
      </div>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-xs font-medium text-muted-foreground mb-1.5">{label}</label>
      {children}
    </div>
  );
}

function StatusMessage({ type, message }: { type: "success" | "error"; message: string }) {
  return (
    <p className={`text-xs rounded-lg px-3 py-2 border ${
      type === "success"
        ? "text-green-400 bg-green-500/10 border-green-500/20"
        : "text-destructive bg-destructive/10 border-destructive/20"
    }`}>
      {message}
    </p>
  );
}

function RedeemSection() {
  const [code, setCode] = useState("");
  const [status, setStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleRedeem(e: React.FormEvent) {
    e.preventDefault();
    setStatus(null);
    setLoading(true);

    const res = await fetch("/api/settings/redeem", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ code }),
    });
    const data = await res.json() as { benefit?: string; error?: string };

    if (!res.ok) {
      setStatus({ type: "error", message: data.error ?? "Invalid code." });
    } else {
      setStatus({ type: "success", message: `Applied: ${data.benefit}` });
      setCode("");
    }
    setLoading(false);
  }

  return (
    <Section title="Redeem a code" description="Have a promo, beta, or gift code? Apply it here.">
      <form onSubmit={handleRedeem} className="flex gap-2">
        <input
          type="text"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder="ENTER CODE"
          className="flex-1 rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm font-mono tracking-widest placeholder:text-muted-foreground/40 placeholder:tracking-normal focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-all"
        />
        <button
          type="submit"
          disabled={loading || code.length < 3}
          className="shrink-0 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? "…" : "Redeem"}
        </button>
      </form>
      {status && <StatusMessage {...status} />}
    </Section>
  );
}

export function SettingsClient({ email, isOAuthUser, createdAt }: Props) {
  // Password change state
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordStatus, setPasswordStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [passwordLoading, setPasswordLoading] = useState(false);

  // Delete account state
  const [deleteConfirm, setDeleteConfirm] = useState("");
  const [deleteStatus, setDeleteStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const memberSince = new Date(createdAt).toLocaleDateString("en-GB", {
    day: "numeric", month: "long", year: "numeric",
  });

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordStatus(null);

    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: "error", message: "New passwords do not match." });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordStatus({ type: "error", message: "Password must be at least 8 characters." });
      return;
    }

    setPasswordLoading(true);
    const supabase = createBrowserClient();

    // Re-authenticate with current password first
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (signInError) {
      setPasswordStatus({ type: "error", message: "Current password is incorrect." });
      setPasswordLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordStatus({ type: "error", message: error.message });
    } else {
      setPasswordStatus({ type: "success", message: "Password updated successfully." });
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    }
    setPasswordLoading(false);
  }

  async function handleDeleteAccount(e: React.FormEvent) {
    e.preventDefault();
    if (deleteConfirm !== "delete my account") return;

    setDeleteLoading(true);
    setDeleteStatus(null);

    const res = await fetch("/api/settings/account", { method: "DELETE" });
    if (!res.ok) {
      const body = await res.json().catch(() => ({})) as { error?: string };
      setDeleteStatus({ type: "error", message: body.error ?? "Failed to delete account." });
      setDeleteLoading(false);
      return;
    }

    // Sign out locally then redirect
    const supabase = createBrowserClient();
    await supabase.auth.signOut();
    window.location.href = "/?deleted=1";
  }

  return (
    <div className="max-w-3xl space-y-0">

      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-black tracking-tight">Settings</h1>
        <p className="text-sm text-muted-foreground mt-1.5">Manage your account.</p>
      </div>

      {/* Account info */}
      <Section title="Account" description="Your account details. Email cannot be changed.">
        <Field label="Email address">
          <div className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
            {email}
          </div>
        </Field>
        <Field label="Member since">
          <div className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
            {memberSince}
          </div>
        </Field>
      </Section>

      {/* Change password — only for email/password users */}
      {!isOAuthUser && (
        <Section
          title="Password"
          description="Change your login password. You'll stay signed in on this device."
        >
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <Field label="Current password">
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-all"
                placeholder="••••••••"
              />
            </Field>
            <Field label="New password">
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-all"
                placeholder="Min. 8 characters"
              />
            </Field>
            <Field label="Confirm new password">
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-all"
                placeholder="••••••••"
              />
            </Field>

            {passwordStatus && <StatusMessage {...passwordStatus} />}

            <button
              type="submit"
              disabled={passwordLoading}
              className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {passwordLoading ? "Updating…" : "Update password"}
            </button>
          </form>
        </Section>
      )}

      {isOAuthUser && (
        <Section title="Password" description="You signed in with Google. Password login is not available for your account.">
          <p className="text-sm text-muted-foreground">
            To manage your password, visit your{" "}
            <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="text-foreground hover:text-primary underline underline-offset-2 transition-colors">
              Google account security settings
            </a>
            .
          </p>
        </Section>
      )}

      {/* Redeem a code */}
      <div id="redeem">
        <RedeemSection />
      </div>

      {/* Legal */}
      <Section title="Legal" description="Review our policies at any time.">
        <div className="flex flex-col gap-2">
          <Link
            href="/privacy"
            className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm hover:bg-accent transition-colors group"
          >
            <span className="font-medium">Privacy Policy</span>
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
              <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </Link>
          <Link
            href="/terms"
            className="flex items-center justify-between rounded-lg border border-border bg-card px-4 py-3 text-sm hover:bg-accent transition-colors group"
          >
            <span className="font-medium">Terms of Service</span>
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
              <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>
      </Section>

      {/* Danger zone */}
      <Section
        title="Danger zone"
        description="Permanently delete your account and all associated programs, runs, connections, and credentials. This cannot be undone."
      >
        <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-4">
          <form onSubmit={handleDeleteAccount} className="space-y-4">
            <Field label={`Type "delete my account" to confirm`}>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-destructive/50 focus:border-destructive/40 transition-all"
                placeholder="delete my account"
                autoComplete="off"
              />
            </Field>

            {deleteStatus && <StatusMessage {...deleteStatus} />}

            <button
              type="submit"
              disabled={deleteLoading || deleteConfirm !== "delete my account"}
              className="rounded-lg bg-destructive text-destructive-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {deleteLoading ? "Deleting…" : "Delete my account"}
            </button>
          </form>
        </div>
      </Section>
    </div>
  );
}
