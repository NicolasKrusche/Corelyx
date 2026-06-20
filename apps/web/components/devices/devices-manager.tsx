"use client";

import { useCallback, useEffect, useState } from "react";

interface Grant {
  id: string;
  device_id: string;
  path: string;
  permission: "read" | "read_write";
  created_at: string;
}

interface Device {
  id: string;
  name: string;
  platform: "macos" | "windows" | "linux" | "unknown";
  token_prefix: string;
  paired_at: string | null;
  last_seen_at: string | null;
  revoked_at: string | null;
  created_at: string;
  grants: Grant[];
}

const PLATFORM_LABEL: Record<Device["platform"], string> = {
  macos: "macOS",
  windows: "Windows",
  linux: "Linux",
  unknown: "Unknown",
};

function relativeSeen(iso: string | null): string {
  if (!iso) return "never";
  const diffMs = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.round(hrs / 24)}d ago`;
}

export function DevicesManager() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [newName, setNewName] = useState("");
  const [pairing, setPairing] = useState(false);
  // The plaintext token is returned exactly once on creation.
  const [freshToken, setFreshToken] = useState<{ deviceId: string; token: string } | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/devices");
      const body = (await res.json()) as { devices?: Device[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not load devices.");
      setDevices(body.devices ?? []);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not load devices.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function pairDevice() {
    const name = newName.trim();
    if (!name) return;
    setPairing(true);
    try {
      const res = await fetch("/api/devices", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ name }),
      });
      const body = (await res.json()) as { device?: Device; token?: string; error?: string };
      if (!res.ok || !body.device || !body.token)
        throw new Error(body.error ?? "Could not pair device.");
      setDevices((prev) => [body.device!, ...prev]);
      setFreshToken({ deviceId: body.device.id, token: body.token });
      setNewName("");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not pair device.");
    } finally {
      setPairing(false);
    }
  }

  async function revokeDevice(id: string) {
    if (!confirm("Revoke this device? Its token stops working immediately.")) return;
    const res = await fetch(`/api/devices/${id}`, { method: "DELETE" });
    if (res.ok) {
      setDevices((prev) =>
        prev.map((d) => (d.id === id ? { ...d, revoked_at: new Date().toISOString() } : d))
      );
    }
  }

  async function addGrant(deviceId: string, path: string, permission: Grant["permission"]) {
    const res = await fetch(`/api/devices/${deviceId}/grants`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ path, permission }),
    });
    const body = (await res.json()) as { grant?: Grant; error?: string };
    if (!res.ok || !body.grant) {
      setError(body.error ?? "Could not add folder.");
      return;
    }
    setDevices((prev) =>
      prev.map((d) => (d.id === deviceId ? { ...d, grants: [...d.grants, body.grant!] } : d))
    );
    setError(null);
  }

  async function removeGrant(deviceId: string, grantId: string) {
    const res = await fetch(`/api/devices/${deviceId}/grants/${grantId}`, { method: "DELETE" });
    if (res.ok) {
      setDevices((prev) =>
        prev.map((d) =>
          d.id === deviceId ? { ...d, grants: d.grants.filter((g) => g.id !== grantId) } : d
        )
      );
    }
  }

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-md border border-red-300/60 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/40 dark:text-red-300">
          {error}
        </div>
      )}

      {/* Download the desktop app */}
      <DownloadCard />

      {/* Add a device */}
      <div className="rounded-lg border border-border p-4">
        <h2 className="text-sm font-semibold">Add a device</h2>
        <p className="mt-1 text-xs text-muted-foreground">
          Open the Corelyx desktop app and sign in with this account — it pairs
          automatically and appears below. There&apos;s no token to copy.
        </p>
        <details className="mt-3">
          <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground">
            Advanced: create a pairing token manually
          </summary>
          <div className="mt-3 flex gap-2">
            <input
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              placeholder="e.g. Headless server"
              maxLength={80}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-ring"
            />
            <button
              onClick={() => void pairDevice()}
              disabled={pairing || !newName.trim()}
              className="rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background disabled:opacity-50"
            >
              {pairing ? "Creating…" : "Create token"}
            </button>
          </div>
          <p className="mt-2 text-[11px] text-muted-foreground">
            For a machine that can&apos;t open the app and sign in (a headless server).
            The token is shown once below — pass it to the Bridge&apos;s manual{" "}
            <code className="font-mono">pair</code> command.
          </p>
        </details>
      </div>

      {loading ? (
        <p className="text-xs text-muted-foreground animate-pulse">Loading devices…</p>
      ) : devices.length === 0 ? (
        <p className="text-sm text-muted-foreground">No devices paired yet.</p>
      ) : (
        <ul className="space-y-4">
          {devices.map((d) => (
            <DeviceCard
              key={d.id}
              device={d}
              freshToken={freshToken?.deviceId === d.id ? freshToken.token : null}
              onDismissToken={() => setFreshToken(null)}
              onRevoke={() => void revokeDevice(d.id)}
              onAddGrant={(path, perm) => void addGrant(d.id, path, perm)}
              onRemoveGrant={(grantId) => void removeGrant(d.id, grantId)}
            />
          ))}
        </ul>
      )}

      <FileHistory />
    </div>
  );
}

const OS_LABEL = { windows: "Windows", macos: "macOS", linux: "Linux" } as const;
type DownloadOS = keyof typeof OS_LABEL;

function detectOS(): DownloadOS {
  if (typeof navigator === "undefined") return "windows";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("linux") || ua.includes("x11")) return "linux";
  return "windows";
}

/**
 * Download the Corelyx desktop installer. Detects the visitor's OS for the
 * primary button and links the other builds. The /api/desktop/download route
 * 302s to the matching installer asset for the latest release.
 */
function DownloadCard() {
  const [os, setOs] = useState<DownloadOS>("windows");
  useEffect(() => setOs(detectOS()), []);
  const others = (Object.keys(OS_LABEL) as DownloadOS[]).filter((o) => o !== os);

  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <h2 className="text-sm font-semibold">Download Corelyx Desktop</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Install it on this machine, then sign in with this account — it pairs
        automatically and shows up below. It auto-updates from then on.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <a
          href={`/api/desktop/download?os=${os}`}
          className="inline-flex items-center gap-2 rounded-md bg-foreground px-4 py-2 text-sm font-medium text-background transition hover:opacity-90"
        >
          Download for {OS_LABEL[os]}
        </a>
        {others.map((o) => (
          <a
            key={o}
            href={`/api/desktop/download?os=${o}`}
            className="text-xs text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            {OS_LABEL[o]}
          </a>
        ))}
      </div>
    </div>
  );
}

interface FileChange {
  id: string;
  device_id: string;
  device_name: string;
  original_path: string;
  operation: string;
  size_bytes: number;
  existed: boolean;
  created_at: string;
  restored_at: string | null;
  expires_at: string | null;
}

function basename(p: string): string {
  const parts = p.split(/[\\/]/);
  return parts[parts.length - 1] || p;
}

/**
 * Recent local file changes the Bridge snapshotted, with a one-click rollback.
 * The snapshot bytes live on the device; restoring enqueues a `restore` op the
 * Bridge runs locally. Hidden entirely until there's at least one change.
 */
function FileHistory() {
  const [items, setItems] = useState<FileChange[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const res = await fetch("/api/devices/snapshots");
      const body = (await res.json()) as { snapshots?: FileChange[]; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not load file history.");
      setItems(body.snapshots ?? []);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load file history.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function restore(item: FileChange) {
    if (
      !confirm(
        `Roll "${basename(item.original_path)}" back to before this ${item.operation}? ` +
          `This overwrites the current file on ${item.device_name}.`
      )
    )
      return;
    setBusy(item.id);
    setErr(null);
    try {
      const res = await fetch(`/api/devices/snapshots/${item.id}/restore`, { method: "POST" });
      const body = (await res.json()) as { ok?: boolean; error?: string };
      if (!res.ok) throw new Error(body.error ?? "Could not restore.");
      setItems(
        (prev) =>
          prev?.map((i) =>
            i.id === item.id ? { ...i, restored_at: new Date().toISOString() } : i
          ) ?? null
      );
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not restore.");
    } finally {
      setBusy(null);
    }
  }

  // Don't render the section until there's history to show.
  if (items !== null && items.length === 0) return null;

  return (
    <div className="rounded-lg border border-border p-4">
      <h2 className="text-sm font-semibold">Recent file changes</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Corelyx snapshots a file before a workflow or agent changes it, so you can roll it back.
        Snapshots stay on the device and expire after 14 days.
      </p>
      {err && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{err}</p>}
      {items === null ? (
        <p className="mt-3 text-xs text-muted-foreground animate-pulse">Loading…</p>
      ) : (
        <ul className="mt-3 divide-y divide-border">
          {items.map((item) => {
            const expired = item.expires_at
              ? new Date(item.expires_at).getTime() < Date.now()
              : false;
            const done = Boolean(item.restored_at);
            return (
              <li key={item.id} className="flex items-center justify-between gap-3 py-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm" title={item.original_path}>
                    {item.original_path}
                  </p>
                  <p className="text-[11px] text-muted-foreground">
                    {item.existed ? item.operation : `created (${item.operation})`} ·{" "}
                    {item.device_name} · {relativeSeen(item.created_at)}
                    {done && " · restored"}
                  </p>
                </div>
                <button
                  onClick={() => void restore(item)}
                  disabled={busy === item.id || expired || done}
                  className="shrink-0 rounded-md border border-border px-3 py-1.5 text-xs font-medium hover:bg-accent disabled:opacity-50"
                  title={
                    expired
                      ? "Snapshot expired"
                      : done
                        ? "Already restored"
                        : "Roll this file back"
                  }
                >
                  {busy === item.id
                    ? "Restoring…"
                    : done
                      ? "Restored"
                      : expired
                        ? "Expired"
                        : "Restore"}
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

function DeviceCard({
  device,
  freshToken,
  onDismissToken,
  onRevoke,
  onAddGrant,
  onRemoveGrant,
}: {
  device: Device;
  freshToken: string | null;
  onDismissToken: () => void;
  onRevoke: () => void;
  onAddGrant: (path: string, permission: Grant["permission"]) => void;
  onRemoveGrant: (grantId: string) => void;
}) {
  const [path, setPath] = useState("");
  const [permission, setPermission] = useState<Grant["permission"]>("read");
  const revoked = Boolean(device.revoked_at);

  return (
    <li className={`rounded-lg border border-border p-4 ${revoked ? "opacity-60" : ""}`}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-sm font-semibold">
            {device.name}{" "}
            <span className="text-xs font-normal text-muted-foreground">
              · {PLATFORM_LABEL[device.platform]}
            </span>
          </p>
          <p className="text-xs text-muted-foreground">
            {revoked ? "Revoked" : `Last seen ${relativeSeen(device.last_seen_at)}`} ·{" "}
            <span className="font-mono">{device.token_prefix}</span>
          </p>
        </div>
        {!revoked && (
          <button
            onClick={onRevoke}
            className="rounded-md border border-border px-3 py-1 text-xs font-medium text-red-600 hover:bg-red-50 dark:text-red-400 dark:hover:bg-red-950/40"
          >
            Revoke
          </button>
        )}
      </div>

      {freshToken && (
        <div className="mt-3 rounded-md border border-amber-300/60 bg-amber-50 p-3 dark:border-amber-900/60 dark:bg-amber-950/30">
          <p className="text-xs font-medium text-amber-800 dark:text-amber-300">
            Copy this device token now — it will not be shown again.
          </p>
          <div className="mt-2 flex items-center gap-2">
            <code className="flex-1 overflow-x-auto rounded bg-background px-2 py-1 font-mono text-xs">
              {freshToken}
            </code>
            <button
              onClick={() => void navigator.clipboard?.writeText(freshToken)}
              className="rounded border border-border px-2 py-1 text-xs"
            >
              Copy
            </button>
            <button onClick={onDismissToken} className="rounded px-2 py-1 text-xs text-muted-foreground">
              Done
            </button>
          </div>
        </div>
      )}

      {!revoked && (
        <div className="mt-4">
          <p className="text-xs font-medium text-muted-foreground">Granted folders</p>
          {device.grants.length === 0 ? (
            <p className="mt-1 text-xs text-muted-foreground">
              No folders granted. This device can&apos;t touch any files yet.
            </p>
          ) : (
            <ul className="mt-2 space-y-1">
              {device.grants.map((g) => (
                <li key={g.id} className="flex items-center justify-between gap-2 text-xs">
                  <span className="truncate font-mono">{g.path}</span>
                  <span className="flex items-center gap-2">
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                      {g.permission === "read_write" ? "read/write" : "read"}
                    </span>
                    <button
                      onClick={() => onRemoveGrant(g.id)}
                      className="text-muted-foreground hover:text-red-600"
                      aria-label="Remove folder"
                    >
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          )}

          <div className="mt-3 flex gap-2">
            <input
              value={path}
              onChange={(e) => setPath(e.target.value)}
              placeholder="/Users/you/Documents/Invoices"
              maxLength={1024}
              className="flex-1 rounded-md border border-border bg-background px-3 py-2 text-xs font-mono outline-none focus:ring-2 focus:ring-ring"
            />
            <select
              value={permission}
              onChange={(e) => setPermission(e.target.value as Grant["permission"])}
              className="rounded-md border border-border bg-background px-2 py-2 text-xs"
            >
              <option value="read">Read</option>
              <option value="read_write">Read/write</option>
            </select>
            <button
              onClick={() => {
                if (path.trim()) {
                  onAddGrant(path.trim(), permission);
                  setPath("");
                }
              }}
              disabled={!path.trim()}
              className="rounded-md border border-border px-3 py-2 text-xs font-medium disabled:opacity-50"
            >
              Add
            </button>
          </div>
        </div>
      )}
    </li>
  );
}
