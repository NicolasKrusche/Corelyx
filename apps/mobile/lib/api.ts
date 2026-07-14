import { API_BASE_URL } from "./config";
import type {
  AgentDetail,
  AgentFlag,
  AgentListItem,
  ApprovalItem,
  Connection,
  CreditBalance,
  Entitlements,
  RunDetail,
  RunListItem,
  SidebarData,
} from "./types";

/**
 * Typed HTTP client for the Corelyx web API.
 *
 * All calls (except the register bootstrap) authenticate with the crlxmob_
 * device token as a Bearer; middleware resolves it to the user. A 401 means the
 * device was revoked ("sign out everywhere") — we surface it so the app can drop
 * to the login screen (the mobile analogue of web's SessionWatcher).
 */

let deviceToken: string | null = null;
let onUnauthorized: (() => void) | null = null;

export function setDeviceToken(token: string | null) {
  deviceToken = token;
}
export function setUnauthorizedHandler(fn: (() => void) | null) {
  onUnauthorized = fn;
}

export class ApiError extends Error {
  status: number;
  code?: string;
  constructor(message: string, status: number, code?: string) {
    super(message);
    this.status = status;
    this.code = code;
  }
}

async function request<T>(
  path: string,
  init: RequestInit & { auth?: "device" | "bearer" | "none"; bearer?: string } = {}
): Promise<T> {
  const { auth = "device", bearer, headers, ...rest } = init;
  const h: Record<string, string> = {
    Accept: "application/json",
    ...(headers as Record<string, string> | undefined),
  };
  if (rest.body && !h["Content-Type"]) h["Content-Type"] = "application/json";
  if (auth === "device" && deviceToken) h.Authorization = `Bearer ${deviceToken}`;
  if (auth === "bearer" && bearer) h.Authorization = `Bearer ${bearer}`;

  // Fail fast instead of buffering forever when the server is unreachable (wrong
  // LAN IP, server not running, firewall, no connectivity). RN's fetch has no
  // default timeout, so we impose one.
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15000);
  let res: Response;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, { ...rest, headers: h, signal: controller.signal });
  } catch (err) {
    clearTimeout(timeout);
    const aborted = err instanceof Error && err.name === "AbortError";
    throw new ApiError(
      aborted
        ? `Timed out reaching ${API_BASE_URL}. Is the Corelyx web server running and on the same network?`
        : `Can't reach ${API_BASE_URL}. Check the server URL and your connection.`,
      0,
      aborted ? "TIMEOUT" : "NETWORK"
    );
  }
  clearTimeout(timeout);

  if (res.status === 401 && auth === "device") {
    onUnauthorized?.();
  }

  const text = await res.text();
  const json = text ? safeParse(text) : null;
  if (!res.ok) {
    const message = (json && (json.error || json.message)) || `Request failed (${res.status})`;
    throw new ApiError(String(message), res.status, json?.code);
  }
  return json as T;
}

function safeParse(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export const api = {
  // ── Bootstrap / device ────────────────────────────────────────────────────
  registerDevice(
    accessToken: string,
    body: { platform: "ios" | "android"; name?: string; push_token?: string; two_factor_code?: string; install_id?: string }
  ) {
    // When the account has email 2FA on, the first call returns { needs_2fa }
    // and emails a code; call again with two_factor_code to mint the token.
    return request<
      | { device: { id: string; name: string; platform: string }; token: string; base_url: string }
      | { needs_2fa: true; channel: string; dev_code?: string }
    >("/api/mobile/register", { method: "POST", auth: "bearer", bearer: accessToken, body: JSON.stringify(body) });
  },
  uploadPushToken(pushToken: string) {
    return request<{ ok: true }>("/api/mobile/push-token", {
      method: "POST",
      body: JSON.stringify({ push_token: pushToken }),
    });
  },
  listDevices() {
    return request<{ devices: Array<{ id: string; name: string; platform: string; is_default_2fa: boolean; current: boolean }> }>(
      "/api/mobile/devices"
    );
  },
  revokeDevice(id: string) {
    return request<{ revoked: true }>(`/api/mobile/devices/${id}`, { method: "DELETE" });
  },

  // ── 2FA (Corelyx Guard) ─────────────────────────────────────────────────────
  approve2fa(challengeId: string, decision: "approve" | "deny") {
    return request<{ ok: true; decision: string }>("/api/auth/two-factor/approve", {
      method: "POST",
      body: JSON.stringify({ challenge_id: challengeId, decision }),
    });
  },
  pendingTwoFactor() {
    return request<{
      challenge: { id: string; requester_label: string | null; requester_ip: string | null; expires_at: string } | null;
    }>("/api/mobile/pending-2fa");
  },

  // ── Home / account ──────────────────────────────────────────────────────────
  sidebar() {
    return request<SidebarData>("/api/sidebar-data");
  },
  entitlements() {
    return request<Entitlements>("/api/entitlements");
  },
  creditBalance() {
    return request<CreditBalance>("/api/credits/balance");
  },
  connections() {
    return request<Connection[]>("/api/connections");
  },

  // ── Runs ──────────────────────────────────────────────────────────────────
  listRuns() {
    return request<{ runs: RunListItem[] }>("/api/runs");
  },
  getRun(id: string) {
    return request<RunDetail>(`/api/runs/${id}`);
  },
  cancelRun(id: string) {
    return request<{ run_id: string; status: string }>(`/api/runs/${id}/cancel`, { method: "POST" });
  },

  // ── Approvals + questions (same endpoint, split on context.kind) ─────────────
  listApprovals() {
    return request<{ approvals: ApprovalItem[] }>("/api/approvals");
  },
  decideApproval(id: string, decision: "approved" | "rejected", note?: string) {
    return request<{ success: true; decision: string }>(`/api/approvals/${id}`, {
      method: "POST",
      body: JSON.stringify({ decision, note }),
    });
  },
  answerQuestion(id: string, answer: string) {
    return request<{ ok: true; answered: boolean }>(`/api/agents/questions/${id}`, {
      method: "POST",
      body: JSON.stringify({ answer }),
    });
  },
  declineQuestion(id: string) {
    return request<{ ok: true; answered: boolean }>(`/api/agents/questions/${id}`, {
      method: "POST",
      body: JSON.stringify({ decline: true }),
    });
  },

  // ── Agents (Phase 2) ────────────────────────────────────────────────────────
  listAgents() {
    return request<{ agents: AgentListItem[]; flags: AgentFlag[] }>("/api/agents");
  },
  getAgent(id: string) {
    return request<AgentDetail>(`/api/agents/${id}`);
  },
  runAgent(id: string, dryRun = false) {
    return request<{ run_id: string; dry_run: boolean }>(`/api/agents/${id}/run`, {
      method: "POST",
      body: JSON.stringify({ dry_run: dryRun }),
    });
  },
  cloneAgent(id: string, adjustment?: string) {
    return request<{ agent: { id: string; name: string } }>(`/api/agents/${id}/clone`, {
      method: "POST",
      body: JSON.stringify({ adjustment }),
    });
  },
  resolveFlag(id: string, status: "kept" | "dismissed") {
    return request<{ flag: { id: string; status: string } }>(`/api/agents/flags/${id}`, {
      method: "PATCH",
      body: JSON.stringify({ status }),
    });
  },
};
