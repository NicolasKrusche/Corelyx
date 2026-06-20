/**
 * Client-side glue between the Corelyx web app and the desktop (Tauri) shell.
 *
 * When the web app is loaded inside Corelyx Desktop, this auto-registers a device
 * for the logged-in session and hands the resulting token to the native Bridge —
 * so the user just logs in, with no token to copy. In a normal browser every
 * function here is an inert no-op (`isDesktop()` is false).
 */

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<unknown>;

interface TauriGlobal {
  core?: { invoke?: Invoke };
}

function tauri(): TauriGlobal | null {
  if (typeof window === "undefined") return null;
  return (window as unknown as { __TAURI__?: TauriGlobal }).__TAURI__ ?? null;
}

/** True only when running inside the desktop shell with IPC available. */
export function isDesktop(): boolean {
  return typeof tauri()?.core?.invoke === "function";
}

async function invoke<T>(cmd: string, args?: Record<string, unknown>): Promise<T> {
  const inv = tauri()?.core?.invoke;
  if (!inv) throw new Error("not running in the Corelyx desktop shell");
  return (await inv(cmd, args)) as T;
}

function detectPlatform(): string {
  if (typeof navigator === "undefined") return "unknown";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "macos";
  if (ua.includes("win")) return "windows";
  if (ua.includes("linux")) return "linux";
  return "unknown";
}

/**
 * Idempotent pairing handshake. Runs once after the app shell mounts:
 *   1. no-op outside the desktop shell;
 *   2. no-op if the Bridge already holds a token (get_status → paired);
 *   3. otherwise register a device for this session and hand the token to native.
 *
 * Silently does nothing if the user's plan lacks local-files access — the desktop
 * then behaves as a plain window onto the web app.
 */
export async function runDesktopHandshake(): Promise<void> {
  if (!isDesktop()) return;

  try {
    const status = await invoke<{ paired?: boolean }>("get_status");
    if (status?.paired) return;
  } catch {
    // get_status unavailable — fall through and try to register.
  }

  let res: Response;
  try {
    res = await fetch("/api/devices/register-self", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ platform: detectPlatform() }),
    });
  } catch {
    return;
  }
  if (!res.ok) return;

  const body = (await res.json().catch(() => null)) as
    | { token?: string; base_url?: string }
    | null;
  if (!body?.token) return;

  try {
    await invoke("set_device_token", {
      baseUrl: body.base_url ?? window.location.origin,
      token: body.token,
    });
  } catch {
    // Native rejected the handoff (e.g. IPC not permitted) — leave as a plain
    // web window; the user can still pair manually if needed.
  }
}
