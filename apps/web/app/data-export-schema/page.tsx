import Link from "next/link";
import type { Metadata } from "next";
import { LegalPageHeader } from "@/components/legal-page-header";

export const metadata: Metadata = {
  title: "Data Export Schema - Corelyx",
  description: "Machine-readable account data export schema for Corelyx GDPR portability exports.",
};

const sections = [
  ["export_metadata", "Export timestamp, schema version, account ID, file format, and explicit exclusions."],
  ["auth_profile", "Supabase Auth profile fields exposed to the user, including email and sign-in timestamps."],
  ["account_profile", "Corelyx profile fields such as display name, avatar URL, plan tier, entitlement counters, and processing restriction state."],
  ["usage", "Monthly usage counters associated with the account."],
  ["workspaces", "Workspace containers the account belongs to, including names and creation metadata."],
  ["workspace_memberships", "The account's workspace memberships and rank assignments."],
  ["workspace_invitations", "Workspace invitations visible to the account's workspaces, including invited email and rank."],
  ["data_subject_requests", "GDPR request history, status, due dates, and response summaries."],
  ["redemptions", "Redeemed plan or credit benefits. Raw redemption codes are excluded."],
  ["programs", "User workflow definitions, owner/org identifiers, and workflow settings."],
  ["program_connections", "Links between workflows and saved connections."],
  ["program_versions", "Saved workflow schema versions."],
  ["triggers", "Trigger configuration and scheduling metadata. Webhook trigger tokens are excluded."],
  ["runs", "Workflow run metadata, trigger payload, execution mode, status, timing, error, token, cost, and connector-call counters."],
  ["node_executions", "Per-node execution records, including retained input/output payloads where still available under retention policy."],
  ["approvals", "Human approval records, requester account ID, context, and decision metadata."],
  ["logs", "Application audit and operational logs scoped to the account."],
  ["connections", "Connection metadata such as org ID, provider, scopes, validation state, and non-secret provider metadata."],
  ["connection_webhook_secrets", "Non-secret webhook secret metadata. Vault secret IDs are excluded."],
  ["api_keys", "API key metadata such as org ID, provider, display name, validation state, and creation time. Raw keys and Vault secret IDs are excluded."],
] as const;

const topLevelShape = `{
  "export_metadata": {},
  "auth_profile": {},
  "account_profile": {},
  "usage": [],
  "workspaces": [],
  "workspace_memberships": [],
  "workspace_invitations": [],
  "data_subject_requests": [],
  "redemptions": [],
  "programs": [],
  "program_connections": [],
  "program_versions": [],
  "triggers": [],
  "runs": [],
  "node_executions": [],
  "approvals": [],
  "logs": [],
  "connections": [],
  "connection_webhook_secrets": [],
  "api_keys": []
}`;

export default async function DataExportSchemaPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <LegalPageHeader maxWidthClass="max-w-4xl" />

      <main className="relative mx-auto max-w-4xl px-6 py-16">
        <div className="mb-10">
          <p className="mb-3 text-[10px] font-bold uppercase tracking-[0.2em] text-primary">
            Data Rights
          </p>
          <h1 className="text-4xl font-black tracking-tight sm:text-5xl">
            Data Export Schema
          </h1>
          <p className="mt-4 text-sm leading-relaxed text-muted-foreground">
            Version 4 JSON schema for the GDPR Articles 15 and 20 export returned by <code className="rounded bg-muted px-1.5 py-0.5 text-foreground">GET /api/user/export</code>.
          </p>
        </div>

        <section className="rounded-2xl border border-border bg-card/60 p-5">
          <h2 className="text-base font-semibold text-foreground">Top-level shape</h2>
          <pre className="mt-4 overflow-x-auto rounded-xl bg-muted/50 p-4 text-xs leading-relaxed text-muted-foreground">
            {topLevelShape}
          </pre>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card/60 p-5">
          <h2 className="text-base font-semibold text-foreground">Sections</h2>
          <div className="mt-4 divide-y divide-border/70">
            {sections.map(([name, description]) => (
              <div key={name} className="grid gap-2 py-3 sm:grid-cols-[220px_1fr]">
                <code className="text-xs text-foreground">{name}</code>
                <p className="text-sm leading-relaxed text-muted-foreground">{description}</p>
              </div>
            ))}
          </div>
        </section>

        <section className="mt-6 rounded-2xl border border-border bg-card/60 p-5">
          <h2 className="text-base font-semibold text-foreground">Security exclusions</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm leading-relaxed text-muted-foreground">
            <li>Raw OAuth access tokens and refresh tokens</li>
            <li>Raw API keys</li>
            <li>Supabase Vault secret identifiers</li>
            <li>Webhook trigger tokens and signing secrets</li>
            <li>Third-party records held outside Corelyx subprocessors</li>
          </ul>
        </section>
      </main>

      <footer className="border-t border-border/40 px-6 py-6">
        <div className="mx-auto flex max-w-4xl items-center gap-5 text-xs text-muted-foreground/60">
          <Link href="/settings#data-rights" className="hover:text-foreground">Data rights</Link>
          <Link href="/privacy" className="hover:text-foreground">Privacy</Link>
          <Link href="/terms" className="hover:text-foreground">Terms</Link>
        </div>
      </footer>
    </div>
  );
}
