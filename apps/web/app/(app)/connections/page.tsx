"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  PlusCircle,
  Settings2,
  ShieldCheck,
  Star,
  Trash2,
  Users,
} from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import {
  getNextSecondaryConnectionName,
  getPrimaryConnectionName,
  isPrimaryConnectionName,
} from "@/lib/connection-utils";

type Connection = {
  id: string;
  name: string;
  provider: string;
  auth_type: "oauth" | "api_key";
  scopes: string[] | null;
  metadata: Record<string, unknown> | null;
  is_valid: boolean;
  last_validated_at: string | null;
  created_at: string;
};

type Provider = {
  id: string;
  label: string;
  description: string;
  wave: 1 | 2 | 3;
  href: string;
};

type SettingsSection = "overview" | "accounts" | "primary" | "health" | "danger";

type SettingsNavItem = {
  id: SettingsSection;
  label: string;
  caption: string;
  icon: LucideIcon;
  group: "Connection" | "Management";
};

const PROVIDER_LABELS: Record<string, string> = {
  gmail: "Gmail",
  sheets: "Google Sheets",
  slack: "Slack",
  notion: "Notion",
  calendar: "Google Calendar",
  airtable: "Airtable",
  hubspot: "HubSpot",
  docs: "Google Docs",
  github: "GitHub",
  typeform: "Typeform",
  asana: "Asana",
  drive: "Google Drive",
  outlook: "Outlook Mail",
};

const PROVIDER_ICON_URL: Record<string, string> = {
  gmail: "https://commons.wikimedia.org/wiki/Special:FilePath/Gmail_icon_(2020).svg",
  sheets: "https://upload.wikimedia.org/wikipedia/commons/a/ae/Google_Sheets_2020_Logo.svg",
  calendar: "https://commons.wikimedia.org/wiki/Special:FilePath/Google_Calendar_icon_(2020).svg",
  docs: "https://upload.wikimedia.org/wikipedia/commons/6/66/Google_Docs_2020_Logo.svg",
  drive: "https://upload.wikimedia.org/wikipedia/commons/1/12/Google_Drive_icon_%282020%29.svg",
  slack: "https://commons.wikimedia.org/wiki/Special:FilePath/Slack_icon_2019.svg",
  github: "https://commons.wikimedia.org/wiki/Special:FilePath/GitHub_Invertocat_Logo.svg",
  outlook: "https://upload.wikimedia.org/wikipedia/commons/4/45/Microsoft_Office_Outlook_%282018%E2%80%932024%29.svg",
  notion: "https://www.google.com/s2/favicons?domain=notion.so&sz=64",
  airtable: "https://www.google.com/s2/favicons?domain=airtable.com&sz=64",
  hubspot: "https://upload.wikimedia.org/wikipedia/commons/3/3f/HubSpot_Logo.svg",
  typeform: "https://www.google.com/s2/favicons?domain=typeform.com&sz=64",
  asana: "https://www.google.com/s2/favicons?domain=app.asana.com&sz=64",
};

const AVAILABLE_PROVIDERS: Provider[] = [
  { id: "gmail", label: "Gmail", description: "Send and read emails", wave: 1, href: "/api/connections/oauth/gmail?label=gmail:primary" },
  { id: "sheets", label: "Google Sheets", description: "Read and write spreadsheet data", wave: 1, href: "/api/connections/oauth/google?service=sheets&label=sheets:primary" },
  { id: "slack", label: "Slack", description: "Post messages and read channels", wave: 1, href: "/api/connections/oauth/slack?label=slack:primary" },
  { id: "notion", label: "Notion", description: "Read and write pages and databases", wave: 1, href: "/api/connections/oauth/notion?label=notion:primary" },
  { id: "calendar", label: "Google Calendar", description: "Read and create calendar events", wave: 1, href: "/api/connections/oauth/google?service=calendar&label=calendar:primary" },
  { id: "airtable", label: "Airtable", description: "Read and write Airtable bases", wave: 1, href: "/api/connections/oauth/airtable?label=airtable:primary" },
  { id: "hubspot", label: "HubSpot", description: "Manage contacts, deals, and content", wave: 1, href: "/api/connections/oauth/hubspot?label=hubspot:primary" },
  { id: "docs", label: "Google Docs", description: "Read and write documents", wave: 1, href: "/api/connections/oauth/google?service=docs&label=docs:primary" },
  { id: "github", label: "GitHub", description: "Create issues, PRs, and read repos", wave: 2, href: "/api/connections/oauth/github?label=github:primary" },
  { id: "typeform", label: "Typeform", description: "Read form responses and definitions", wave: 2, href: "/api/connections/oauth/typeform?label=typeform:primary" },
  { id: "asana", label: "Asana", description: "Manage tasks and projects", wave: 2, href: "/api/connections/oauth/asana?label=asana:primary" },
  { id: "drive", label: "Google Drive", description: "Read and manage Drive files", wave: 2, href: "/api/connections/oauth/google?service=drive&label=drive:primary" },
  { id: "outlook", label: "Outlook Mail", description: "Send and read Outlook email", wave: 2, href: "/api/connections/oauth/outlook?label=outlook:primary" },
];

