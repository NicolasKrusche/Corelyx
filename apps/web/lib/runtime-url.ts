const DEFAULT_RUNTIME_URL = "https://api.corelyx.app";

export function getRuntimeUrl(): string {
  const configured = process.env.NEXT_PUBLIC_RUNTIME_URL?.trim() || DEFAULT_RUNTIME_URL;
  return configured.replace(/\/+$/, "");
}
