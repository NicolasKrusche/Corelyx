"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { createBrowserClient } from "@/lib/supabase/client";
import { useAdvancedMode } from "@/lib/advanced-mode";
import { friendlyErrorMessage, friendlyResponseMessage } from "@/lib/friendly-errors";
import { useTheme, type BaseTheme, type AccentColor, type BgStyle } from "@/components/theme-provider";
import { LanguageSwitcher } from "@/components/language-switcher";

const ACCENT_COLORS: { id: AccentColor; color: string }[] = [
  { id: "orange", color: "#f97316" },
  { id: "blue",   color: "#3b9eff" },
  { id: "indigo", color: "#818cf8" },
  { id: "green",  color: "#22c55e" },
  { id: "pink",   color: "#fb7185" },
  { id: "cyan",   color: "#22d3ee" },
];

const BG_STYLE_IDS: BgStyle[] = ["default", "liquid", "obsidian", "noir"];

const BG_STYLE_PREVIEWS: Record<BgStyle, ReactNode> = {
  default: (
    <div className="relative w-full h-10 rounded-md overflow-hidden bg-[#171717]">
      <div className="absolute inset-0" style={{
        background: "radial-gradient(ellipse 70% 60% at 80% 10%, hsl(var(--theme-glow-strong) / 0.55) 0%, transparent 55%), radial-gradient(ellipse 55% 50% at 15% 90%, hsl(var(--theme-glow-soft) / 0.4) 0%, transparent 50%)",
      }} />
    </div>
  ),
  liquid: (
    <div className="relative w-full h-10 rounded-md overflow-hidden" style={{ background: "#03030a" }}>
      <div className="absolute inset-0" style={{ background: "radial-gradient(ellipse 65% 60% at 78% 18%, hsl(var(--theme-glow-strong) / 0.65) 0%, transparent 55%), radial-gradient(ellipse 60% 55% at 15% 82%, hsl(var(--theme-glow-soft) / 0.6) 0%, transparent 52%), radial-gradient(ellipse 40% 38% at 48% 48%, hsl(var(--primary) / 0.38) 0%, transparent 50%)" }} />
      <div className="absolute inset-x-0 top-0 h-[30%]" style={{ background: "linear-gradient(to bottom, rgba(255,255,255,0.05), transparent)" }} />
    </div>
  ),
  obsidian: (
    <div className="relative w-full h-10 rounded-md overflow-hidden" style={{ background: "#050505" }}>
      <div className="absolute inset-0" style={{ backgroundImage: "linear-gradient(135deg, rgba(255,255,255,0.04) 1px, transparent 1px), linear-gradient(45deg, rgba(255,255,255,0.04) 1px, transparent 1px)", backgroundSize: "14px 14px" }} />
      <div className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-10 h-7 rounded-md" style={{ background: "rgba(255,255,255,0.06)", boxShadow: "inset 0 1px 0 rgba(255,255,255,0.2), 0 0 0 1px rgba(255,255,255,0.07)" }} />
    </div>
  ),
  noir: (
    <div className="w-full h-10 rounded-md bg-black" style={{ boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.08)" }} />
  ),
};

function AppearanceSection() {
  const t = useTranslations("settingsPage");
  const { base, accent, bgStyle, setBase, setAccent, setBgStyle } = useTheme();
  return (
    <Section title={t("appearance")} description={t("appearanceDesc")}>
      <div className="space-y-5">
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">{t("mode")}</p>
          <div className="flex gap-2">
            {(["dark", "light"] as BaseTheme[]).map((b) => (
              <button
                key={b}
                type="button"
                onClick={() => setBase(b)}
                aria-pressed={base === b}
                className={`flex-1 rounded-lg border px-4 py-2.5 text-xs font-medium transition-colors ${
                  base === b
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                {b === "dark" ? t("dark") : t("light")}
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">{t("accent")}</p>
          <div className="flex flex-wrap gap-2">
            {ACCENT_COLORS.map((a) => (
              <button
                key={a.id}
                type="button"
                onClick={() => setAccent(a.id)}
                aria-pressed={accent === a.id}
                title={a.id}
                className={`flex items-center gap-1.5 rounded-lg border px-3 py-2 text-xs transition-colors ${
                  accent === a.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border hover:bg-muted text-muted-foreground hover:text-foreground"
                }`}
              >
                <span className="h-3 w-3 rounded-full shrink-0" style={{ backgroundColor: a.color }} />
                <span className="capitalize">{a.id}</span>
              </button>
            ))}
          </div>
        </div>
        <div>
          <p className="text-xs font-medium text-muted-foreground uppercase tracking-widest mb-2">{t("style")}</p>
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
            {BG_STYLE_IDS.map((id) => (
              <button
                key={id}
                type="button"
                onClick={() => setBgStyle(id)}
                aria-pressed={bgStyle === id}
                className={`flex flex-col gap-1.5 rounded-lg border p-2 text-left transition-colors ${
                  bgStyle === id
                    ? "border-primary bg-primary/10"
                    : "border-border hover:bg-muted"
                }`}
              >
                {BG_STYLE_PREVIEWS[id]}
                <div>
                  <p className={`text-xs font-medium ${bgStyle === id ? "text-foreground" : "text-muted-foreground"}`}>{t(`${id}Style` as "defaultStyle" | "liquidStyle" | "obsidianStyle" | "noirStyle")}</p>
                  <p className="text-[10px] text-muted-foreground leading-tight">{t(`${id}StyleDesc` as "defaultStyleDesc" | "liquidStyleDesc" | "obsidianStyleDesc" | "noirStyleDesc")}</p>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>
    </Section>
  );
}

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
  const t = useTranslations("settingsPage");
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
      setStatus({ type: "error", message: friendlyResponseMessage(data, "That code did not work. Check it and try again.") });
    } else {
      setStatus({ type: "success", message: `Applied: ${data.benefit}` });
      setCode("");
    }
    setLoading(false);
  }

  return (
    <Section title={t("redeemTitle")} description={t("redeemDesc")}>
      <form onSubmit={handleRedeem} className="flex gap-2">
        <input
          type="text"
          required
          value={code}
          onChange={(e) => setCode(e.target.value.toUpperCase())}
          placeholder={t("redeemPlaceholder")}
          className="flex-1 rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm font-mono tracking-widest placeholder:text-muted-foreground/40 placeholder:tracking-normal focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-all"
        />
        <button
          type="submit"
          disabled={loading || code.length < 3}
          className="shrink-0 rounded-lg bg-primary text-primary-foreground px-4 py-2.5 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
        >
          {loading ? t("redeemLoading") : t("redeemBtn")}
        </button>
      </form>
      {status && <StatusMessage {...status} />}
    </Section>
  );
}

export function SettingsClient({ email, isOAuthUser, createdAt }: Props) {
  const t = useTranslations("settingsPage");
  const [advanced, setAdvanced] = useAdvancedMode();

  // Email change state
  const [newEmail, setNewEmail] = useState("");
  const [emailStatus, setEmailStatus] = useState<{ type: "success" | "error"; message: string } | null>(null);
  const [emailLoading, setEmailLoading] = useState(false);

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

  async function handleEmailChange(e: React.FormEvent) {
    e.preventDefault();
    setEmailStatus(null);
    if (!newEmail || newEmail === email) {
      setEmailStatus({ type: "error", message: t("emailDifferentError") });
      return;
    }
    setEmailLoading(true);
    const supabase = createBrowserClient();
    const { error } = await supabase.auth.updateUser({ email: newEmail });
    if (error) {
      setEmailStatus({ type: "error", message: friendlyErrorMessage(error.message, t("emailUpdateError")) });
    } else {
      setEmailStatus({
        type: "success",
        message: t("emailConfirmSent", { email: newEmail }),
      });
      setNewEmail("");
    }
    setEmailLoading(false);
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPasswordStatus(null);

    if (newPassword !== confirmPassword) {
      setPasswordStatus({ type: "error", message: t("passwordsNoMatch") });
      return;
    }
    if (newPassword.length < 8) {
      setPasswordStatus({ type: "error", message: t("passwordTooShort") });
      return;
    }

    setPasswordLoading(true);
    const supabase = createBrowserClient();

    // Re-authenticate with current password first
    const { error: signInError } = await supabase.auth.signInWithPassword({ email, password: currentPassword });
    if (signInError) {
      setPasswordStatus({ type: "error", message: t("wrongPassword") });
      setPasswordLoading(false);
      return;
    }

    const { error } = await supabase.auth.updateUser({ password: newPassword });
    if (error) {
      setPasswordStatus({ type: "error", message: friendlyErrorMessage(error.message, t("passwordUpdateError")) });
    } else {
      setPasswordStatus({ type: "success", message: t("passwordUpdated") });
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
      setDeleteStatus({ type: "error", message: friendlyResponseMessage(body, t("deleteAccountError")) });
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
        <h1 className="text-3xl font-black tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1.5">{t("subtitle")}</p>
      </div>

      {/* Account info */}
      <Section title={t("account")} description={t("accountDesc")}>
        <Field label={t("currentEmail")}>
          <div className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
            {email}
          </div>
        </Field>
        <Field label={t("memberSince")}>
          <div className="w-full rounded-lg border border-input bg-muted/40 px-3 py-2.5 text-sm text-muted-foreground">
            {memberSince}
          </div>
        </Field>

        {/* Email change */}
        {!isOAuthUser ? (
          <form onSubmit={handleEmailChange} className="space-y-3 pt-2 border-t border-border/60">
            <p className="text-xs font-medium text-muted-foreground">{t("changeEmail")}</p>
            <Field label={t("newEmail")}>
              <input
                type="email"
                required
                value={newEmail}
                onChange={(e) => setNewEmail(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-all"
                placeholder={t("emailPlaceholder")}
              />
            </Field>
            {emailStatus && <StatusMessage {...emailStatus} />}
            <button
              type="submit"
              disabled={emailLoading}
              className="rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
            >
              {emailLoading ? t("sending") : t("sendConfirmation")}
            </button>
          </form>
        ) : (
          <p className="text-xs text-muted-foreground pt-2 border-t border-border/60">
            {t("googleEmail")}
          </p>
        )}
      </Section>

      {/* Appearance / theme */}
      <AppearanceSection />

      {/* Change password — only for email/password users */}
      {!isOAuthUser && (
        <Section
          title={t("password")}
          description={t("passwordDesc")}
        >
          <form onSubmit={handlePasswordChange} className="space-y-4">
            <Field label={t("currentPassword")}>
              <input
                type="password"
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-all"
                placeholder="••••••••"
              />
            </Field>
            <Field label={t("newPassword")}>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-primary/50 focus:border-primary/40 transition-all"
                placeholder="Min. 8 characters"
              />
            </Field>
            <Field label={t("confirmPassword")}>
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
              {passwordLoading ? t("updating") : t("updatePassword")}
            </button>
          </form>
        </Section>
      )}

      {isOAuthUser && (
        <Section title={t("password")} description={t("googlePassword")}>
          <p className="text-sm text-muted-foreground">
            To manage your password, visit your{" "}
            <a href="https://myaccount.google.com/security" target="_blank" rel="noreferrer" className="text-foreground hover:text-primary underline underline-offset-2 transition-colors">
              {t("googlePasswordLink")}
            </a>
            .
          </p>
        </Section>
      )}

      {/* Redeem a code */}
      <div id="redeem">
        <RedeemSection />
      </div>

      <Section title={t("plan")} description={t("planDesc")}>
        <Link
          href="/plan"
          className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
        >
          {t("upgradePlan")}
        </Link>
      </Section>

      <Section title={t("advancedOptions")} description={t("advancedOptionsDesc")}>
        <button
          type="button"
          role="switch"
          aria-checked={advanced}
          onClick={() => setAdvanced(!advanced)}
          className={`relative inline-flex h-6 w-11 shrink-0 items-center rounded-full transition-colors ${
            advanced ? "bg-primary" : "bg-muted"
          }`}
        >
          <span
            className={`inline-block h-4 w-4 rounded-full bg-background shadow transition-transform ${
              advanced ? "translate-x-6" : "translate-x-1"
            }`}
          />
        </button>
      </Section>

      {/* Data & Privacy */}
      <Section
        title={t("privacy")}
        description={t("privacyDesc")}
      >
        <div className="space-y-3">
          <div className="rounded-lg border glass-card p-4 space-y-2">
            <p className="text-sm font-medium">{t("exportTitle")}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("exportDesc")}
            </p>
            <a
              href="/api/user/export"
              download
              className="inline-flex items-center gap-1.5 rounded-lg bg-primary text-primary-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 transition-opacity"
            >
              {t("downloadExport")}
            </a>
            <Link
              href="/data-export-schema"
              className="ml-3 inline-flex text-xs font-medium text-primary hover:underline underline-offset-2"
            >
              {t("viewSchema")}
            </Link>
          </div>
          <div className="rounded-lg border glass-card p-4 space-y-1">
            <p className="text-sm font-medium">{t("billingTitle")}</p>
            <p className="text-xs text-muted-foreground leading-relaxed">
              {t("billingDesc")}
            </p>
          </div>
        </div>
      </Section>

      <div id="data-rights">
        <Section title={t("compliance")} description={t("complianceDesc")}>
          <div className="space-y-3">
            <Link
              href="/account/compliance"
              className="inline-flex items-center justify-center rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-opacity hover:opacity-90"
            >
              {t("openCompliance")}
            </Link>
            <div className="rounded-lg border border-border bg-secondary/35 p-4">
              <p className="text-sm font-medium text-foreground">{t("regulatoryRef")}</p>
              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
                {t("regulatoryRefText")}
              </p>
              <a
                href="https://gdpr-info.eu/"
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex text-xs font-medium text-primary hover:underline underline-offset-2"
              >
                {t("readGdpr")}
              </a>
            </div>
          </div>
        </Section>
      </div>

      <Section title={t("language")} description={t("languageDesc")}>
        <LanguageSwitcher />
      </Section>

      {/* Legal */}
      <Section title={t("legal")} description={t("legalDesc")}>
        <div className="flex flex-col gap-2">
          <Link
            href="/privacy"
            className="flex items-center justify-between rounded-lg border glass-card px-4 py-3 text-sm hover:bg-accent transition-colors group"
          >
            <span className="font-medium">{t("privacyPolicy")}</span>
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
              <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </Link>
          <Link
            href="/terms"
            className="flex items-center justify-between rounded-lg border glass-card px-4 py-3 text-sm hover:bg-accent transition-colors group"
          >
            <span className="font-medium">{t("termsOfService")}</span>
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
              <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </Link>
          <Link
            href="/impressum"
            className="flex items-center justify-between rounded-lg border glass-card px-4 py-3 text-sm hover:bg-accent transition-colors group"
          >
            <span className="font-medium">{t("impressum")}</span>
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
              <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </Link>
          <Link
            href="/subprocessors"
            className="flex items-center justify-between rounded-lg border glass-card px-4 py-3 text-sm hover:bg-accent transition-colors group"
          >
            <span className="font-medium">{t("subprocessors")}</span>
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
              <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </Link>
          <Link
            href="/dpa"
            className="flex items-center justify-between rounded-lg border glass-card px-4 py-3 text-sm hover:bg-accent transition-colors group"
          >
            <span className="font-medium">{t("dpa")}</span>
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
              <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </Link>
          <Link
            href="/security"
            className="flex items-center justify-between rounded-lg border glass-card px-4 py-3 text-sm hover:bg-accent transition-colors group"
          >
            <span className="font-medium">{t("securityPolicy")}</span>
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
              <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </Link>
          <Link
            href="/dpia-template"
            className="flex items-center justify-between rounded-lg border glass-card px-4 py-3 text-sm hover:bg-accent transition-colors group"
          >
            <span className="font-medium">{t("dpiaTemplate")}</span>
            <svg viewBox="0 0 16 16" fill="currentColor" className="w-3.5 h-3.5 text-muted-foreground/40 group-hover:text-muted-foreground transition-colors">
              <path fillRule="evenodd" d="M6.22 3.22a.75.75 0 0 1 1.06 0l4.25 4.25a.75.75 0 0 1 0 1.06l-4.25 4.25a.75.75 0 0 1-1.06-1.06L9.94 8 6.22 4.28a.75.75 0 0 1 0-1.06Z" clipRule="evenodd" />
            </svg>
          </Link>
        </div>
      </Section>

      {/* Danger zone */}
      <div id="danger-zone">
        <Section
          title={t("dangerTitle")}
          description={t("dangerDesc")}
        >
          <div className="rounded-lg border border-destructive/30 bg-destructive/5 p-5 space-y-4">
            <form onSubmit={handleDeleteAccount} className="space-y-4">
            <Field label={t("deleteConfirmLabel")}>
              <input
                type="text"
                value={deleteConfirm}
                onChange={(e) => setDeleteConfirm(e.target.value)}
                className="w-full rounded-lg border border-input bg-background/60 px-3 py-2.5 text-sm placeholder:text-muted-foreground/40 focus:outline-none focus:ring-1 focus:ring-destructive/50 focus:border-destructive/40 transition-all"
                placeholder={t("deleteConfirmPlaceholder")}
                autoComplete="off"
              />
            </Field>

            {deleteStatus && <StatusMessage {...deleteStatus} />}

            <button
              type="submit"
              disabled={deleteLoading || deleteConfirm !== "delete my account"}
              className="rounded-lg bg-destructive text-destructive-foreground px-4 py-2 text-sm font-semibold hover:opacity-90 disabled:opacity-40 transition-opacity"
            >
              {deleteLoading ? t("deleting") : t("deleteAccount")}
            </button>
            </form>
          </div>
        </Section>
      </div>
    </div>
  );
}
