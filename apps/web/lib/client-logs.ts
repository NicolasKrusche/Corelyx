"use client";

export type ClientLogLevel = "info" | "warning" | "error";

export type ClientLogRow = {
  id: string;
  level: ClientLogLevel;
  source: string;
  event: string;
  status: string;
  message: string;
  details: unknown;
  duration_ms: number | null;
  program_id: string | null;
  run_id: string | null;
  created_at: string;
};

type ClientLogInput = {
  level: ClientLogLevel;
  source: string;
  event: string;
  status: string;
  message: string;
  details?: unknown;
  durationMs?: number | null;
  programId?: string | null;
  runId?: string | null;
};

const STORAGE_KEY = "corelyx:client_logs";
const CHANGE_EVENT = "corelyx:client_logs_changed";
const MAX_LOGS = 100;

function isBrowser() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function readClientLogs(): ClientLogRow[] {
  if (!isBrowser()) return [];

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function writeClientLog(input: ClientLogInput) {
  if (!isBrowser()) return;

  const row: ClientLogRow = {
    id: crypto.randomUUID(),
    level: input.level,
    source: input.source,
    event: input.event,
    status: input.status,
    message: input.message,
    details: input.details ?? null,
    duration_ms: input.durationMs ?? null,
    program_id: input.programId ?? null,
    run_id: input.runId ?? null,
    created_at: new Date().toISOString(),
  };

  const next = [row, ...readClientLogs()].slice(0, MAX_LOGS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function subscribeToClientLogs(onChange: () => void) {
  if (!isBrowser()) return () => undefined;

  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onChange();
  };

  window.addEventListener(CHANGE_EVENT, onChange);
  window.addEventListener("storage", handleStorage);

  return () => {
    window.removeEventListener(CHANGE_EVENT, onChange);
    window.removeEventListener("storage", handleStorage);
  };
}