const SETTINGS_NAV_ITEMS: SettingsNavItem[] = [
  { id: "overview", label: "Overview", caption: "Status and quick actions", icon: Settings2, group: "Connection" },
  { id: "accounts", label: "Accounts", caption: "Manage connected accounts", icon: Users, group: "Connection" },
  { id: "primary", label: "Primary", caption: "Choose the default account", icon: Star, group: "Connection" },
  { id: "health", label: "Access & health", caption: "Scopes and connection checks", icon: ShieldCheck, group: "Management" },
  { id: "danger", label: "Disconnect", caption: "Remove accounts and revoke access", icon: Trash2, group: "Management" },
];

function ProviderLogo({ provider, size = 26 }: { provider: string; size?: number }) {
  const [failed, setFailed] = useState(false);
  const iconUrl = PROVIDER_ICON_URL[provider] ?? null;

  if (!iconUrl || failed) {
    return (
      <div
        style={{ width: size, height: size }}
        className="flex shrink-0 items-center justify-center rounded-md bg-muted text-[10px] font-bold text-muted-foreground"
      >
        {provider.slice(0, 2).toUpperCase()}
      </div>
    );
  }

  return (
    <div
      style={{ width: size, height: size }}
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-md border border-border/50 bg-card p-0.5"
    >
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={iconUrl}
        alt={PROVIDER_LABELS[provider] ?? provider}
        width={size - 4}
        height={size - 4}
        style={{ objectFit: "contain" }}
        onError={() => setFailed(true)}
      />
    </div>
  );
}

function getProvider(providerId: string | null): Provider | null {
  if (!providerId) return null;

  return (
    AVAILABLE_PROVIDERS.find((provider) => provider.id === providerId) ?? {
      id: providerId,
      label: PROVIDER_LABELS[providerId] ?? providerId,
      description: "Manage connected accounts and authentication settings.",
      wave: 3,
      href: `/api/connections/oauth/${providerId}?label=${getPrimaryConnectionName(providerId)}`,
    }
  );
}

function getFirstString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed.length > 0 ? trimmed : null;
  }

  if (typeof value === "number") {
    return String(value);
  }

  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Record<string, unknown>;
  return (
    getFirstString(record.email) ??
    getFirstString(record.login) ??
    getFirstString(record.alias) ??
    getFirstString(record.team) ??
    getFirstString(record.workspace) ??
    getFirstString(record.name) ??
    getFirstString(record.hub_domain) ??
    getFirstString(record.user)
  );
}

function getConnectionIdentity(metadata: Record<string, unknown> | null, fallback: string): string {
  return (
    getFirstString(metadata?.email) ??
    getFirstString(metadata?.login) ??
    getFirstString(metadata?.alias) ??
    getFirstString(metadata?.team) ??
    getFirstString(metadata?.workspace) ??
    getFirstString(metadata?.name) ??
    getFirstString(metadata?.hub_domain) ??
    getFirstString(metadata?.user) ??
    fallback
  );
}

function formatDate(value: string | null): string | null {
  if (!value) return null;

  return new Date(value).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function sortConnections(left: Connection, right: Connection): number {
  const leftIsPrimary = isPrimaryConnectionName(left.provider, left.name);
  const rightIsPrimary = isPrimaryConnectionName(right.provider, right.name);

  if (leftIsPrimary !== rightIsPrimary) {
    return leftIsPrimary ? -1 : 1;
  }

  const providerCompare = (PROVIDER_LABELS[left.provider] ?? left.provider).localeCompare(
    PROVIDER_LABELS[right.provider] ?? right.provider,
  );
  if (providerCompare !== 0) return providerCompare;

  return new Date(right.created_at).getTime() - new Date(left.created_at).getTime();
}

export default function ConnectionsPage() {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loading, setLoading] = useState(true);
  const [testing, setTesting] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [promoting, setPromoting] = useState<string | null>(null);
  const [connecting, setConnecting] = useState<string | null>(null);
  const [activeProviderId, setActiveProviderId] = useState<string | null>(null);
  const [activeSection, setActiveSection] = useState<SettingsSection>("overview");
  const [highlightedConnectionId, setHighlightedConnectionId] = useState<string | null>(null);
  const searchParams = useSearchParams();

  const successProvider = searchParams.get("connected");
  const errorCode = searchParams.get("error");

  const load = useCallback(async () => {
    setLoading(true);

    const response = await fetch("/api/connections");
    if (response.ok) {
      const data = (await response.json()) as Connection[];
      setConnections(data);
    }

    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const sortedConnections = useMemo(
    () => [...connections].sort(sortConnections),
    [connections],
  );

  const connectedProviders = useMemo(
    () => new Set(connections.map((connection) => connection.provider)),
    [connections],
  );

  const activeProvider = getProvider(activeProviderId);
  const activeProviderConnections = useMemo(
    () => sortedConnections.filter((connection) => connection.provider === activeProviderId),
    [activeProviderId, sortedConnections],
  );
  const activePrimaryConnection =
    activeProviderConnections.find((connection) =>
      isPrimaryConnectionName(connection.provider, connection.name),
    ) ?? null;
  const healthyConnectionCount = activeProviderConnections.filter((connection) => connection.is_valid).length;
  const attentionConnectionCount = activeProviderConnections.length - healthyConnectionCount;
  const latestValidatedAt = activeProviderConnections.reduce<string | null>((latest, connection) => {
    if (!connection.last_validated_at) return latest;
    if (!latest) return connection.last_validated_at;
    return new Date(connection.last_validated_at).getTime() > new Date(latest).getTime()
      ? connection.last_validated_at
      : latest;
  }, null);
  const activeSectionMeta =
    SETTINGS_NAV_ITEMS.find((item) => item.id === activeSection) ?? SETTINGS_NAV_ITEMS[0];

  useEffect(() => {
    if (!activeProviderId) return;
    setActiveSection("overview");
  }, [activeProviderId]);

  function openProvider(providerId: string, connectionId?: string) {
    setActiveProviderId(providerId);
    setHighlightedConnectionId(connectionId ?? null);
  }

  function closeProviderDialog() {
    setActiveProviderId(null);
    setHighlightedConnectionId(null);
  }

  async function handleTest(connectionId: string) {
    setTesting(connectionId);
    await fetch(`/api/connections/${connectionId}`, { method: "POST" });
    await load();
    setTesting(null);
  }

  async function handleDelete(connectionId: string) {
    setDeleting(connectionId);
    await fetch(`/api/connections/${connectionId}`, { method: "DELETE" });
    setConnections((previous) => previous.filter((connection) => connection.id !== connectionId));

    if (highlightedConnectionId === connectionId) {
      setHighlightedConnectionId(null);
    }

    setDeleting(null);
  }

  async function handleSetPrimary(connectionId: string) {
    setPromoting(connectionId);

    const response = await fetch(`/api/connections/${connectionId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "set_primary" }),
    });

    if (response.ok) {
      await load();
      setHighlightedConnectionId(connectionId);
    }

    setPromoting(null);
  }

  function handleConnect(provider: Provider, mode: "primary" | "secondary") {
    setConnecting(provider.id);

    const url = new URL(provider.href, window.location.origin);
    if (mode === "secondary") {
      const providerNames = connections
        .filter((connection) => connection.provider === provider.id)
        .map((connection) => connection.name);

      url.searchParams.set(
        "label",
        getNextSecondaryConnectionName(provider.id, providerNames),
      );
    } else {
      url.searchParams.set("label", getPrimaryConnectionName(provider.id));
    }

    window.location.href = `${url.pathname}${url.search}`;
  }

  function renderProviderEmptyState(
    title: string,
    description: string,
    actionLabel?: string,
  ) {
    if (!activeProvider) return null;

    return (
      <div className="rounded-2xl border border-dashed border-border bg-card/60 px-5 py-8 text-center">
        <p className="text-sm font-medium">{title}</p>
        <p className="mt-1 text-sm text-muted-foreground">{description}</p>
        {actionLabel && (
          <Button
            className="mt-4"
            disabled={connecting === activeProvider.id}
            onClick={() => handleConnect(activeProvider, "primary")}
          >
            {connecting === activeProvider.id ? "Connecting..." : actionLabel}
          </Button>
        )}
      </div>
    );
  }

  function renderAccountsSection() {
    if (!activeProvider) return null;
    if (activeProviderConnections.length === 0) {
      return renderProviderEmptyState(
        "No accounts connected yet",
        `Connect your first ${activeProvider.label} account to start using it in programs.`,
        `Connect ${activeProvider.label}`,
      );
    }

    return (
      <div className="space-y-3">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h3 className="text-sm font-semibold">Connected accounts</h3>
            <p className="text-sm text-muted-foreground">
              Manage every linked {activeProvider.label} account from one place.
            </p>
          </div>
          <Button
            variant="outline"
            disabled={connecting === activeProvider.id}
            onClick={() => handleConnect(activeProvider, "secondary")}
          >
            {connecting === activeProvider.id ? "Redirecting..." : "Add another account"}
          </Button>
        </div>

        {activeProviderConnections.map((connection) => {
          const isPrimary = isPrimaryConnectionName(connection.provider, connection.name);
          const identity = getConnectionIdentity(connection.metadata, connection.name);
          const lastTested = formatDate(connection.last_validated_at);
          const highlight = highlightedConnectionId === connection.id;

          return (
            <div
              key={connection.id}
              className={cn(
                "rounded-2xl border px-4 py-4 transition-colors",
                highlight ? "border-primary/50 bg-primary/5" : "border-border/70 bg-card",
              )}
            >
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-semibold">{identity}</p>
                    {isPrimary && <Badge variant="secondary">Primary</Badge>}
                    <Badge variant={connection.is_valid ? "success" : "destructive"}>
                      {connection.is_valid ? "Connected" : "Needs attention"}
                    </Badge>
                  </div>
                  <p className="break-all text-xs font-mono text-muted-foreground/70">
                    {connection.name}
                  </p>
                  <p className="text-xs text-muted-foreground/70">
                    {lastTested ? `Last tested ${lastTested}` : "Not tested yet"}
                    {Array.isArray(connection.scopes) && connection.scopes.length > 0
                      ? ` - ${connection.scopes.length} scope${connection.scopes.length === 1 ? "" : "s"}`
                      : ""}
                  </p>
                </div>

                <div className="flex flex-wrap gap-2 sm:justify-end">
                  {!isPrimary && (
                    <Button
                      size="sm"
                      variant="outline"
                      disabled={promoting === connection.id}
                      onClick={() => handleSetPrimary(connection.id)}
                    >
                      {promoting === connection.id ? "Saving..." : "Set primary"}
                    </Button>
                  )}
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={testing === connection.id}
                    onClick={() => handleTest(connection.id)}
                  >
                    {testing === connection.id ? "Testing..." : "Test"}
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    className="text-muted-foreground/70 hover:text-destructive"
                    disabled={deleting === connection.id}
                    onClick={() => handleDelete(connection.id)}
                  >
                    {deleting === connection.id ? "Disconnecting..." : "Disconnect"}
                  </Button>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  }

  function renderOverviewSection() {
    if (!activeProvider) return null;
    if (activeProviderConnections.length === 0) {
      return renderProviderEmptyState(
        "This connector is ready to set up",
        `Add a ${activeProvider.label} account, then pick which one should be used as the default for new program runs.`,
        `Connect ${activeProvider.label}`,
      );
    }

    return (
      <div className="space-y-6">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/60">
              Accounts
            </p>
            <p className="mt-2 text-lg font-semibold">{activeProviderConnections.length}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/60">
              Primary
            </p>
            <p className="mt-2 truncate text-sm font-medium">
              {activePrimaryConnection
                ? getConnectionIdentity(activePrimaryConnection.metadata, activePrimaryConnection.name)
                : "Not selected"}
            </p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/60">
              Health
            </p>
            <p className="mt-2 text-sm font-medium">
              {attentionConnectionCount > 0 ? `${attentionConnectionCount} need review` : "All connected accounts look healthy"}
            </p>
          </div>
        </div>

        <div className="rounded-2xl border border-border/70 bg-card px-5 py-4">
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div>
              <p className="text-sm font-semibold">Quick actions</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Jump straight to the area you need without hunting through the popup.
              </p>
            </div>
            <div className="flex flex-wrap gap-2">
              <Button size="sm" variant="outline" onClick={() => setActiveSection("accounts")}>
                Manage accounts
              </Button>
              <Button size="sm" variant="outline" onClick={() => setActiveSection("primary")}>
                Choose primary
              </Button>
              <Button size="sm" variant="outline" onClick={() => setActiveSection("health")}>
                Check health
              </Button>
            </div>
          </div>
        </div>

        {activePrimaryConnection && (
          <div className="rounded-2xl border border-primary/25 bg-primary/5 px-5 py-4">
            <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
              <div>
                <p className="text-sm font-semibold">Current primary account</p>
                <p className="mt-1 text-sm text-muted-foreground">
                  Programs using the default {activeProvider.label} connection will follow this account.
                </p>
              </div>
              <Badge variant={activePrimaryConnection.is_valid ? "success" : "destructive"}>
                {activePrimaryConnection.is_valid ? "Ready" : "Needs attention"}
              </Badge>
            </div>
            <p className="mt-3 text-sm font-medium">
              {getConnectionIdentity(activePrimaryConnection.metadata, activePrimaryConnection.name)}
            </p>
            <p className="mt-1 text-xs font-mono text-muted-foreground/70">
              {activePrimaryConnection.name}
            </p>
          </div>
        )}

        <div className="space-y-2">
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm font-semibold">Connected accounts</p>
            <Button
              size="sm"
              variant="outline"
              disabled={connecting === activeProvider.id}
              onClick={() => handleConnect(activeProvider, "secondary")}
            >
              {connecting === activeProvider.id ? "Redirecting..." : "Add another account"}
            </Button>
          </div>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
            {activeProviderConnections.map((connection) => {
              const isPrimary = isPrimaryConnectionName(connection.provider, connection.name);
              return (
                <div key={connection.id} className="rounded-xl border border-border/70 bg-card px-4 py-3">
                  <div className="flex items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {getConnectionIdentity(connection.metadata, connection.name)}
                    </p>
                    {isPrimary && <Badge variant="secondary">Primary</Badge>}
                  </div>
                  <p className="mt-1 truncate text-xs text-muted-foreground/70">
                    {connection.name}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  function renderPrimarySection() {
    if (!activeProvider) return null;
    if (activeProviderConnections.length === 0) {
      return renderProviderEmptyState(
        "No primary account yet",
        `Connect a ${activeProvider.label} account first, then you can choose which one should be primary.`,
        `Connect ${activeProvider.label}`,
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-border/70 bg-card px-5 py-4">
          <p className="text-sm font-semibold">How primary works</p>
          <p className="mt-1 text-sm text-muted-foreground">
            The primary account becomes the default {activeProvider.label} connection used anywhere the app refers to <span className="font-mono">{getPrimaryConnectionName(activeProvider.id)}</span>.
          </p>
        </div>

        {activePrimaryConnection && (
          <div className="rounded-2xl border border-primary/25 bg-primary/5 px-5 py-4">
            <p className="text-sm font-semibold">Current primary</p>
            <p className="mt-2 text-sm font-medium">
              {getConnectionIdentity(activePrimaryConnection.metadata, activePrimaryConnection.name)}
            </p>
            <p className="mt-1 text-xs font-mono text-muted-foreground/70">
              {activePrimaryConnection.name}
            </p>
          </div>
        )}

        <div className="space-y-3">
          <p className="text-sm font-semibold">Available accounts</p>
          {activeProviderConnections.map((connection) => {
            const isPrimary = isPrimaryConnectionName(connection.provider, connection.name);

            return (
              <div key={connection.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="truncate text-sm font-medium">
                      {getConnectionIdentity(connection.metadata, connection.name)}
                    </p>
                    {isPrimary && <Badge variant="secondary">Primary</Badge>}
                  </div>
                  <p className="mt-1 break-all text-xs font-mono text-muted-foreground/70">
                    {connection.name}
                  </p>
                </div>
                {!isPrimary ? (
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={promoting === connection.id}
                    onClick={() => handleSetPrimary(connection.id)}
                  >
                    {promoting === connection.id ? "Saving..." : "Make primary"}
                  </Button>
                ) : (
                  <Badge variant="success">Default account</Badge>
                )}
              </div>
            );
          })}
        </div>
      </div>
    );
  }

  function renderHealthSection() {
    if (!activeProvider) return null;
    if (activeProviderConnections.length === 0) {
      return renderProviderEmptyState(
        "Nothing to check yet",
        `Once you connect ${activeProvider.label}, you can review scopes and run live connection tests here.`,
        `Connect ${activeProvider.label}`,
      );
    }

    return (
      <div className="space-y-4">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
          <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/60">
              Healthy
            </p>
            <p className="mt-2 text-lg font-semibold">{healthyConnectionCount}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/60">
              Needs attention
            </p>
            <p className="mt-2 text-lg font-semibold">{attentionConnectionCount}</p>
          </div>
          <div className="rounded-xl border border-border/70 bg-card px-4 py-3">
            <p className="text-[11px] font-bold uppercase tracking-wide text-muted-foreground/60">
              Last check
            </p>
            <p className="mt-2 text-sm font-medium">
              {latestValidatedAt ? formatDate(latestValidatedAt) : "Not tested yet"}
            </p>
          </div>
        </div>

        <div className="space-y-3">
          {activeProviderConnections.map((connection) => (
            <div key={connection.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="truncate text-sm font-medium">
                    {getConnectionIdentity(connection.metadata, connection.name)}
                  </p>
                  <Badge variant={connection.is_valid ? "success" : "destructive"}>
                    {connection.is_valid ? "Connected" : "Needs attention"}
                  </Badge>
                </div>
                <p className="mt-1 text-xs text-muted-foreground/70">
                  {connection.last_validated_at
                    ? `Tested ${formatDate(connection.last_validated_at)}`
                    : "Not tested yet"}
                  {Array.isArray(connection.scopes) && connection.scopes.length > 0
                    ? ` - ${connection.scopes.join(", ")}`
                    : " - scopes unavailable"}
                </p>
              </div>
              <Button
                size="sm"
                variant="outline"
                disabled={testing === connection.id}
                onClick={() => handleTest(connection.id)}
              >
                {testing === connection.id ? "Testing..." : "Run test"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  function renderDangerSection() {
    if (!activeProvider) return null;
    if (activeProviderConnections.length === 0) {
      return renderProviderEmptyState(
        "No connected accounts to remove",
        `Disconnecting options for ${activeProvider.label} will appear here once an account has been added.`,
        `Connect ${activeProvider.label}`,
      );
    }

    return (
      <div className="space-y-4">
        <div className="rounded-2xl border border-destructive/30 bg-destructive/5 px-5 py-4">
          <p className="text-sm font-semibold text-destructive">Disconnect with care</p>
          <p className="mt-1 text-sm text-muted-foreground">
            Removing an account revokes it from future runs and may affect programs that still depend on it.
          </p>
        </div>

        <div className="space-y-3">
          {activeProviderConnections.map((connection) => (
            <div key={connection.id} className="flex flex-col gap-3 rounded-2xl border border-border/70 bg-card px-4 py-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="min-w-0">
                <p className="truncate text-sm font-medium">
                  {getConnectionIdentity(connection.metadata, connection.name)}
                </p>
                <p className="mt-1 break-all text-xs font-mono text-muted-foreground/70">
                  {connection.name}
                </p>
              </div>
              <Button
                size="sm"
                variant="destructive"
                disabled={deleting === connection.id}
                onClick={() => handleDelete(connection.id)}
              >
                {deleting === connection.id ? "Disconnecting..." : "Disconnect account"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-3xl font-black tracking-tight">Connections</h1>
        <p className="mt-1.5 text-sm text-muted-foreground">
          Click any connection to open its settings, review linked accounts, and manage which account is primary.
        </p>
      </div>

      {successProvider && (
        <div className="rounded-xl border border-green-500/20 bg-green-500/10 px-4 py-3 text-sm font-medium text-green-400">
          Connected {PROVIDER_LABELS[successProvider] ?? successProvider}.
        </div>
      )}

      {errorCode && (
        <div className="rounded-xl border border-red-500/20 bg-red-500/10 px-4 py-3 text-sm text-red-400">
          OAuth failed: {errorCode}. Please try again.
        </div>
      )}

      {!loading && sortedConnections.length > 0 && (
        <section className="space-y-2">
          <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
            Connected - {sortedConnections.length}
          </h2>
          <div className="overflow-hidden rounded-xl border border-border bg-card">
            {sortedConnections.map((connection, index) => {
              const isPrimary = isPrimaryConnectionName(connection.provider, connection.name);
              const identity = getConnectionIdentity(connection.metadata, connection.name);
              const testedLabel = formatDate(connection.last_validated_at);

              return (
                <button
                  key={connection.id}
                  type="button"
                  onClick={() => openProvider(connection.provider, connection.id)}
                  className={cn(
                    "flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-accent/30",
                    index > 0 && "border-t border-border/60",
                  )}
                >
                  <ProviderLogo provider={connection.provider} size={30} />
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="truncate text-sm font-semibold">{identity}</p>
                      {isPrimary && <Badge variant="secondary">Primary</Badge>}
                      <Badge variant={connection.is_valid ? "success" : "destructive"}>
                        {connection.is_valid ? "Connected" : "Needs attention"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-[11px] text-muted-foreground/70">
                      {(PROVIDER_LABELS[connection.provider] ?? connection.provider) + " - " + connection.name}
                      {testedLabel ? ` - tested ${testedLabel}` : ""}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground/60">
                    Manage
                  </span>
                </button>
              );
            })}
          </div>
        </section>
      )}

      {([1, 2] as const).map((wave) => {
        const providers = AVAILABLE_PROVIDERS.filter(
          (provider) => provider.wave === wave && !connectedProviders.has(provider.id),
        );
        if (providers.length === 0) return null;

        return (
          <section key={wave} className="space-y-2">
            <h2 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground/50">
              {wave === 1
                ? sortedConnections.length > 0
                  ? "Add more"
                  : "Available"
                : "More connectors"}
            </h2>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {providers.map((provider) => (
                <button
                  key={provider.id}
                  type="button"
                  onClick={() => openProvider(provider.id)}
                  className="group flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-3.5 text-left transition-all hover:border-border/80 hover:bg-accent/30"
                >
                  <ProviderLogo provider={provider.id} />
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold">{provider.label}</p>
                    <p className="truncate text-[11px] text-muted-foreground/60">
                      {provider.description}
                    </p>
                  </div>
                  <span className="shrink-0 text-xs font-medium text-muted-foreground/60">
                    View
                  </span>
                </button>
              ))}
            </div>
          </section>
        );
      })}

      <Dialog open={!!activeProvider} onOpenChange={(open) => { if (!open) closeProviderDialog(); }}>
        <DialogContent className="h-[78vh] max-h-[78vh] w-[calc(100vw-2rem)] max-w-5xl overflow-hidden p-0">
          {activeProvider && (
            <div className="grid h-full min-h-0 grid-cols-1 lg:grid-cols-[260px_minmax(0,1fr)]">
              <aside className="flex h-full min-h-0 flex-col border-b border-border/60 bg-muted/25 lg:border-b-0 lg:border-r">
                <div className="flex-1 overflow-y-auto px-4 py-5">
                  <div className="rounded-2xl border border-border/70 bg-card px-4 py-4">
                    <div className="flex items-center gap-3">
                      <ProviderLogo provider={activeProvider.id} size={38} />
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold">{activeProvider.label}</p>
                        <p className="truncate text-xs text-muted-foreground">
                          {activeProviderConnections.length === 0
                            ? "Not connected yet"
                            : `${activeProviderConnections.length} account${activeProviderConnections.length === 1 ? "" : "s"} linked`}
                        </p>
                      </div>
                    </div>
                  </div>

                  {(["Connection", "Management"] as const).map((group) => {
                    const items = SETTINGS_NAV_ITEMS.filter((item) => item.group === group);
                    if (items.length === 0) return null;

                    return (
                      <div key={group} className="mt-5 first:mt-6">
                        <p className="mb-2 px-2 text-[11px] font-bold uppercase tracking-[0.18em] text-muted-foreground/60">
                          {group}
                        </p>
                        <div className="space-y-1">
                          {items.map((item) => {
                            const Icon = item.icon;
                            const active = item.id === activeSection;

                            return (
                              <button
                                key={item.id}
                                type="button"
                                onClick={() => setActiveSection(item.id)}
                                className={cn(
                                  "flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-colors",
                                  active
                                    ? "bg-card text-foreground shadow-sm ring-1 ring-border"
                                    : "text-muted-foreground hover:bg-background/70 hover:text-foreground",
                                )}
                              >
                                <Icon className="h-4 w-4 shrink-0" />
                                <div className="min-w-0">
                                  <p className="truncate text-sm font-medium">{item.label}</p>
                                  <p className="truncate text-xs text-muted-foreground/75">
                                    {item.caption}
                                  </p>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>

                <div className="shrink-0 border-t border-border/60 px-4 pb-5 pt-4">
                  <Button
                    className="w-full"
                    variant={activeProviderConnections.length > 0 ? "outline" : "default"}
                    disabled={connecting === activeProvider.id}
                    onClick={() => handleConnect(activeProvider, activeProviderConnections.length > 0 ? "secondary" : "primary")}
                  >
                    <PlusCircle className="h-4 w-4" />
                    {connecting === activeProvider.id
                      ? "Redirecting..."
                      : activeProviderConnections.length > 0
                        ? "Add account"
                        : `Connect ${activeProvider.label}`}
                  </Button>
                </div>
              </aside>

              <div className="flex min-h-0 min-w-0 flex-col">
                <DialogHeader className="border-b border-border/60 bg-gradient-to-br from-primary/10 via-transparent to-transparent px-6 py-5">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <DialogTitle>{activeSectionMeta.label}</DialogTitle>
                      <DialogDescription className="mt-1 max-w-2xl">
                        {activeProvider.label} settings. {activeSectionMeta.caption}.
                      </DialogDescription>
                    </div>
                    <Badge variant="outline">
                      {activeProviderConnections.length === 0
                        ? "Not connected"
                        : `${activeProviderConnections.length} account${activeProviderConnections.length === 1 ? "" : "s"}`}
                    </Badge>
                  </div>
                </DialogHeader>

                <div className="min-h-0 flex-1 overflow-y-auto px-6 py-5">
                  {activeSection === "overview" && renderOverviewSection()}
                  {activeSection === "accounts" && renderAccountsSection()}
                  {activeSection === "primary" && renderPrimarySection()}
                  {activeSection === "health" && renderHealthSection()}
                  {activeSection === "danger" && renderDangerSection()}
                </div>

                <DialogFooter className="border-t border-border/60 px-6 py-4">
                  <Button variant="outline" onClick={closeProviderDialog}>
                    Close
                  </Button>
                  {activeProviderConnections.length > 0 && activeSection !== "accounts" && (
                    <Button variant="outline" onClick={() => setActiveSection("accounts")}>
                      Manage accounts
                    </Button>
                  )}
                </DialogFooter>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
